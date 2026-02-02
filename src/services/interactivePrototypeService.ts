/**
 * Interactive Prototype Service
 *
 * Generates file-based interactive prototypes using the new
 * Web Components architecture and VirtualFS system.
 *
 * This service is used when prototypeMode === 'interactive'.
 */

import { supabase, isSupabaseConfigured } from './supabase';
import { VirtualFS } from '../runtime/virtual-fs';
import { usePrototypeStore } from '../store/prototypeStore';
import { useVibeStore } from '../store/vibeStore';
import type { VariantPlan } from './variantPlanService';
import type { GeneratedFile, VariantApproach } from '../types/implementationScript';

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
