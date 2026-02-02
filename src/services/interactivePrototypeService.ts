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
    if (variantId) {
      prototypeStore.setVariantGenerating(variantId);
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

  const response = await fetch(functionUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: requestBody,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData?.error || `Edge function failed: ${response.status}`);
  }

  const data = await response.json();

  if (!data?.success || !data?.files) {
    throw new Error(data?.error || 'No files returned from generation');
  }

  console.log('[InteractivePrototypeService] Generated files:', data.files.length);

  return data.files;
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
