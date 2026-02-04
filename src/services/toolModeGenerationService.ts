/**
 * Tool Mode Generation Service
 *
 * Orchestrates prototype generation using the tool-based modification approach.
 * This replaces raw HTML generation with surgical DOM modifications, eliminating
 * issues with LLM-generated JavaScript and script tag escaping.
 *
 * Flow:
 * 1. Get approved components and tokens from stores
 * 2. Call generate-prototype-v2 edge function → returns ModificationSpec
 * 3. Apply modifications to source HTML using domModifier
 * 4. Inject VxRuntime bundle cleanly
 * 5. Return final HTML for VirtualFS
 */

import { supabase, isSupabaseConfigured } from './supabase';
import { useComponentsStore, type ExtractedComponent } from '@/store/componentsStore';
import { useDesignTokensStore, type DesignToken } from '@/store/designTokensStore';
import { usePrototypeStore } from '@/store/prototypeStore';
import { VirtualFS } from '@/runtime/virtual-fs';
import { injectVxRuntimeBundle } from '@/runtime/vx-runtime-bundle';
import {
  applyModifications,
} from './domModifier';
import type {
  ModificationSpec,
  ExtractedComponentForTools,
  DesignToken as ToolDesignToken,
} from '@/types/toolSchema';
import type { VariantPlan } from './variantPlanService';

// =============================================================================
// Types
// =============================================================================

export interface ToolModeProgress {
  stage: 'preparing' | 'generating-spec' | 'applying-modifications' | 'injecting-runtime' | 'complete' | 'failed';
  message: string;
  percent: number;
  variantIndex?: number;
  variantTitle?: string;
}

export interface ToolModeResult {
  variantIndex: number;
  spec: ModificationSpec;
  html: string;
  virtualFS: VirtualFS;
  previewUrl: string;
  toolCallCount: number;
  screensGenerated: number;
}

export interface ToolModeOptions {
  /** Include multi-screen navigation tools */
  includeScreenTools?: boolean;
  /** Include state/interaction tools */
  includeInteractionTools?: boolean;
  /** Provider to use */
  provider?: 'anthropic' | 'openai';
  /** Model to use */
  model?: string;
}

type ProgressCallback = (progress: ToolModeProgress) => void;
type VariantCompleteCallback = (result: ToolModeResult) => void;

// Map variant index to approach name for display
const INDEX_TO_APPROACH_NAME: Record<number, string> = {
  1: 'Minimal',
  2: 'Feature-rich',
  3: 'Gamified',
  4: 'Accessible',
};

// =============================================================================
// Component/Token Conversion
// =============================================================================

/**
 * Convert store ExtractedComponent to tool schema format
 */
function convertComponentForTools(component: ExtractedComponent): ExtractedComponentForTools {
  return {
    id: component.id,
    name: component.name,
    category: component.category,
    description: component.description,
    html: component.html,
    css: component.css || '',
    props: (component.props || []).map(prop => ({
      name: typeof prop === 'string' ? prop : prop,
      type: 'string',
      required: false,
    })),
    variants: (component.variants || []).map(v => ({
      name: v.name,
      // Store's ComponentVariant has html/css, tool schema expects description/styles
      description: undefined,
      styles: v.css || undefined,
    })),
    approved: component.status === 'approved',
  };
}

/**
 * Convert store DesignToken to tool schema format
 */
function convertTokenForTools(token: DesignToken): ToolDesignToken {
  // Map store category to tool schema category
  const categoryMap: Record<string, string> = {
    'colors': 'color',
    'typography': 'font',
    'spacing': 'spacing',
    'radius': 'radius',
    'shadows': 'shadow',
    'effects': 'shadow',
    'borders': 'border',
  };

  return {
    name: token.name,
    category: (categoryMap[token.category] || token.category) as ToolDesignToken['category'],
    value: token.value,
    cssVariable: token.cssVariable,
  };
}

/**
 * Get approved components from store
 */
export function getApprovedComponents(): ExtractedComponentForTools[] {
  const { components } = useComponentsStore.getState();
  return components
    .filter(c => c.status === 'approved')
    .map(convertComponentForTools);
}

/**
 * Get approved tokens from store
 */
export function getApprovedTokens(): ToolDesignToken[] {
  const { tokens } = useDesignTokensStore.getState();
  return tokens
    .filter(t => t.status === 'approved')
    .map(convertTokenForTools);
}

// =============================================================================
// Spec Generation (Edge Function Call)
// =============================================================================

/**
 * Call the generate-prototype-v2 edge function to get modification spec
 */
async function generateSpec(
  sessionId: string,
  variantIndex: number,
  prompt: string,
  sourceHtml: string,
  components: ExtractedComponentForTools[],
  tokens: ToolDesignToken[],
  options: ToolModeOptions = {}
): Promise<{
  spec: ModificationSpec;
  toolCallCount: number;
  screensGenerated: number;
  durationMs: number;
  model: string;
  provider: string;
}> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase not configured');
  }

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    throw new Error('Not authenticated');
  }

  console.log('[ToolModeGeneration] Calling generate-prototype-v2:', {
    sessionId,
    variantIndex,
    promptLength: prompt.length,
    sourceHtmlLength: sourceHtml.length,
    componentsCount: components.length,
    tokensCount: tokens.length,
  });

  const { data, error } = await supabase.functions.invoke('generate-prototype-v2', {
    body: {
      sessionId,
      variantIndex,
      prompt,
      sourceHtml,
      components,
      tokens,
      includeScreenTools: options.includeScreenTools !== false,
      includeInteractionTools: options.includeInteractionTools !== false,
      provider: options.provider,
      model: options.model,
    },
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  });

  if (error) {
    console.error('[ToolModeGeneration] Edge function error:', error);
    throw new Error(error.message || 'Failed to generate modification spec');
  }

  if (!data.success) {
    console.error('[ToolModeGeneration] Generation failed:', data.error);
    throw new Error(data.error || 'Spec generation failed');
  }

  console.log('[ToolModeGeneration] Spec generated:', {
    toolCallCount: data.toolCallCount,
    screensGenerated: data.screensGenerated,
    durationMs: data.durationMs,
  });

  return {
    spec: data.spec,
    toolCallCount: data.toolCallCount,
    screensGenerated: data.screensGenerated,
    durationMs: data.durationMs,
    model: data.model,
    provider: data.provider,
  };
}

// =============================================================================
// HTML Generation (Apply Modifications + Inject Runtime)
// =============================================================================

/**
 * Apply modification spec to source HTML and inject runtime
 */
async function buildHtmlFromSpec(
  sourceHtml: string,
  spec: ModificationSpec,
  components: ExtractedComponentForTools[],
  tokens: ToolDesignToken[]
): Promise<string> {
  console.log('[ToolModeGeneration] Applying modifications to source HTML...');

  // Apply modifications using domModifier
  const result = await applyModifications(sourceHtml, spec, components, tokens);

  if (result.errors.length > 0) {
    console.warn('[ToolModeGeneration] Some modifications had errors:', result.errors);
  }

  // Get the main screen HTML
  const mainScreenId = spec.navigation?.defaultScreen || 'main';
  let html = result.screens.get(mainScreenId) || result.screens.values().next().value;

  if (!html) {
    throw new Error('No HTML generated from modifications');
  }

  console.log('[ToolModeGeneration] Modifications applied, injecting runtime...');

  // Inject VxRuntime bundle - this is now clean because we control the HTML
  html = injectVxRuntimeBundle(html);

  console.log('[ToolModeGeneration] Runtime injected, HTML ready');

  return html;
}

// =============================================================================
// Main Generation Functions
// =============================================================================

/**
 * Generate a single variant using tool mode
 */
export async function generateVariantToolMode(
  sessionId: string,
  plan: VariantPlan,
  sourceHtml: string,
  onProgress?: ProgressCallback,
  options: ToolModeOptions = {}
): Promise<ToolModeResult> {
  const variantIndex = plan.variant_index;
  const approachName = INDEX_TO_APPROACH_NAME[variantIndex] || `Variant ${variantIndex}`;

  // Get approved components and tokens
  const components = getApprovedComponents();
  const tokens = getApprovedTokens();

  console.log('[ToolModeGeneration] Starting variant generation:', {
    variantIndex,
    title: plan.title,
    componentsAvailable: components.length,
    tokensAvailable: tokens.length,
  });

  onProgress?.({
    stage: 'preparing',
    message: `Preparing ${approachName} variant...`,
    percent: 10,
    variantIndex,
    variantTitle: plan.title,
  });

  // Build the prompt from the plan
  const prompt = buildPromptFromPlan(plan);

  // Step 1: Generate spec from edge function
  onProgress?.({
    stage: 'generating-spec',
    message: `AI is planning modifications for "${plan.title}"...`,
    percent: 30,
    variantIndex,
    variantTitle: plan.title,
  });

  const specResult = await generateSpec(
    sessionId,
    variantIndex,
    prompt,
    sourceHtml,
    components,
    tokens,
    options
  );

  // Step 2: Apply modifications to source HTML
  onProgress?.({
    stage: 'applying-modifications',
    message: `Applying ${specResult.toolCallCount} modifications...`,
    percent: 60,
    variantIndex,
    variantTitle: plan.title,
  });

  const html = await buildHtmlFromSpec(
    sourceHtml,
    specResult.spec,
    components,
    tokens
  );

  // Step 3: Create VirtualFS and update store
  onProgress?.({
    stage: 'injecting-runtime',
    message: 'Preparing preview...',
    percent: 90,
    variantIndex,
    variantTitle: plan.title,
  });

  // Create file list for the store
  const files = [
    { path: 'index.html', content: html, type: 'html' as const },
  ];

  // Find the variant in the store and mark it as ready
  const prototypeStore = usePrototypeStore.getState();
  const approach = INDEX_TO_APPROACH_NAME[variantIndex]?.toLowerCase() || 'standard';
  const variantId = Object.keys(prototypeStore.variants).find(
    id => prototypeStore.variants[id].approach === approach
  );

  let virtualFS: VirtualFS;
  let previewUrl: string;

  if (variantId) {
    // Use store's method which creates VirtualFS internally
    prototypeStore.setVariantReady(variantId, files, []);

    // Get the VirtualFS instance from the store
    virtualFS = prototypeStore.getVirtualFS(variantId) || new VirtualFS({ variantId });
    previewUrl = prototypeStore.variants[variantId]?.previewUrl || virtualFS.createPreviewUrl();
  } else {
    // Fallback: create VirtualFS directly
    console.warn('[ToolModeGeneration] Variant not found in store, creating VirtualFS directly');
    virtualFS = new VirtualFS({
      sessionId,
      variantIndex,
      approach,
    });
    virtualFS.writeFile('index.html', html, 'html');
    previewUrl = virtualFS.createPreviewUrl();
  }

  onProgress?.({
    stage: 'complete',
    message: `${approachName} variant complete!`,
    percent: 100,
    variantIndex,
    variantTitle: plan.title,
  });

  return {
    variantIndex,
    spec: specResult.spec,
    html,
    virtualFS,
    previewUrl,
    toolCallCount: specResult.toolCallCount,
    screensGenerated: specResult.screensGenerated,
  };
}

/**
 * Generate all variants using tool mode
 */
export async function generateAllVariantsToolMode(
  sessionId: string,
  plans: VariantPlan[],
  sourceHtml: string,
  onProgress?: ProgressCallback,
  onVariantComplete?: VariantCompleteCallback,
  options: ToolModeOptions = {}
): Promise<ToolModeResult[]> {
  const results: ToolModeResult[] = [];
  const totalPlans = plans.length;

  // Get approved components and tokens once
  const components = getApprovedComponents();
  const tokens = getApprovedTokens();

  console.log('[ToolModeGeneration] Starting all variants generation:', {
    totalPlans,
    componentsAvailable: components.length,
    tokensAvailable: tokens.length,
  });

  // Initialize prototype store
  const prototypeStore = usePrototypeStore.getState();
  const approaches = plans.map(p => INDEX_TO_APPROACH_NAME[p.variant_index]?.toLowerCase() || 'standard');
  prototypeStore.startGeneration(approaches as any);

  for (let i = 0; i < plans.length; i++) {
    const plan = plans[i];
    const progressBase = (i / totalPlans) * 100;

    try {
      const result = await generateVariantToolMode(
        sessionId,
        plan,
        sourceHtml,
        (progress) => {
          // Scale progress to overall progress
          const scaledPercent = progressBase + (progress.percent / 100) * (100 / totalPlans);
          onProgress?.({
            ...progress,
            percent: Math.round(scaledPercent),
          });
        },
        options
      );

      results.push(result);
      onVariantComplete?.(result);

    } catch (error) {
      console.error(`[ToolModeGeneration] Failed to generate variant ${plan.variant_index}:`, error);

      onProgress?.({
        stage: 'failed',
        message: `Variant ${plan.variant_index} failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        percent: progressBase + (100 / totalPlans),
        variantIndex: plan.variant_index,
        variantTitle: plan.title,
      });

      // Continue with other variants
    }
  }

  return results;
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Build prompt from variant plan
 */
function buildPromptFromPlan(plan: VariantPlan): string {
  const parts = [
    `Create a "${plan.title}" variant.`,
    '',
    `Description: ${plan.description}`,
    '',
    'Key changes to make:',
  ];

  for (const change of plan.key_changes) {
    parts.push(`- ${change}`);
  }

  if (plan.style_notes) {
    parts.push('');
    parts.push(`Style notes: ${plan.style_notes}`);
  }

  return parts.join('\n');
}

/**
 * Check if tool mode should be used
 * Returns true by default - tool mode is the preferred approach because:
 * 1. LLM outputs modification instructions, not raw HTML/JS
 * 2. No script escaping issues (</script> in strings)
 * 3. Cleaner, more predictable output
 * 4. Uses design system when available
 */
export function shouldUseToolMode(): boolean {
  // Tool mode is now the DEFAULT approach
  // It works with or without approved components/tokens
  // (uses generic tools when no design system is available)
  return true;
}

/**
 * Check if tool mode is available (edge function deployed)
 */
export async function isToolModeAvailable(): Promise<boolean> {
  if (!isSupabaseConfigured()) {
    return false;
  }

  try {
    // Quick check if the edge function exists
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return false;
    }

    // We could do a health check here, but for now assume it's available
    return true;
  } catch {
    return false;
  }
}
