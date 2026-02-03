/**
 * Agent Orchestration Service
 *
 * Coordinates multi-stage prototype generation with:
 * - Parallel variant generation (2 at a time)
 * - Step-by-step file creation with progress tracking
 * - Checkpointing for resume capability
 * - Granular progress callbacks
 */

import { supabase, isSupabaseConfigured } from './supabase';
import { VirtualFS } from '../runtime/virtual-fs';
import { preparePrototypeHtml } from '../runtime/vx-runtime-bundle';
import { applyModificationsToHtml } from '../runtime/apply-modifications';
import type { ModificationsJson } from '../types/agentTypes';
import type { VariantPlan } from './variantPlanService';
import type { GeneratedFile, VariantApproach } from '../types/implementationScript';
import type {
  AgentProgress,
  AgentStepProgress,
  GenerateScriptResponse,
  GenerateFileResponse,
  GenerationContext,
  OrchestrationConfig,
  OrchestrationResult,
  AgentEvents,
  AgentProgressCallback,
  GenerationError,
} from '../types/agentTypes';
import { getAllSteps, GENERATION_STEPS, createGenerationError, formatGenerationError } from '../types/agentTypes';
import { saveCheckpoint, loadCheckpoints } from './checkpointService';
import {
  createCheckpointSession,
  getVariantId,
  updateVariantPhase,
  saveStepCheckpoint,
  saveVariantVirtualFS,
  updateSessionStatus,
  updateCurrentVariant,
  type CheckpointSession,
} from './generationCheckpointService';

// ============================================================================
// Types
// ============================================================================

// Map variant index to approach
const INDEX_TO_APPROACH: Record<number, VariantApproach> = {
  1: 'minimal',
  2: 'feature-rich',
  3: 'gamified',
  4: 'accessible',
};

// ============================================================================
// Auth Helpers
// ============================================================================

// Track when we last refreshed to avoid excessive refreshes
let lastTokenRefresh = 0;
const MIN_REFRESH_INTERVAL = 30000; // 30 seconds

/**
 * Get a fresh access token, refreshing if needed
 * This prevents 401 errors during long-running generation
 */
async function getFreshAccessToken(): Promise<string> {
  // First try to get the current session
  const { data: { session }, error } = await supabase.auth.getSession();

  if (error || !session) {
    throw new Error('Not authenticated');
  }

  // Check if token is about to expire (within 10 minutes - more aggressive)
  const expiresAt = session.expires_at ? session.expires_at * 1000 : 0;
  const tenMinutesFromNow = Date.now() + 10 * 60 * 1000;
  const timeSinceLastRefresh = Date.now() - lastTokenRefresh;

  // Refresh if:
  // 1. Token is expiring within 10 minutes, OR
  // 2. We haven't refreshed in the last 30 seconds (for safety during long operations)
  const shouldRefresh = expiresAt < tenMinutesFromNow ||
    (timeSinceLastRefresh > MIN_REFRESH_INTERVAL && expiresAt < Date.now() + 30 * 60 * 1000);

  if (shouldRefresh) {
    // Token is expiring soon, refresh it
    console.log('[AgentOrchestration] Refreshing token (expires in', Math.round((expiresAt - Date.now()) / 1000 / 60), 'min)');
    const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();

    if (refreshError || !refreshData.session) {
      console.error('[AgentOrchestration] Failed to refresh token:', refreshError);
      // Try to continue with the existing token if refresh fails
      console.log('[AgentOrchestration] Continuing with existing token');
      return session.access_token;
    }

    lastTokenRefresh = Date.now();
    console.log('[AgentOrchestration] Token refreshed successfully, new expiry in',
      Math.round((refreshData.session.expires_at! * 1000 - Date.now()) / 1000 / 60), 'min');
    return refreshData.session.access_token;
  }

  return session.access_token;
}

/**
 * Wrapper to retry a fetch with refreshed token on 401
 * Also adds timeout handling to prevent hanging requests
 */
async function fetchWithTokenRetry(
  url: string,
  options: RequestInit,
  retries = 1,
  timeoutMs = 120000 // 2 minute timeout (edge functions have 60-150s limit)
): Promise<Response> {
  const token = await getFreshAccessToken();

  // Create timeout controller
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs);

  // Combine with existing abort signal if present
  const combinedSignal = options.signal
    ? anySignal([options.signal, timeoutController.signal])
    : timeoutController.signal;

  try {
    const response = await fetch(url, {
      ...options,
      signal: combinedSignal,
      headers: {
        ...options.headers,
        'Authorization': `Bearer ${token}`,
      },
    });

    clearTimeout(timeoutId);

    // If 401 and we have retries left, force refresh and retry
    if (response.status === 401 && retries > 0) {
      console.log('[AgentOrchestration] Got 401, forcing token refresh and retry...');
      lastTokenRefresh = 0; // Force refresh
      const newToken = await getFreshAccessToken();

      const retryTimeoutController = new AbortController();
      const retryTimeoutId = setTimeout(() => retryTimeoutController.abort(), timeoutMs);
      const retryCombinedSignal = options.signal
        ? anySignal([options.signal, retryTimeoutController.signal])
        : retryTimeoutController.signal;

      try {
        const retryResponse = await fetch(url, {
          ...options,
          signal: retryCombinedSignal,
          headers: {
            ...options.headers,
            'Authorization': `Bearer ${newToken}`,
          },
        });
        clearTimeout(retryTimeoutId);
        return retryResponse;
      } catch (retryError) {
        clearTimeout(retryTimeoutId);
        throw retryError;
      }
    }

    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      // Check if it was our timeout or user cancellation
      if (options.signal?.aborted) {
        throw new GenerationAbortedError();
      }
      throw new Error(`Request timed out after ${timeoutMs / 1000}s`);
    }
    throw error;
  }
}

/**
 * Combine multiple AbortSignals into one
 */
function anySignal(signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort();
      return controller.signal;
    }
    signal.addEventListener('abort', () => controller.abort(), { once: true });
  }
  return controller.signal;
}

// ============================================================================
// Edge Function Callers
// ============================================================================

// Custom error for abort
export class GenerationAbortedError extends Error {
  constructor() {
    super('Generation was stopped by user');
    this.name = 'GenerationAbortedError';
  }
}

async function callGenerateImplementationScript(
  plan: VariantPlan,
  context: GenerationContext,
  approach: VariantApproach,
  _accessToken: string, // Kept for backwards compatibility, but we get fresh token
  abortSignal?: AbortSignal
): Promise<GenerateScriptResponse> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const functionUrl = `${supabaseUrl}/functions/v1/generate-implementation-script`;

  // Log what we're sending to the LLM
  console.log('[AgentOrchestration] 📤 Calling generate-implementation-script:', {
    variantIndex: plan.variant_index,
    approach,
    planTitle: plan.title,
    hasUnderstanding: !!context.understanding,
    designTokensCount: context.designTokens?.length || 0,
    hasUiMetadata: !!context.uiMetadata,
    productContextLength: context.productContext?.length || 0,
    hasScreenshot: !!context.screenshotBase64,
    screenshotSize: context.screenshotBase64 ? `${Math.round(context.screenshotBase64.length / 1024)}KB` : 'none',
    sourceHtmlLength: context.sourceHtml?.length || 0,
    provider: context.provider,
    model: context.model,
  });

  const response = await fetchWithTokenRetry(functionUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      variantPlan: plan,
      screenUnderstanding: context.understanding,
      designTokens: context.designTokens,
      uiMetadata: context.uiMetadata,
      productContext: context.productContext,
      variantApproach: approach,
      provider: context.provider,
      model: context.model,
      // Also send screenshot for vision-based understanding
      screenshotBase64: context.screenshotBase64,
    }),
    signal: abortSignal,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error?.error || `Failed to generate implementation script: ${response.status}`);
  }

  return response.json();
}

async function callGeneratePrototypeFile(
  fileType: 'tokens.css' | 'store.json' | 'flows.json' | 'component' | 'index.html' | 'modifications.json',
  implementationScript: GenerateScriptResponse,
  approach: VariantApproach,
  context: GenerationContext,
  _accessToken: string, // Kept for backwards compatibility, but we get fresh token
  options?: {
    componentName?: string;
    previousFiles?: Array<{ path: string; exports?: string[]; summary?: string }>;
    abortSignal?: AbortSignal;
  }
): Promise<GenerateFileResponse> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const functionUrl = `${supabaseUrl}/functions/v1/generate-prototype-file`;

  // Reduce source HTML to prevent timeout - 25KB is enough for design context
  const sourceHtmlToSend = fileType === 'index.html' ? context.sourceHtml?.slice(0, 25000) : undefined;
  // Skip screenshot for index.html to reduce payload and speed up generation
  const screenshotToSend: string | undefined = undefined;

  // Log what we're sending to the LLM
  console.log(`[AgentOrchestration] 📤 Calling generate-prototype-file (${fileType}):`, {
    fileType,
    approach,
    componentName: options?.componentName || 'N/A',
    componentsNeeded: implementationScript.componentsNeeded,
    entryPointsCount: implementationScript.entryPoints?.length || 0,
    flowsCount: implementationScript.flows?.length || 0,
    designTokensCount: context.designTokens?.length || 0,
    previousFilesCount: options?.previousFiles?.length || 0,
    sourceHtmlLength: sourceHtmlToSend?.length || 0,
    hasScreenshot: false,
    screenshotSize: 'disabled',
    provider: context.provider,
    model: context.model,
  });

  // For index.html, log a preview of what entry points and flows we're asking for
  if (fileType === 'index.html') {
    console.log('[AgentOrchestration] 📋 Entry points for index.html:', implementationScript.entryPoints);
    console.log('[AgentOrchestration] 📋 Flows for index.html:', implementationScript.flows?.map(f => ({ name: f.name, description: f.description })));
    console.log('[AgentOrchestration] 📋 Initial state:', implementationScript.initialState);
  }

  const response = await fetchWithTokenRetry(functionUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      fileType,
      implementationScript,
      variantApproach: approach,
      designTokens: context.designTokens,
      componentName: options?.componentName,
      previousFiles: options?.previousFiles,
      sourceHtml: sourceHtmlToSend,
      screenshotBase64: screenshotToSend,
      provider: context.provider,
      model: context.model,
      productContext: context.productContext,
    }),
    signal: options?.abortSignal,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error?.error || `Failed to generate ${fileType}: ${response.status}`);
  }

  return response.json();
}

// ============================================================================
// Progress Helpers
// ============================================================================

function createInitialProgress(
  variantIndex: number,
  plan: VariantPlan,
  approach: VariantApproach
): AgentProgress {
  return {
    variantIndex,
    variantTitle: plan.title,
    approach,
    phase: 'queued',
    currentStep: 'Waiting to start...',
    completedSteps: 0,
    totalSteps: GENERATION_STEPS.length, // Will be updated when we know components
    filesCompleted: [],
    steps: GENERATION_STEPS.map(step => ({
      stepKey: step.key,
      label: step.label,
      status: 'pending',
    })),
  };
}

function updateProgress(
  progress: AgentProgress,
  updates: Partial<AgentProgress>
): AgentProgress {
  return { ...progress, ...updates };
}

function updateStepInProgress(
  progress: AgentProgress,
  stepKey: string,
  updates: Partial<AgentStepProgress>
): AgentProgress {
  return {
    ...progress,
    steps: progress.steps.map(step =>
      step.stepKey === stepKey ? { ...step, ...updates } : step
    ),
  };
}

// ============================================================================
// Variant Generation
// ============================================================================

// Helper to check abort signal
function checkAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new GenerationAbortedError();
  }
}

async function generateVariant(
  plan: VariantPlan,
  context: GenerationContext,
  config: OrchestrationConfig,
  accessToken: string,
  onProgress: (progress: AgentProgress) => void,
  events?: AgentEvents,
  checkpointSessionId?: string | null
): Promise<{ files: GeneratedFile[]; implementationScript: GenerateScriptResponse }> {
  const variantIndex = plan.variant_index;
  const approach = INDEX_TO_APPROACH[variantIndex] || 'minimal';
  const abortSignal = config.abortSignal;

  // Check if already aborted before starting
  checkAborted(abortSignal);

  let progress = createInitialProgress(variantIndex, plan, approach);
  progress = updateProgress(progress, { phase: 'script', startedAt: Date.now() });
  onProgress(progress);

  events?.onVariantStart?.(variantIndex, approach);

  // Get Supabase variant ID for checkpoint saves
  let serverVariantId: string | null = null;
  if (checkpointSessionId && config.enableCheckpoints) {
    serverVariantId = await getVariantId(checkpointSessionId, variantIndex);
    if (serverVariantId) {
      await updateVariantPhase(serverVariantId, 'script', 'Designing behavior...');
    }
  }

  const generatedFiles: GeneratedFile[] = [];
  const previousFiles: Array<{ path: string; exports?: string[]; summary?: string }> = [];

  // Step 1: Generate implementation script
  const scriptStepKey = 'implementation_script';
  progress = updateStepInProgress(progress, scriptStepKey, { status: 'in_progress' });
  progress = updateProgress(progress, { currentStep: 'Designing behavior...' });
  onProgress(progress);

  events?.onStepStart?.(variantIndex, scriptStepKey, 'Design behavior');

  const scriptStartTime = Date.now();
  let implementationScript: GenerateScriptResponse;

  try {
    checkAborted(abortSignal);
    implementationScript = await callGenerateImplementationScript(plan, context, approach, accessToken, abortSignal);

    // Save checkpoint if enabled (local IndexedDB)
    if (config.enableCheckpoints) {
      await saveCheckpoint(context.sessionId, variantIndex, scriptStepKey, implementationScript);
    }

    // Save to Supabase for page refresh recovery
    if (serverVariantId) {
      await saveStepCheckpoint(
        serverVariantId,
        scriptStepKey,
        'Design behavior',
        'completed',
        undefined,
        Date.now() - scriptStartTime
      );
    }

    progress = updateStepInProgress(progress, scriptStepKey, {
      status: 'completed',
      duration: Date.now() - scriptStartTime,
    });
    progress = updateProgress(progress, { completedSteps: progress.completedSteps + 1 });
    onProgress(progress);

    events?.onStepComplete?.(variantIndex, scriptStepKey, Date.now() - scriptStartTime);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Script generation failed';
    progress = updateStepInProgress(progress, scriptStepKey, { status: 'failed', error: errorMessage });
    progress = updateProgress(progress, { phase: 'failed', error: errorMessage });
    onProgress(progress);
    events?.onStepFail?.(variantIndex, scriptStepKey, errorMessage);

    // Save failure to Supabase
    if (serverVariantId) {
      await updateVariantPhase(serverVariantId, 'failed', undefined, errorMessage);
    }
    throw error;
  }

  // Update steps with component steps now that we know componentsNeeded
  const allSteps = getAllSteps(implementationScript.componentsNeeded);
  progress = updateProgress(progress, {
    totalSteps: allSteps.length,
    steps: allSteps.map(step => ({
      stepKey: step.key,
      label: step.label,
      status: step.key === scriptStepKey ? 'completed' : 'pending',
      duration: step.key === scriptStepKey ? Date.now() - scriptStartTime : undefined,
    })),
    phase: 'files',
  });
  onProgress(progress);

  // Update server phase to 'files'
  if (serverVariantId) {
    await updateVariantPhase(serverVariantId, 'files', 'Creating design tokens...');
  }

  // Step 2a: Generate tokens.css (no LLM)
  const tokensStepKey = 'tokens_css';
  progress = updateStepInProgress(progress, tokensStepKey, { status: 'in_progress' });
  progress = updateProgress(progress, { currentStep: 'Creating design tokens...' });
  onProgress(progress);

  events?.onStepStart?.(variantIndex, tokensStepKey, 'Create design tokens');

  const tokensStartTime = Date.now();
  try {
    checkAborted(abortSignal);
    const tokensResult = await callGeneratePrototypeFile(
      'tokens.css',
      implementationScript,
      approach,
      context,
      accessToken,
      { abortSignal }
    );
    const tokensFile = {
      path: tokensResult.path,
      content: tokensResult.content,
      type: tokensResult.type,
    };
    generatedFiles.push(tokensFile);
    previousFiles.push({
      path: tokensResult.path,
      summary: tokensResult.summary,
    });

    // Emit file generated event for progressive preview
    events?.onFileGenerated?.(variantIndex, tokensFile, [...generatedFiles]);

    // Save step to Supabase with file content
    if (serverVariantId) {
      await saveStepCheckpoint(
        serverVariantId,
        tokensStepKey,
        'Create design tokens',
        'completed',
        { path: tokensResult.path, content: tokensResult.content, type: tokensResult.type },
        Date.now() - tokensStartTime
      );
    }

    progress = updateStepInProgress(progress, tokensStepKey, {
      status: 'completed',
      duration: Date.now() - tokensStartTime,
      filePath: tokensResult.path,
    });
    progress = updateProgress(progress, {
      completedSteps: progress.completedSteps + 1,
      filesCompleted: [...progress.filesCompleted, tokensResult.path],
    });
    onProgress(progress);

    events?.onStepComplete?.(variantIndex, tokensStepKey, Date.now() - tokensStartTime);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Tokens generation failed';
    progress = updateStepInProgress(progress, tokensStepKey, { status: 'failed', error: errorMessage });
    // Non-critical, continue
    events?.onStepFail?.(variantIndex, tokensStepKey, errorMessage);
  }

  // Step 2b: Generate store.json (no LLM)
  const storeStepKey = 'store_json';
  progress = updateStepInProgress(progress, storeStepKey, { status: 'in_progress' });
  progress = updateProgress(progress, { currentStep: 'Setting up state...' });
  onProgress(progress);

  events?.onStepStart?.(variantIndex, storeStepKey, 'Set up state');

  const storeStartTime = Date.now();
  try {
    checkAborted(abortSignal);
    const storeResult = await callGeneratePrototypeFile(
      'store.json',
      implementationScript,
      approach,
      context,
      accessToken,
      { abortSignal }
    );
    const storeFile = {
      path: storeResult.path,
      content: storeResult.content,
      type: storeResult.type,
    };
    generatedFiles.push(storeFile);
    previousFiles.push({
      path: storeResult.path,
      summary: storeResult.summary,
    });

    // Emit file generated event for progressive preview
    events?.onFileGenerated?.(variantIndex, storeFile, [...generatedFiles]);

    // Save step to Supabase with file content
    if (serverVariantId) {
      await saveStepCheckpoint(
        serverVariantId,
        storeStepKey,
        'Set up state',
        'completed',
        { path: storeResult.path, content: storeResult.content, type: storeResult.type },
        Date.now() - storeStartTime
      );
    }

    progress = updateStepInProgress(progress, storeStepKey, {
      status: 'completed',
      duration: Date.now() - storeStartTime,
      filePath: storeResult.path,
    });
    progress = updateProgress(progress, {
      completedSteps: progress.completedSteps + 1,
      filesCompleted: [...progress.filesCompleted, storeResult.path],
    });
    onProgress(progress);

    events?.onStepComplete?.(variantIndex, storeStepKey, Date.now() - storeStartTime);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Store generation failed';
    progress = updateStepInProgress(progress, storeStepKey, { status: 'failed', error: errorMessage });
    events?.onStepFail?.(variantIndex, storeStepKey, errorMessage);
  }

  // Step 2c: Generate flows.json (minimal LLM)
  const flowsStepKey = 'flows_json';
  progress = updateStepInProgress(progress, flowsStepKey, { status: 'in_progress' });
  progress = updateProgress(progress, { currentStep: 'Configuring flows...' });
  onProgress(progress);

  events?.onStepStart?.(variantIndex, flowsStepKey, 'Configure flows');

  const flowsStartTime = Date.now();
  try {
    checkAborted(abortSignal);
    const flowsResult = await callGeneratePrototypeFile(
      'flows.json',
      implementationScript,
      approach,
      context,
      accessToken,
      { abortSignal }
    );
    const flowsFile = {
      path: flowsResult.path,
      content: flowsResult.content,
      type: flowsResult.type,
    };
    generatedFiles.push(flowsFile);
    previousFiles.push({
      path: flowsResult.path,
      summary: flowsResult.summary,
    });

    // Emit file generated event for progressive preview
    events?.onFileGenerated?.(variantIndex, flowsFile, [...generatedFiles]);

    if (config.enableCheckpoints) {
      await saveCheckpoint(context.sessionId, variantIndex, flowsStepKey, flowsResult);
    }

    // Save step to Supabase with file content
    if (serverVariantId) {
      await saveStepCheckpoint(
        serverVariantId,
        flowsStepKey,
        'Configure flows',
        'completed',
        { path: flowsResult.path, content: flowsResult.content, type: flowsResult.type },
        Date.now() - flowsStartTime
      );
    }

    progress = updateStepInProgress(progress, flowsStepKey, {
      status: 'completed',
      duration: Date.now() - flowsStartTime,
      filePath: flowsResult.path,
    });
    progress = updateProgress(progress, {
      completedSteps: progress.completedSteps + 1,
      filesCompleted: [...progress.filesCompleted, flowsResult.path],
    });
    onProgress(progress);

    events?.onStepComplete?.(variantIndex, flowsStepKey, Date.now() - flowsStartTime);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Flows generation failed';
    progress = updateStepInProgress(progress, flowsStepKey, { status: 'failed', error: errorMessage });
    events?.onStepFail?.(variantIndex, flowsStepKey, errorMessage);
    // Continue - flows are important but we can still generate with fallback
  }

  // Step 2d: Generate components (LLM per component)
  for (const componentName of implementationScript.componentsNeeded) {
    const componentStepKey = `component_${componentName}`;
    progress = updateStepInProgress(progress, componentStepKey, { status: 'in_progress' });
    progress = updateProgress(progress, {
      currentStep: `Building ${componentName}...`,
      currentFile: `components/${componentName}.js`,
    });
    onProgress(progress);

    events?.onStepStart?.(variantIndex, componentStepKey, `Build ${componentName}`);

    const componentStartTime = Date.now();
    try {
      checkAborted(abortSignal);
      const componentResult = await callGeneratePrototypeFile(
        'component',
        implementationScript,
        approach,
        context,
        accessToken,
        { componentName, previousFiles, abortSignal }
      );
      const componentFile = {
        path: componentResult.path,
        content: componentResult.content,
        type: componentResult.type,
      };
      generatedFiles.push(componentFile);
      previousFiles.push({
        path: componentResult.path,
        exports: componentResult.exports,
        summary: componentResult.summary,
      });

      // Emit file generated event for progressive preview
      events?.onFileGenerated?.(variantIndex, componentFile, [...generatedFiles]);

      if (config.enableCheckpoints) {
        await saveCheckpoint(context.sessionId, variantIndex, componentStepKey, componentResult);
      }

      // Save step to Supabase with file content
      if (serverVariantId) {
        await saveStepCheckpoint(
          serverVariantId,
          componentStepKey,
          `Build ${componentName}`,
          'completed',
          { path: componentResult.path, content: componentResult.content, type: componentResult.type },
          Date.now() - componentStartTime
        );
      }

      progress = updateStepInProgress(progress, componentStepKey, {
        status: 'completed',
        duration: Date.now() - componentStartTime,
        filePath: componentResult.path,
      });
      progress = updateProgress(progress, {
        completedSteps: progress.completedSteps + 1,
        filesCompleted: [...progress.filesCompleted, componentResult.path],
      });
      onProgress(progress);

      events?.onStepComplete?.(variantIndex, componentStepKey, Date.now() - componentStartTime);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : `${componentName} generation failed`;
      progress = updateStepInProgress(progress, componentStepKey, { status: 'failed', error: errorMessage });
      events?.onStepFail?.(variantIndex, componentStepKey, errorMessage);
      // Continue with other components
    }
  }

  // Step 2e: Generate index.html (LLM) or modifications.json (smaller LLM call)
  const useModifications = config.useModificationsAssembly === true;
  const indexStepKey = 'index_html';
  progress = updateStepInProgress(progress, indexStepKey, { status: 'in_progress' });
  progress = updateProgress(progress, {
    currentStep: useModifications ? 'Creating modifications...' : 'Assembling prototype...',
    currentFile: useModifications ? 'modifications.json' : 'index.html',
    phase: 'assembly',
  });
  onProgress(progress);

  // Update server phase to 'assembly'
  if (serverVariantId) {
    await updateVariantPhase(serverVariantId, 'assembly', useModifications ? 'Creating modifications...' : 'Assembling prototype...');
  }

  events?.onStepStart?.(variantIndex, indexStepKey, useModifications ? 'Create modifications' : 'Assemble prototype');

  const indexStartTime = Date.now();
  console.log(`[AgentOrchestration] ⏳ Variant ${variantIndex}: Starting ${useModifications ? 'modifications.json' : 'index.html'} generation...`);

  try {
    checkAborted(abortSignal);

    let htmlWithRuntime: string;

    if (useModifications) {
      // Modifications-based assembly: generate small JSON spec and apply to source HTML
      const modificationsPromise = callGeneratePrototypeFile(
        'modifications.json',
        implementationScript,
        approach,
        context,
        accessToken,
        { previousFiles, abortSignal }
      );

      const hardTimeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error('modifications.json generation timed out after 60 seconds'));
        }, 60000); // 60 second timeout (should be faster than index.html)
      });

      const modificationsResult = await Promise.race([modificationsPromise, hardTimeoutPromise]);
      console.log(`[AgentOrchestration] ✅ Variant ${variantIndex}: modifications.json generated in ${Math.round((Date.now() - indexStartTime) / 1000)}s`);

      // Parse the modifications JSON
      const modifications: ModificationsJson = JSON.parse(modificationsResult.content);

      // Get tokens CSS if available
      const tokensFile = generatedFiles.find(f => f.path.endsWith('tokens.css'));
      const tokensCss = tokensFile?.content;

      // Apply modifications to source HTML
      const modifiedHtml = applyModificationsToHtml(context.sourceHtml, modifications, tokensCss);

      // Prepare with runtime and components
      const componentFiles = generatedFiles
        .filter(f => f.path.startsWith('components/') && f.path.endsWith('.js'))
        .map(f => ({ path: f.path, content: f.content }));

      htmlWithRuntime = preparePrototypeHtml(modifiedHtml, componentFiles);

      // Also save the modifications.json file
      generatedFiles.push({
        path: modificationsResult.path,
        content: modificationsResult.content,
        type: 'json',
      });
    } else {
      // Traditional approach: generate full index.html
      const indexPromise = callGeneratePrototypeFile(
        'index.html',
        implementationScript,
        approach,
        context,
        accessToken,
        { previousFiles, abortSignal }
      );

      const hardTimeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error('index.html generation timed out after 90 seconds'));
        }, 90000); // 90 second hard timeout
      });

      const indexResult = await Promise.race([indexPromise, hardTimeoutPromise]);
      console.log(`[AgentOrchestration] ✅ Variant ${variantIndex}: index.html generated in ${Math.round((Date.now() - indexStartTime) / 1000)}s`);

      // Prepare the HTML for blob URL preview:
      // 1. Inject the VxRuntime bundle (self-contained, no external imports)
      // 2. Inject all component scripts inline (ES modules don't work with blob URLs)
      const componentFiles = generatedFiles
        .filter(f => f.path.startsWith('components/') && f.path.endsWith('.js'))
        .map(f => ({ path: f.path, content: f.content }));

      htmlWithRuntime = preparePrototypeHtml(indexResult.content, componentFiles);
    }

    generatedFiles.push({
      path: 'index.html',
      content: htmlWithRuntime,
      type: 'html',
    });

    if (config.enableCheckpoints) {
      // Save checkpoint with the runtime-injected HTML
      await saveCheckpoint(context.sessionId, variantIndex, indexStepKey, {
        path: 'index.html',
        content: htmlWithRuntime,
        type: 'html',
      });
    }

    // Save step to Supabase with file content (use htmlWithRuntime which includes the bundled runtime)
    if (serverVariantId) {
      await saveStepCheckpoint(
        serverVariantId,
        indexStepKey,
        useModifications ? 'Create modifications' : 'Assemble prototype',
        'completed',
        { path: 'index.html', content: htmlWithRuntime, type: 'html' },
        Date.now() - indexStartTime
      );

      // Save final VirtualFS and mark variant as complete
      await saveVariantVirtualFS(serverVariantId, generatedFiles);
    }

    progress = updateStepInProgress(progress, indexStepKey, {
      status: 'completed',
      duration: Date.now() - indexStartTime,
      filePath: 'index.html',
    });
    progress = updateProgress(progress, {
      completedSteps: progress.completedSteps + 1,
      filesCompleted: [...progress.filesCompleted, 'index.html'],
      phase: 'complete',
      completedAt: Date.now(),
    });
    onProgress(progress);

    events?.onStepComplete?.(variantIndex, indexStepKey, Date.now() - indexStartTime);
  } catch (error) {
    const durationMs = Date.now() - indexStartTime;
    const duration = Math.round(durationMs / 1000);

    // Create structured error with context
    const structuredError = createGenerationError(
      error,
      indexStepKey,
      'Assemble prototype',
      variantIndex,
      progress.filesCompleted,
      durationMs
    );

    const formattedError = formatGenerationError(structuredError);
    console.error(`[AgentOrchestration] ❌ Variant ${variantIndex}: index.html failed after ${duration}s:`, formattedError);

    progress = updateStepInProgress(progress, indexStepKey, { status: 'failed', error: formattedError });
    progress = updateProgress(progress, { phase: 'failed', error: formattedError });
    onProgress(progress);
    events?.onStepFail?.(variantIndex, indexStepKey, formattedError);

    // Mark variant as failed in Supabase
    if (serverVariantId) {
      await updateVariantPhase(serverVariantId, 'failed', undefined, formattedError);
    }

    // Throw with the structured error for the parent to handle
    const enhancedError = new Error(formattedError);
    (enhancedError as Error & { structuredError: GenerationError }).structuredError = structuredError;
    throw enhancedError;
  }

  console.log(`[AgentOrchestration] 🎉 Variant ${variantIndex}: Generation complete!`);
  events?.onVariantComplete?.(variantIndex, generatedFiles);

  return { files: generatedFiles, implementationScript };
}

// ============================================================================
// Main Orchestration
// ============================================================================

/**
 * Orchestrate multi-stage generation for all variants
 */
export async function orchestrateGeneration(
  sessionId: string,
  plans: VariantPlan[],
  context: Omit<GenerationContext, 'sessionId'>,
  onProgress?: AgentProgressCallback,
  events?: AgentEvents,
  config: OrchestrationConfig = {
    parallelVariants: 1,  // Sequential variant processing for better UX feedback
    parallelComponents: 2,
    enableCheckpoints: true,
    maxRetries: 2,
    timeoutMs: 30000,
    useModificationsAssembly: true,  // Use modifications-based assembly for faster, more reliable generation
  }
): Promise<OrchestrationResult> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase not configured');
  }

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    throw new Error('Not authenticated');
  }

  const accessToken = session.access_token;
  const fullContext: GenerationContext = { ...context, sessionId };
  const startTime = Date.now();

  // Create server checkpoint session for recovery on page refresh
  let checkpointSession: CheckpointSession | null = null;
  if (config.enableCheckpoints) {
    checkpointSession = await createCheckpointSession(
      sessionId,
      context.sourceHtml || '',
      plans,
      context.screenshotBase64
    );
    console.log('[AgentOrchestration] Created checkpoint session:', checkpointSession?.id);
  }

  // Initialize progress for all variants
  const progressMap = new Map<number, AgentProgress>();
  for (const plan of plans) {
    const approach = INDEX_TO_APPROACH[plan.variant_index] || 'minimal';
    progressMap.set(plan.variant_index, createInitialProgress(plan.variant_index, plan, approach));
  }

  // Report initial progress
  const reportProgress = () => {
    if (onProgress) {
      const allProgress = Array.from(progressMap.values());
      onProgress(allProgress);
    }
  };
  reportProgress();

  const results: OrchestrationResult = {
    variants: [],
    failures: [],
    totalDuration: 0,
  };

  // Process variants in batches (2 at a time)
  const batches: VariantPlan[][] = [];
  for (let i = 0; i < plans.length; i += config.parallelVariants) {
    batches.push(plans.slice(i, i + config.parallelVariants));
  }

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    const batchVariants = batch.map(p => p.variant_index).join(', ');
    console.log(`[AgentOrchestration] 🚀 Starting batch ${batchIndex + 1}/${batches.length} (variants: ${batchVariants})`);

    // Update current variant index for each batch
    if (checkpointSession?.id) {
      await updateCurrentVariant(checkpointSession.id, batch[0].variant_index);
    }

    const batchPromises = batch.map(async (plan) => {
      const variantIndex = plan.variant_index;
      const approach = INDEX_TO_APPROACH[variantIndex] || 'minimal';

      try {
        const result = await generateVariant(
          plan,
          fullContext,
          config,
          accessToken,
          (progress) => {
            progressMap.set(variantIndex, progress);
            reportProgress();
          },
          events,
          checkpointSession?.id
        );

        // Create VirtualFS and preview URL
        const virtualFS = new VirtualFS({
          sessionId,
          variantId: `variant-${variantIndex}`,
        });
        for (const file of result.files) {
          virtualFS.writeFile(file.path, file.content, file.type);
        }
        const previewUrl = virtualFS.createPreviewUrl();

        results.variants.push({
          variantIndex,
          approach,
          files: result.files,
          implementationScript: result.implementationScript,
          previewUrl,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Generation failed';
        const structuredError = (error as Error & { structuredError?: GenerationError }).structuredError;

        // Update progress to show failed state
        const currentProgress = progressMap.get(variantIndex);
        if (currentProgress) {
          progressMap.set(variantIndex, updateProgress(currentProgress, {
            phase: 'failed',
            error: errorMessage,
          }));
          reportProgress();
        }

        results.failures.push({
          variantIndex,
          approach,
          error: errorMessage,
          partialFiles: currentProgress?.filesCompleted.map(path => ({
            path,
            content: '',
            type: 'html' as const,
          })),
        });

        events?.onVariantFail?.(variantIndex, errorMessage, structuredError);
      }
    });

    await Promise.all(batchPromises);
    console.log(`[AgentOrchestration] ✅ Batch ${batchIndex + 1}/${batches.length} complete (variants: ${batchVariants})`);
  }

  results.totalDuration = Date.now() - startTime;

  // Update session status on completion
  if (checkpointSession?.id) {
    const allComplete = results.failures.length === 0;
    await updateSessionStatus(
      checkpointSession.id,
      allComplete ? 'completed' : 'failed',
      results.failures.length > 0 ? `${results.failures.length} variant(s) failed` : undefined
    );
  }

  events?.onAllComplete?.(results);

  return results;
}

/**
 * Resume generation from checkpoints
 */
export async function resumeGeneration(
  sessionId: string,
  plans: VariantPlan[],
  context: Omit<GenerationContext, 'sessionId'>,
  onProgress?: AgentProgressCallback,
  events?: AgentEvents,
  config?: OrchestrationConfig
): Promise<OrchestrationResult> {
  // Load existing checkpoints
  const checkpoints = await loadCheckpoints(sessionId);

  // Check which variants are complete or need resuming
  const completedVariants: number[] = [];
  const incompleteVariants: VariantPlan[] = [];

  for (const plan of plans) {
    const checkpoint = checkpoints.find(c => c.stepKey === 'index_html' && c.variantIndex === plan.variant_index);

    if (checkpoint?.status === 'completed') {
      completedVariants.push(plan.variant_index);
    } else {
      incompleteVariants.push(plan);
    }
  }

  console.log('[AgentOrchestration] Resume:', {
    completed: completedVariants,
    incomplete: incompleteVariants.map(p => p.variant_index),
  });

  // If all complete, return cached results
  if (incompleteVariants.length === 0) {
    // Reconstruct results from checkpoints
    // For now, just re-run the full generation
    console.log('[AgentOrchestration] All variants already complete');
  }

  // Run generation for incomplete variants
  return orchestrateGeneration(
    sessionId,
    incompleteVariants.length > 0 ? incompleteVariants : plans,
    context,
    onProgress,
    events,
    config
  );
}

export default orchestrateGeneration;
