/**
 * Interactive Prototype Service
 *
 * Generates file-based interactive prototypes using the new
 * Web Components architecture and VirtualFS system.
 *
 * This service is used when prototypeMode === 'interactive'.
 *
 * Now uses multi-stage agent architecture for:
 * - Faster generation (no timeouts)
 * - Granular progress tracking
 * - Fault tolerance with checkpointing
 */

import { supabase, isSupabaseConfigured } from './supabase';
import { VirtualFS } from '../runtime/virtual-fs';
import { usePrototypeStore } from '../store/prototypeStore';
import { useVibeStore } from '../store/vibeStore';
import { orchestrateGeneration, resumeGeneration } from './agentOrchestrationService';
import { initCheckpointService } from './checkpointService';
import {
  getLatestCheckpoint,
  buildFilesFromCheckpoint,
  type CheckpointData,
} from './generationCheckpointService';
import type { VariantPlan } from './variantPlanService';
import type { GeneratedFile, VariantApproach, DesignToken } from '../types/implementationScript';
import type { AgentProgress, OrchestrationConfig } from '../types/agentTypes';

// ============================================================================
// Types
// ============================================================================

export interface InteractiveGenerationProgress {
  stage: 'preparing' | 'analyzing' | 'generating' | 'complete' | 'failed';
  message: string;
  percent: number;
  variantIndex?: number;
  variantTitle?: string;
}

export interface InteractiveVariantResult {
  variantIndex: number;
  approach: VariantApproach;
  files: GeneratedFile[];
  virtualFS: VirtualFS;
  previewUrl: string;
}

type ProgressCallback = (progress: InteractiveGenerationProgress) => void;
type VariantCompleteCallback = (result: InteractiveVariantResult) => void;

// Map variant index to approach
const INDEX_TO_APPROACH: Record<number, VariantApproach> = {
  1: 'minimal',
  2: 'feature-rich',
  3: 'gamified',
  4: 'accessible',
};

// ============================================================================
// Main Generation Function
// ============================================================================

/**
 * Generate interactive file-based prototypes for all variants
 */
export async function generateInteractivePrototypes(
  sessionId: string,
  plans: VariantPlan[],
  originalHtml: string,
  onProgress?: ProgressCallback,
  onVariantComplete?: VariantCompleteCallback,
  screenshotBase64?: string,
  designTokens?: Record<string, unknown>[]
): Promise<InteractiveVariantResult[]> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase not configured');
  }

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    throw new Error('Not authenticated');
  }

  onProgress?.({
    stage: 'preparing',
    message: 'Preparing interactive prototype generation...',
    percent: 5,
  });

  // Get the prototype store actions
  const prototypeStore = usePrototypeStore.getState();

  // Start generation in prototype store
  const approaches = plans.map(p => INDEX_TO_APPROACH[p.variant_index] || 'standard');
  prototypeStore.startGeneration(approaches);

  const results: InteractiveVariantResult[] = [];
  const totalVariants = plans.length;

  // Generate each variant
  for (let i = 0; i < plans.length; i++) {
    const plan = plans[i];
    const variantIndex = plan.variant_index;
    const approach = INDEX_TO_APPROACH[variantIndex] || 'standard';
    const progressBase = 10 + (i / totalVariants) * 80;

    onProgress?.({
      stage: 'generating',
      message: `Generating interactive prototype for "${plan.title}"...`,
      percent: progressBase,
      variantIndex,
      variantTitle: plan.title,
    });

    // Mark variant as generating in store
    const variantId = Object.keys(prototypeStore.variants).find(
      id => prototypeStore.variants[id].approach === approach
    );

    console.log('[InteractivePrototypeService] Looking for variant with approach:', approach);
    console.log('[InteractivePrototypeService] Available variants:', Object.keys(prototypeStore.variants).map(id => ({
      id,
      approach: prototypeStore.variants[id].approach,
      status: prototypeStore.variants[id].status
    })));
    console.log('[InteractivePrototypeService] Found variantId:', variantId);

    if (variantId) {
      prototypeStore.setVariantGenerating(variantId);
    } else {
      console.warn('[InteractivePrototypeService] No variant found in store for approach:', approach);
    }

    try {
      // Call the generate-prototype-files edge function
      const files = await callGeneratePrototypeFiles(
        sessionId,
        plan,
        originalHtml,
        approach,
        screenshotBase64,
        designTokens,
        session.access_token
      );

      // Create VirtualFS instance
      const virtualFS = new VirtualFS({
        sessionId,
        variantId: `variant-${variantIndex}`
      });

      // Add files to VirtualFS
      for (const file of files) {
        virtualFS.writeFile(file.path, file.content, file.type);
      }

      // Generate preview URL
      const previewUrl = virtualFS.createPreviewUrl();

      // Update prototype store
      if (variantId) {
        prototypeStore.setVariantReady(
          variantId,
          files,
          files.filter(f => f.path.startsWith('components/')).map(f => f.path)
        );
      }

      const result: InteractiveVariantResult = {
        variantIndex,
        approach,
        files,
        virtualFS,
        previewUrl,
      };

      results.push(result);
      onVariantComplete?.(result);

    } catch (error) {
      console.error(`[InteractivePrototypeService] Failed to generate variant ${variantIndex}:`, error);

      if (variantId) {
        prototypeStore.setVariantError(
          variantId,
          error instanceof Error ? error.message : 'Generation failed'
        );
      }

      // Continue with other variants
    }
  }

  onProgress?.({
    stage: 'complete',
    message: `Generated ${results.length} interactive prototypes`,
    percent: 100,
  });

  return results;
}

// ============================================================================
// Edge Function Call
// ============================================================================

/**
 * Call the generate-prototype-files edge function
 */
async function callGeneratePrototypeFiles(
  sessionId: string,
  plan: VariantPlan,
  originalHtml: string,
  approach: VariantApproach,
  screenshotBase64?: string,
  designTokens?: Record<string, unknown>[],
  accessToken?: string
): Promise<GeneratedFile[]> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const functionUrl = `${supabaseUrl}/functions/v1/generate-prototype-files`;

  console.log('[InteractivePrototypeService] Calling generate-prototype-files:', {
    sessionId,
    variantIndex: plan.variant_index,
    approach,
    planTitle: plan.title,
  });

  // Build implementation script from plan
  const implementationScript = {
    id: `script-${plan.id}`,
    name: plan.title,
    description: plan.description,
    entryPoints: extractEntryPointsFromPlan(plan),
    stateSchema: {},
    initialState: {},
    flows: extractFlowsFromPlan(plan),
    successCriteria: {
      description: 'User completes the main interaction flow',
    },
  };

  const requestBody = JSON.stringify({
    sessionId,
    screenId: sessionId,
    screenHtml: originalHtml,
    screenshotBase64,
    implementationScript,
    designTokens: designTokens || [],
    variantApproach: approach,
  });

  let response: Response;
  try {
    // Add timeout to prevent hanging (45 seconds - edge functions timeout at ~60s)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000);

    response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: requestBody,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
  } catch (networkError) {
    const errorMessage = networkError instanceof Error ? networkError.message : 'Unknown error';
    console.error('[InteractivePrototypeService] Network/timeout error:', errorMessage);

    // Check if it was a timeout
    if (errorMessage.includes('abort')) {
      console.log('[InteractivePrototypeService] Request timed out, using fallback');
    }

    // Generate fallback files when edge function is unavailable or times out
    return generateFallbackFiles(plan, approach, originalHtml);
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const errorMessage = errorData?.error || `Edge function failed: ${response.status}`;
    console.error('[InteractivePrototypeService] Edge function error:', errorMessage);

    // If function not deployed (404) or server error, use fallback
    if (response.status === 404 || response.status >= 500) {
      console.log('[InteractivePrototypeService] Using fallback generation');
      return generateFallbackFiles(plan, approach, originalHtml);
    }

    throw new Error(errorMessage);
  }

  const data = await response.json();

  // Edge function returns { files: [...], previewInstructions, componentsUsed, warnings }
  // Check for files array (success field is not returned)
  if (!data?.files || !Array.isArray(data.files) || data.files.length === 0) {
    console.warn('[InteractivePrototypeService] No files in response, using fallback');
    console.warn('[InteractivePrototypeService] Response data:', data);
    return generateFallbackFiles(plan, approach, originalHtml);
  }

  console.log('[InteractivePrototypeService] Generated files:', data.files.length);
  console.log('[InteractivePrototypeService] Components used:', data.componentsUsed);
  console.log('[InteractivePrototypeService] Preview instructions:', data.previewInstructions);

  return data.files;
}

/**
 * Generate fallback files when edge function is unavailable
 * Creates a basic interactive prototype structure
 */
function generateFallbackFiles(
  plan: VariantPlan,
  approach: VariantApproach,
  _originalHtml: string
): GeneratedFile[] {
  console.log('[InteractivePrototypeService] Generating fallback files for:', plan.title);

  const variantLabels: Record<VariantApproach, string> = {
    minimal: 'Minimal',
    'feature-rich': 'Feature Rich',
    gamified: 'Gamified',
    accessible: 'Accessible',
    'mobile-first': 'Mobile First',
    enterprise: 'Enterprise',
  };
  const variantLabel = variantLabels[approach];

  // Create basic file structure
  const files: GeneratedFile[] = [
    {
      path: 'index.html',
      content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${plan.title} - ${variantLabel}</title>
  <link rel="stylesheet" href="styles/tokens.css">
  <script type="module" src="components/vx-runtime.js"></script>
</head>
<body>
  <div id="prototype-root">
    <header style="padding: 16px; background: var(--color-primary, #3b82f6); color: white;">
      <h1 style="margin: 0; font-size: 1.25rem;">${plan.title}</h1>
      <p style="margin: 4px 0 0; opacity: 0.9; font-size: 0.875rem;">${variantLabel} Approach</p>
    </header>

    <main style="padding: 24px;">
      <div class="variant-info" style="background: #f8fafc; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
        <h2 style="margin: 0 0 8px; font-size: 1rem;">About This Prototype</h2>
        <p style="margin: 0; color: #64748b; font-size: 0.875rem;">${plan.description}</p>
      </div>

      <div class="key-changes" style="margin-bottom: 24px;">
        <h3 style="margin: 0 0 12px; font-size: 0.875rem; color: #475569;">Key Changes:</h3>
        <ul style="margin: 0; padding-left: 20px; color: #334155;">
          ${(plan.key_changes || []).map(change => `<li style="margin-bottom: 4px;">${change}</li>`).join('\n          ')}
        </ul>
      </div>

      <vx-button variant="primary" vx-on:click="set:demo.clicked=true">
        Try Interactive Button
      </vx-button>

      <vx-toast vx-bind:visible="demo.clicked" type="success" duration="3000">
        Interactive mode is working!
      </vx-toast>
    </main>

    <footer style="padding: 16px; border-top: 1px solid #e2e8f0; color: #64748b; font-size: 0.75rem;">
      Generated with Voxel Interactive Mode (Fallback)
    </footer>
  </div>

  <script type="module">
    import { initVxRuntime } from './components/vx-runtime.js';
    initVxRuntime({
      demo: { clicked: false }
    });
  </script>
</body>
</html>`,
      type: 'html',
    },
    {
      path: 'styles/tokens.css',
      content: `:root {
  --color-primary: #3b82f6;
  --color-primary-light: #60a5fa;
  --color-success: #22c55e;
  --color-warning: #f59e0b;
  --color-error: #ef4444;
  --color-surface: #ffffff;
  --color-background: #f8fafc;
  --color-text: #1e293b;
  --color-text-secondary: #64748b;
  --font-family: system-ui, -apple-system, sans-serif;
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --spacing-xs: 4px;
  --spacing-sm: 8px;
  --spacing-md: 16px;
  --spacing-lg: 24px;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: var(--font-family);
  background: var(--color-background);
  color: var(--color-text);
}
`,
      type: 'css',
    },
    {
      path: 'components/vx-runtime.js',
      content: `// Minimal VxRuntime for fallback prototypes
class VxStore {
  constructor(initialState = {}) {
    this._state = initialState;
    this._subscribers = new Set();
  }

  get(path) {
    return path.split('.').reduce((obj, key) => obj?.[key], this._state);
  }

  set(path, value) {
    const keys = path.split('.');
    const last = keys.pop();
    const target = keys.reduce((obj, key) => {
      obj[key] = obj[key] || {};
      return obj[key];
    }, this._state);
    target[last] = value;
    this._notify();
  }

  subscribe(callback) {
    this._subscribers.add(callback);
    return () => this._subscribers.delete(callback);
  }

  _notify() {
    this._subscribers.forEach(cb => cb(this._state));
  }
}

// Simple button component
class VxButton extends HTMLElement {
  connectedCallback() {
    const variant = this.getAttribute('variant') || 'default';
    const colors = {
      primary: { bg: 'var(--color-primary)', color: 'white' },
      default: { bg: '#e2e8f0', color: '#1e293b' },
    };
    const style = colors[variant] || colors.default;

    this.style.cssText = \`
      display: inline-block;
      padding: 10px 20px;
      background: \${style.bg};
      color: \${style.color};
      border: none;
      border-radius: var(--radius-md);
      cursor: pointer;
      font-size: 0.875rem;
      font-weight: 500;
    \`;

    this.addEventListener('click', () => {
      const action = this.getAttribute('vx-on:click');
      if (action && window.VxStore) {
        const match = action.match(/set:([\\w.]+)=(.+)/);
        if (match) {
          const [, path, value] = match;
          window.VxStore.set(path, JSON.parse(value));
        }
      }
    });
  }
}

// Simple toast component
class VxToast extends HTMLElement {
  connectedCallback() {
    this.style.cssText = \`
      position: fixed;
      bottom: 20px;
      right: 20px;
      padding: 12px 20px;
      background: var(--color-success);
      color: white;
      border-radius: var(--radius-md);
      opacity: 0;
      transition: opacity 0.3s;
      font-size: 0.875rem;
    \`;

    if (window.VxStore) {
      window.VxStore.subscribe(() => this._update());
    }
  }

  _update() {
    const binding = this.getAttribute('vx-bind:visible');
    if (binding && window.VxStore) {
      const visible = window.VxStore.get(binding);
      this.style.opacity = visible ? '1' : '0';

      if (visible) {
        const duration = parseInt(this.getAttribute('duration') || '3000');
        setTimeout(() => {
          window.VxStore.set(binding, false);
        }, duration);
      }
    }
  }
}

customElements.define('vx-button', VxButton);
customElements.define('vx-toast', VxToast);

export function initVxRuntime(initialState = {}) {
  window.VxStore = new VxStore(initialState);
  console.log('[VxRuntime] Initialized with state:', initialState);
}
`,
      type: 'js',
    },
    {
      path: 'state/store.json',
      content: JSON.stringify({
        demo: { clicked: false },
        ui: { loading: false, success: false },
      }, null, 2),
      type: 'json',
    },
  ];

  return files;
}

// ============================================================================
// Agent-Based Generation (Multi-Stage)
// ============================================================================

/**
 * Extended progress callback for granular step-by-step updates
 */
export type AgentProgressCallback = (progress: AgentProgress[]) => void;

/**
 * Generate interactive prototypes using multi-stage agent architecture
 *
 * This is the recommended method for generation as it:
 * - Avoids timeouts by breaking work into smaller LLM calls
 * - Provides granular progress tracking per step
 * - Supports checkpointing for resume capability
 * - Generates 2 variants in parallel for speed
 */
export async function generateInteractivePrototypesWithAgent(
  sessionId: string,
  plans: VariantPlan[],
  originalHtml: string,
  onProgress?: ProgressCallback,
  onAgentProgress?: AgentProgressCallback,
  onVariantComplete?: VariantCompleteCallback,
  screenshotBase64?: string,
  designTokens?: DesignToken[],
  config?: Partial<OrchestrationConfig>,
  productContext?: string
): Promise<InteractiveVariantResult[]> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase not configured');
  }

  // Initialize checkpoint service
  await initCheckpointService();

  onProgress?.({
    stage: 'preparing',
    message: 'Initializing multi-stage generation...',
    percent: 5,
  });

  // Get the prototype store actions
  const prototypeStore = usePrototypeStore.getState();

  // Start generation in prototype store
  const approaches = plans.map(p => INDEX_TO_APPROACH[p.variant_index] || 'minimal');
  prototypeStore.startGeneration(approaches as VariantApproach[]);

  try {
    // Use orchestration service for multi-stage generation
    const result = await orchestrateGeneration(
      sessionId,
      plans,
      {
        sourceHtml: originalHtml,
        screenshotBase64,
        designTokens: designTokens || [],
        productContext,
      },
      (agentProgressList: AgentProgress[]) => {
        // Report agent progress
        onAgentProgress?.(agentProgressList);

        // Convert to simple progress for backwards compatibility
        const activeVariant = agentProgressList.find((p: AgentProgress) => p.phase !== 'queued' && p.phase !== 'complete');
        if (activeVariant) {
          const totalSteps = agentProgressList.reduce((sum: number, p: AgentProgress) => sum + p.totalSteps, 0);
          const completedSteps = agentProgressList.reduce((sum: number, p: AgentProgress) => sum + p.completedSteps, 0);
          const percent = Math.round((completedSteps / totalSteps) * 100);

          onProgress?.({
            stage: 'generating',
            message: activeVariant.currentStep,
            percent: Math.min(95, 10 + percent * 0.85),
            variantIndex: activeVariant.variantIndex,
            variantTitle: activeVariant.variantTitle,
          });
        }
      },
      {
        onVariantStart: (variantIndex) => {
          // Initialize variant with source HTML for immediate preview
          const approach = INDEX_TO_APPROACH[variantIndex] || 'minimal';
          const variantId = Object.keys(prototypeStore.variants).find(
            id => prototypeStore.variants[id].approach === approach
          );

          if (variantId && originalHtml) {
            prototypeStore.initializeVariantWithSourceHtml(variantId, originalHtml);
            console.log(`[InteractivePrototypeService] Initialized variant ${variantIndex} with source HTML preview`);
          }
        },
        onFileGenerated: (variantIndex, file, allFiles) => {
          // Progressive preview update as each file is generated
          const approach = INDEX_TO_APPROACH[variantIndex] || 'minimal';
          const variantId = Object.keys(prototypeStore.variants).find(
            id => prototypeStore.variants[id].approach === approach
          );

          if (variantId) {
            // Add the file to the variant's VirtualFS
            prototypeStore.addFileToVariant(variantId, file);

            // Refresh preview URL if this is an HTML, CSS, or JS file
            if (file.path.endsWith('.html') || file.path.endsWith('.css') || file.path.endsWith('.js')) {
              prototypeStore.refreshVariantPreview(variantId);
            }

            console.log(`[InteractivePrototypeService] Progressive update: ${file.path} (${allFiles.length} files total)`);
          }
        },
        onVariantComplete: (variantIndex, files) => {
          const approach = INDEX_TO_APPROACH[variantIndex] || 'minimal';
          const variantId = Object.keys(prototypeStore.variants).find(
            id => prototypeStore.variants[id].approach === approach
          );

          if (variantId) {
            prototypeStore.setVariantReady(
              variantId,
              files,
              files.filter(f => f.path.startsWith('components/')).map(f => f.path)
            );
          }

          // Create VirtualFS and notify
          const virtualFS = new VirtualFS({
            sessionId,
            variantId: `variant-${variantIndex}`,
          });
          for (const file of files) {
            virtualFS.writeFile(file.path, file.content, file.type);
          }

          onVariantComplete?.({
            variantIndex,
            approach: approach as VariantApproach,
            files,
            virtualFS,
            previewUrl: virtualFS.createPreviewUrl(),
          });
        },
        onVariantFail: (variantIndex, error, structuredError) => {
          const approach = INDEX_TO_APPROACH[variantIndex] || 'minimal';
          const variantId = Object.keys(prototypeStore.variants).find(
            id => prototypeStore.variants[id].approach === approach
          );

          if (variantId) {
            prototypeStore.setVariantError(variantId, error);
          }

          // Log structured error details for debugging
          if (structuredError) {
            console.error(`[InteractivePrototypeService] Structured error for variant ${variantIndex}:`, {
              code: structuredError.code,
              step: structuredError.stepLabel,
              filesCompleted: structuredError.filesCompleted.length,
              durationMs: structuredError.durationMs,
            });
          }
        },
      },
      {
        parallelVariants: 1,  // Sequential processing for better UX feedback
        parallelComponents: 2,
        enableCheckpoints: true,
        maxRetries: 2,
        timeoutMs: 30000,
        useModificationsAssembly: true,  // Use modifications-based assembly for faster, more reliable generation
        ...config,
      }
    );

    // Convert orchestration results to InteractiveVariantResult[]
    const results: InteractiveVariantResult[] = result.variants.map(v => {
      const virtualFS = new VirtualFS({
        sessionId,
        variantId: `variant-${v.variantIndex}`,
      });
      for (const file of v.files) {
        virtualFS.writeFile(file.path, file.content, file.type);
      }

      return {
        variantIndex: v.variantIndex,
        approach: v.approach,
        files: v.files,
        virtualFS,
        previewUrl: v.previewUrl || virtualFS.createPreviewUrl(),
      };
    });

    onProgress?.({
      stage: 'complete',
      message: `Generated ${results.length} interactive prototypes`,
      percent: 100,
    });

    console.log('[InteractivePrototypeService] Agent generation complete:', {
      successful: result.variants.length,
      failed: result.failures.length,
      duration: result.totalDuration,
    });

    return results;
  } catch (error) {
    console.error('[InteractivePrototypeService] Agent generation failed:', error);
    onProgress?.({
      stage: 'failed',
      message: error instanceof Error ? error.message : 'Generation failed',
      percent: 0,
    });
    throw error;
  }
}

/**
 * Resume generation from checkpoints
 */
export async function resumeInteractivePrototypes(
  sessionId: string,
  plans: VariantPlan[],
  originalHtml: string,
  onProgress?: ProgressCallback,
  onAgentProgress?: AgentProgressCallback,
  onVariantComplete?: VariantCompleteCallback,
  screenshotBase64?: string,
  designTokens?: DesignToken[]
): Promise<InteractiveVariantResult[]> {
  await initCheckpointService();

  onProgress?.({
    stage: 'preparing',
    message: 'Resuming from last checkpoint...',
    percent: 5,
  });

  const result = await resumeGeneration(
    sessionId,
    plans,
    {
      sourceHtml: originalHtml,
      screenshotBase64,
      designTokens: designTokens || [],
    },
    onAgentProgress,
    {
      onVariantComplete: (variantIndex, files) => {
        const approach = INDEX_TO_APPROACH[variantIndex] || 'minimal';
        const virtualFS = new VirtualFS({
          sessionId,
          variantId: `variant-${variantIndex}`,
        });
        for (const file of files) {
          virtualFS.writeFile(file.path, file.content, file.type);
        }

        onVariantComplete?.({
          variantIndex,
          approach: approach as VariantApproach,
          files,
          virtualFS,
          previewUrl: virtualFS.createPreviewUrl(),
        });
      },
    }
  );

  return result.variants.map(v => {
    const virtualFS = new VirtualFS({
      sessionId,
      variantId: `variant-${v.variantIndex}`,
    });
    for (const file of v.files) {
      virtualFS.writeFile(file.path, file.content, file.type);
    }

    return {
      variantIndex: v.variantIndex,
      approach: v.approach,
      files: v.files,
      virtualFS,
      previewUrl: v.previewUrl || virtualFS.createPreviewUrl(),
    };
  });
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extract entry points from a variant plan
 */
function extractEntryPointsFromPlan(plan: VariantPlan): Array<{
  selector: string;
  action: string;
  description: string;
}> {
  // Parse key_changes to find interactive elements
  const entryPoints: Array<{ selector: string; action: string; description: string }> = [];

  if (plan.key_changes) {
    // Look for button/link mentions in key changes
    const changes = Array.isArray(plan.key_changes) ? plan.key_changes : [plan.key_changes];
    changes.forEach((change, i) => {
      if (typeof change === 'string') {
        if (change.toLowerCase().includes('button') || change.toLowerCase().includes('cta')) {
          entryPoints.push({
            selector: `button:nth-of-type(${i + 1})`,
            action: 'click',
            description: change,
          });
        }
        if (change.toLowerCase().includes('form') || change.toLowerCase().includes('input')) {
          entryPoints.push({
            selector: 'form',
            action: 'submit',
            description: change,
          });
        }
      }
    });
  }

  // Default entry point if none found
  if (entryPoints.length === 0) {
    entryPoints.push({
      selector: 'button.primary, button[type="submit"], .cta',
      action: 'click',
      description: 'Primary action button',
    });
  }

  return entryPoints;
}

/**
 * Extract flows from a variant plan
 */
function extractFlowsFromPlan(_plan: VariantPlan): Array<{
  name: string;
  trigger: { event: string; selector?: string };
  steps: Array<{ set?: string; to?: unknown; delay?: number; label?: string }>;
}> {
  // Create a basic interaction flow based on the plan
  return [
    {
      name: 'main-interaction',
      trigger: {
        event: 'click',
        selector: 'button.primary, button[type="submit"], .cta',
      },
      steps: [
        { set: 'ui.loading', to: true },
        { delay: 800, label: 'Processing' },
        { set: 'ui.loading', to: false },
        { set: 'ui.success', to: true },
        { delay: 2000, label: 'Show success' },
        { set: 'ui.success', to: false },
      ],
    },
  ];
}

/**
 * Check if interactive mode should be used
 * This reads from vibeStore to determine the current mode
 */
export function shouldUseInteractiveMode(): boolean {
  return useVibeStore.getState().prototypeMode === 'interactive';
}

// ============================================================================
// Server Orchestration (Feature Flag)
// ============================================================================

/**
 * Feature flag for server-side orchestration
 * When enabled, generation runs on the server (but blocks until complete)
 * For streaming + recovery, use client orchestration with checkpoints instead
 */
export const USE_SERVER_ORCHESTRATION = false;

/**
 * Check if server orchestration should be used
 * Can be overridden by localStorage for testing
 */
export function shouldUseServerOrchestration(): boolean {
  // Check localStorage override first
  const override = localStorage.getItem('voxel_use_server_orchestration');
  if (override !== null) {
    return override === 'true';
  }
  return USE_SERVER_ORCHESTRATION;
}

/**
 * Enable or disable server orchestration (for testing)
 */
export function setServerOrchestrationEnabled(enabled: boolean): void {
  localStorage.setItem('voxel_use_server_orchestration', enabled ? 'true' : 'false');
}

// ============================================================================
// Checkpoint Recovery
// ============================================================================

/**
 * Restore artifacts from a checkpoint after page refresh
 *
 * This retrieves the most recent generation session (including completed ones)
 * and rebuilds the VirtualFS and prototypeStore state from saved files.
 *
 * Returns true if restoration was successful, false if no checkpoint found.
 */
export async function restoreFromCheckpoint(
  sessionId: string
): Promise<{
  restored: boolean;
  results?: InteractiveVariantResult[];
  checkpoint?: CheckpointData;
}> {
  console.log('[InteractivePrototypeService] Attempting to restore from checkpoint for session:', sessionId);

  // Get the latest checkpoint (including completed sessions)
  const checkpoint = await getLatestCheckpoint(sessionId);

  if (!checkpoint) {
    console.log('[InteractivePrototypeService] No checkpoint found for session');
    return { restored: false };
  }

  console.log('[InteractivePrototypeService] Found checkpoint:', {
    sessionId: checkpoint.session.id,
    status: checkpoint.session.status,
    variantsCount: checkpoint.variants.length,
  });

  // Get prototype store
  const prototypeStore = usePrototypeStore.getState();

  // Rebuild each variant from checkpoint
  const results: InteractiveVariantResult[] = [];
  const approaches = checkpoint.variants.map(v =>
    INDEX_TO_APPROACH[v.variant_index] || 'minimal'
  );

  // Initialize the prototype store with the approaches if not already
  // This ensures the variant IDs exist
  if (Object.keys(prototypeStore.variants).length === 0) {
    prototypeStore.startGeneration(approaches as VariantApproach[]);
  }

  for (const variant of checkpoint.variants) {
    const variantIndex = variant.variant_index;
    const approach = INDEX_TO_APPROACH[variantIndex] || 'minimal';

    // Build files from checkpoint steps
    const files = buildFilesFromCheckpoint(variant.steps);

    // Also check virtual_fs if files were saved there
    if ((!files.length || files.length < 2) && variant.virtual_fs?.files) {
      // Use files from virtual_fs instead
      files.length = 0;
      for (const f of variant.virtual_fs.files) {
        files.push({
          path: f.path,
          content: f.content,
          type: f.type as 'html' | 'js' | 'css' | 'json',
        });
      }
    }

    if (files.length === 0) {
      console.log(`[InteractivePrototypeService] No files found for variant ${variantIndex}, skipping`);
      continue;
    }

    console.log(`[InteractivePrototypeService] Restoring variant ${variantIndex} with ${files.length} files`);

    // Create VirtualFS
    const virtualFS = new VirtualFS({
      sessionId,
      variantId: `variant-${variantIndex}`,
    });

    for (const file of files) {
      virtualFS.writeFile(file.path, file.content, file.type);
    }

    // Find the variant ID in the store
    const variantId = Object.keys(prototypeStore.variants).find(
      id => prototypeStore.variants[id].approach === approach
    );

    if (variantId) {
      // Update the prototype store
      prototypeStore.setVariantReady(
        variantId,
        files,
        files.filter(f => f.path.startsWith('components/')).map(f => f.path)
      );
    }

    const result: InteractiveVariantResult = {
      variantIndex,
      approach: approach as VariantApproach,
      files,
      virtualFS,
      previewUrl: virtualFS.createPreviewUrl(),
    };

    results.push(result);
  }

  if (results.length > 0) {
    console.log(`[InteractivePrototypeService] Successfully restored ${results.length} variants from checkpoint`);
    return {
      restored: true,
      results,
      checkpoint,
    };
  }

  console.log('[InteractivePrototypeService] No variants could be restored from checkpoint');
  return { restored: false, checkpoint };
}
