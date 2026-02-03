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
import type { VariantPlan } from './variantPlanService';
import type { GeneratedFile, VariantApproach, DesignToken } from '../types/implementationScript';
import type {
  AgentProgress,
  AgentStepProgress,
  AgentPhase,
  GenerateScriptResponse,
  GenerateFileResponse,
  GenerationContext,
  OrchestrationConfig,
  OrchestrationResult,
  AgentProgressCallback,
  AgentEvents,
  StepDefinition,
  DEFAULT_ORCHESTRATION_CONFIG,
} from '../types/agentTypes';
import { getAllSteps, GENERATION_STEPS } from '../types/agentTypes';
import { saveCheckpoint, loadCheckpoints, getCheckpoint } from './checkpointService';

// ============================================================================
// Types
// ============================================================================

interface VariantGenerationState {
  variantIndex: number;
  approach: VariantApproach;
  plan: VariantPlan;
  implementationScript?: GenerateScriptResponse;
  files: GeneratedFile[];
  steps: StepDefinition[];
  stepProgress: Map<string, AgentStepProgress>;
  startedAt: number;
  completedAt?: number;
  error?: string;
}

// Map variant index to approach
const INDEX_TO_APPROACH: Record<number, VariantApproach> = {
  1: 'minimal',
  2: 'feature-rich',
  3: 'gamified',
  4: 'accessible',
};

// ============================================================================
// Edge Function Callers
// ============================================================================

async function callGenerateImplementationScript(
  plan: VariantPlan,
  context: GenerationContext,
  approach: VariantApproach,
  accessToken: string
): Promise<GenerateScriptResponse> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const functionUrl = `${supabaseUrl}/functions/v1/generate-implementation-script`;

  const response = await fetch(functionUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
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
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error?.error || `Failed to generate implementation script: ${response.status}`);
  }

  return response.json();
}

async function callGeneratePrototypeFile(
  fileType: 'tokens.css' | 'store.json' | 'flows.json' | 'component' | 'index.html',
  implementationScript: GenerateScriptResponse,
  approach: VariantApproach,
  context: GenerationContext,
  accessToken: string,
  options?: {
    componentName?: string;
    previousFiles?: Array<{ path: string; exports?: string[]; summary?: string }>;
  }
): Promise<GenerateFileResponse> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const functionUrl = `${supabaseUrl}/functions/v1/generate-prototype-file`;

  const response = await fetch(functionUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      fileType,
      implementationScript,
      variantApproach: approach,
      designTokens: context.designTokens,
      componentName: options?.componentName,
      previousFiles: options?.previousFiles,
      sourceHtml: fileType === 'index.html' ? context.sourceHtml?.slice(0, 10000) : undefined,
      screenshotBase64: fileType === 'index.html' ? context.screenshotBase64 : undefined,
      provider: context.provider,
      model: context.model,
    }),
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

async function generateVariant(
  plan: VariantPlan,
  context: GenerationContext,
  config: OrchestrationConfig,
  accessToken: string,
  onProgress: (progress: AgentProgress) => void,
  events?: AgentEvents
): Promise<{ files: GeneratedFile[]; implementationScript: GenerateScriptResponse }> {
  const variantIndex = plan.variant_index;
  const approach = INDEX_TO_APPROACH[variantIndex] || 'minimal';

  let progress = createInitialProgress(variantIndex, plan, approach);
  progress = updateProgress(progress, { phase: 'script', startedAt: Date.now() });
  onProgress(progress);

  events?.onVariantStart?.(variantIndex, approach);

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
    implementationScript = await callGenerateImplementationScript(plan, context, approach, accessToken);

    // Save checkpoint if enabled
    if (config.enableCheckpoints) {
      await saveCheckpoint(context.sessionId, variantIndex, scriptStepKey, implementationScript);
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

  // Step 2a: Generate tokens.css (no LLM)
  const tokensStepKey = 'tokens_css';
  progress = updateStepInProgress(progress, tokensStepKey, { status: 'in_progress' });
  progress = updateProgress(progress, { currentStep: 'Creating design tokens...' });
  onProgress(progress);

  events?.onStepStart?.(variantIndex, tokensStepKey, 'Create design tokens');

  const tokensStartTime = Date.now();
  try {
    const tokensResult = await callGeneratePrototypeFile(
      'tokens.css',
      implementationScript,
      approach,
      context,
      accessToken
    );
    generatedFiles.push({
      path: tokensResult.path,
      content: tokensResult.content,
      type: tokensResult.type,
    });
    previousFiles.push({
      path: tokensResult.path,
      summary: tokensResult.summary,
    });

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
    const storeResult = await callGeneratePrototypeFile(
      'store.json',
      implementationScript,
      approach,
      context,
      accessToken
    );
    generatedFiles.push({
      path: storeResult.path,
      content: storeResult.content,
      type: storeResult.type,
    });
    previousFiles.push({
      path: storeResult.path,
      summary: storeResult.summary,
    });

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
    const flowsResult = await callGeneratePrototypeFile(
      'flows.json',
      implementationScript,
      approach,
      context,
      accessToken
    );
    generatedFiles.push({
      path: flowsResult.path,
      content: flowsResult.content,
      type: flowsResult.type,
    });
    previousFiles.push({
      path: flowsResult.path,
      summary: flowsResult.summary,
    });

    if (config.enableCheckpoints) {
      await saveCheckpoint(context.sessionId, variantIndex, flowsStepKey, flowsResult);
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
      const componentResult = await callGeneratePrototypeFile(
        'component',
        implementationScript,
        approach,
        context,
        accessToken,
        { componentName, previousFiles }
      );
      generatedFiles.push({
        path: componentResult.path,
        content: componentResult.content,
        type: componentResult.type,
      });
      previousFiles.push({
        path: componentResult.path,
        exports: componentResult.exports,
        summary: componentResult.summary,
      });

      if (config.enableCheckpoints) {
        await saveCheckpoint(context.sessionId, variantIndex, componentStepKey, componentResult);
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

  // Step 2e: Generate index.html (LLM)
  const indexStepKey = 'index_html';
  progress = updateStepInProgress(progress, indexStepKey, { status: 'in_progress' });
  progress = updateProgress(progress, {
    currentStep: 'Assembling prototype...',
    currentFile: 'index.html',
    phase: 'assembly',
  });
  onProgress(progress);

  events?.onStepStart?.(variantIndex, indexStepKey, 'Assemble prototype');

  const indexStartTime = Date.now();
  try {
    const indexResult = await callGeneratePrototypeFile(
      'index.html',
      implementationScript,
      approach,
      context,
      accessToken,
      { previousFiles }
    );
    generatedFiles.push({
      path: indexResult.path,
      content: indexResult.content,
      type: indexResult.type,
    });

    if (config.enableCheckpoints) {
      await saveCheckpoint(context.sessionId, variantIndex, indexStepKey, indexResult);
    }

    progress = updateStepInProgress(progress, indexStepKey, {
      status: 'completed',
      duration: Date.now() - indexStartTime,
      filePath: indexResult.path,
    });
    progress = updateProgress(progress, {
      completedSteps: progress.completedSteps + 1,
      filesCompleted: [...progress.filesCompleted, indexResult.path],
      phase: 'complete',
      completedAt: Date.now(),
    });
    onProgress(progress);

    events?.onStepComplete?.(variantIndex, indexStepKey, Date.now() - indexStartTime);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Index generation failed';
    progress = updateStepInProgress(progress, indexStepKey, { status: 'failed', error: errorMessage });
    progress = updateProgress(progress, { phase: 'failed', error: errorMessage });
    onProgress(progress);
    events?.onStepFail?.(variantIndex, indexStepKey, errorMessage);
    throw error;
  }

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
    parallelVariants: 2,
    parallelComponents: 2,
    enableCheckpoints: true,
    maxRetries: 2,
    timeoutMs: 30000,
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

  for (const batch of batches) {
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
          events
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
        results.failures.push({
          variantIndex,
          approach,
          error: errorMessage,
          partialFiles: progressMap.get(variantIndex)?.filesCompleted.map(path => ({
            path,
            content: '',
            type: 'html' as const,
          })),
        });

        events?.onVariantFail?.(variantIndex, errorMessage);
      }
    });

    await Promise.all(batchPromises);
  }

  results.totalDuration = Date.now() - startTime;

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
    const indexKey = `${plan.variant_index}_index_html`;
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
