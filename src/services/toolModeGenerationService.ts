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
  stripScripts,
} from './domModifier';
import { saveToolModeVariant } from './variantCodeService';
import type {
  ModificationSpec,
  ExtractedComponentForTools,
  DesignToken as ToolDesignToken,
} from '@/types/toolSchema';
import type { VariantPlan } from './variantPlanService';

// =============================================================================
// Types
// =============================================================================

export interface ToolModeStepProgress {
  stepKey: string;
  label: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
}

export interface ToolModeProgress {
  stage: 'preparing' | 'generating-spec' | 'applying-modifications' | 'injecting-runtime' | 'complete' | 'failed';
  message: string;
  percent: number;
  variantIndex?: number;
  variantTitle?: string;
  /** Custom steps extracted from the modification spec */
  steps?: ToolModeStepProgress[];
  /** Total number of steps */
  totalSteps?: number;
  /** Completed step count */
  completedSteps?: number;
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
// Step Label Generation
// =============================================================================

/**
 * Convert a tool name to a human-readable label
 * Uses context-aware descriptions that make sense to users
 */
function toolToLabel(toolName: string, params?: Record<string, unknown>): string {
  /**
   * Extract a meaningful element description from selector or HTML content
   */
  const getElementDescription = (selector?: string, html?: string): string => {
    // Try to infer what kind of element from HTML content first
    if (html) {
      const htmlStr = String(html).toLowerCase();
      // Specific UI patterns
      if (htmlStr.includes('modal') || htmlStr.includes('dialog')) return 'modal dialog';
      if (htmlStr.includes('sheet') || htmlStr.includes('slide-panel')) return 'slide-out panel';
      if (htmlStr.includes('panel') || htmlStr.includes('drawer')) return 'side panel';
      if (htmlStr.includes('form') && htmlStr.includes('contact')) return 'contact form';
      if (htmlStr.includes('form') && htmlStr.includes('input')) return 'form';
      if (htmlStr.includes('overlay')) return 'overlay';
      if (htmlStr.includes('close') && htmlStr.includes('button')) return 'close button';
      if (htmlStr.includes('submit')) return 'submit button';
      if (htmlStr.includes('button')) return 'button';
      if (htmlStr.includes('<input') && htmlStr.includes('email')) return 'email field';
      if (htmlStr.includes('<input') && htmlStr.includes('phone')) return 'phone field';
      if (htmlStr.includes('<input') && htmlStr.includes('name')) return 'name field';
      if (htmlStr.includes('<input')) return 'form field';
      if (htmlStr.includes('<label')) return 'label';
      if (htmlStr.includes('header')) return 'header';
      if (htmlStr.includes('<h1') || htmlStr.includes('<h2') || htmlStr.includes('<h3')) return 'heading';
    }
    // Try to infer from selector
    if (selector) {
      const sel = String(selector).toLowerCase();
      if (sel.includes('modal')) return 'modal';
      if (sel.includes('sheet')) return 'panel';
      if (sel.includes('panel')) return 'panel';
      if (sel.includes('form')) return 'form';
      if (sel.includes('btn') || sel.includes('button')) return 'button';
      if (sel.includes('input')) return 'input';
      if (sel.includes('header')) return 'header';
      if (sel.includes('footer')) return 'footer';
      if (sel.includes('nav')) return 'navigation';
    }
    return 'element';
  };

  /**
   * Get a specific description for interactive elements based on target
   */
  const getInteractionDescription = (targetSelector?: string): string => {
    if (!targetSelector) return 'element';
    const sel = String(targetSelector).toLowerCase();
    if (sel.includes('modal') || sel.includes('dialog')) return 'modal';
    if (sel.includes('sheet') || sel.includes('slide')) return 'slide panel';
    if (sel.includes('panel') || sel.includes('drawer')) return 'side panel';
    if (sel.includes('menu') || sel.includes('dropdown')) return 'dropdown menu';
    if (sel.includes('tooltip')) return 'tooltip';
    if (sel.includes('form')) return 'form';
    if (sel.includes('accordion')) return 'accordion';
    return 'panel';
  };

  // Handle insert_* tools (component insertions)
  if (toolName.startsWith('insert_')) {
    const componentPart = toolName.replace('insert_', '').replace(/_/g, ' ');
    if (componentPart.includes('generic')) {
      // More specific labels for generic components
      if (componentPart.includes('button')) return 'Adding trigger button';
      if (componentPart.includes('input')) return 'Adding form input';
      if (componentPart.includes('card')) return 'Adding content card';
      if (componentPart.includes('modal')) return 'Creating modal dialog';
      if (componentPart.includes('panel')) return 'Creating slide panel';
      if (componentPart.includes('form')) return 'Building form';
    }
    const label = componentPart.split(' ').map(w =>
      w.charAt(0).toUpperCase() + w.slice(1)
    ).join(' ');
    return `Adding ${label}`;
  }

  // User-friendly labels for all tools
  const html = params?.html as string | undefined;
  const selector = params?.selector as string | undefined;
  const targetSelector = params?.targetSelector as string | undefined;
  const elementDesc = getElementDescription(selector, html);

  // Build dynamic labels based on tool and params
  const toolLabels: Record<string, string | (() => string)> = {
    // DOM modification tools - context-aware
    'update_text': () => {
      const text = params?.text as string;
      if (text) {
        const trimmed = text.slice(0, 30);
        return `Setting text: "${trimmed}${text.length > 30 ? '...' : ''}"`;
      }
      return 'Updating text';
    },
    'update_html': () => `Building ${elementDesc}`,
    'update_attribute': () => {
      const attr = params?.attribute as string;
      if (attr === 'class') return 'Applying CSS classes';
      if (attr === 'id') return 'Setting element ID';
      if (attr === 'href') return 'Setting link URL';
      if (attr === 'src') return 'Setting image source';
      if (attr === 'placeholder') return 'Setting placeholder text';
      return `Setting ${attr || 'attribute'}`;
    },
    'remove_element': () => `Removing ${elementDesc}`,
    'add_element': () => {
      const desc = getElementDescription(undefined, html);
      // Make it more specific based on content
      if (html?.toLowerCase().includes('close')) return 'Adding close button';
      if (html?.toLowerCase().includes('submit')) return 'Adding submit button';
      if (desc === 'modal dialog') return 'Building contact form modal';
      if (desc === 'slide-out panel') return 'Creating slide-out panel';
      if (desc === 'form') return 'Building form structure';
      if (desc === 'form field') return 'Adding form input field';
      return `Adding ${desc}`;
    },
    'add_class': () => {
      const classes = params?.classes as string;
      if (classes?.includes('hidden')) return 'Hiding element initially';
      if (classes?.includes('active')) return 'Setting active state';
      return 'Applying styles';
    },
    'remove_class': 'Removing styles',
    'wrap_element': 'Restructuring layout',
    'set_style': () => {
      const styles = params?.styles as Record<string, unknown>;
      if (styles?.display === 'none') return 'Hiding element';
      if (styles?.display === 'flex') return 'Setting flex layout';
      return 'Applying inline styles';
    },
    'hide_element': () => `Hiding ${elementDesc}`,
    'show_element': () => `Revealing ${elementDesc}`,

    // Style tools
    'apply_style': 'Applying design system styles',

    // Screen tools
    'create_screen': () => {
      const screenId = params?.screenId as string;
      return screenId ? `Creating "${screenId}" screen` : 'Creating new screen';
    },
    'add_navigation': 'Wiring up navigation',
    'define_route': () => {
      const path = params?.path as string;
      return path ? `Setting route: ${path}` : 'Configuring route';
    },

    // Interaction tools - context-aware
    'add_click_toggle': () => {
      const targetDesc = getInteractionDescription(targetSelector);
      return `Wiring button to open ${targetDesc}`;
    },
    'set_initial_hidden': () => {
      const targetDesc = getInteractionDescription(selector);
      return `Hiding ${targetDesc} initially`;
    },
    'add_hover_effect': () => {
      const targetDesc = getInteractionDescription(targetSelector);
      return `Adding hover reveal for ${targetDesc}`;
    },
    'add_tab_interaction': 'Configuring tab switching',
    'add_accordion_interaction': 'Setting up expandable sections',
    'add_form_validation': 'Adding input validation',
  };

  const labelOrFn = toolLabels[toolName];
  if (labelOrFn) {
    return typeof labelOrFn === 'function' ? labelOrFn() : labelOrFn;
  }

  // Fallback: make tool name readable
  return toolName
    .replace(/_/g, ' ')
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Extract step progress items from a ModificationSpec
 * Creates custom labels for each modification
 */
function extractStepsFromSpec(spec: ModificationSpec): ToolModeStepProgress[] {
  const steps: ToolModeStepProgress[] = [];

  // Add base steps
  steps.push({
    stepKey: 'preparing',
    label: 'Preparing',
    status: 'completed',
  });

  steps.push({
    stepKey: 'ai-planning',
    label: 'AI Planning',
    status: 'completed',
  });

  // Add a step for each modification
  let modIndex = 0;
  for (const screen of spec.screens) {
    for (const mod of screen.modifications) {
      steps.push({
        stepKey: `mod-${modIndex}`,
        label: toolToLabel(mod.tool, mod.params),
        status: 'pending',
      });
      modIndex++;
    }
  }

  // Add final steps
  steps.push({
    stepKey: 'building-preview',
    label: 'Building Preview',
    status: 'pending',
  });

  steps.push({
    stepKey: 'complete',
    label: 'Complete',
    status: 'pending',
  });

  return steps;
}

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

  // Truncate source HTML to reduce payload size
  // The edge function only uses the first 50000 chars for LLM context anyway
  const maxSourceHtmlSize = 100000; // 100KB max, edge function further truncates to 50KB for LLM
  const truncatedHtml = sourceHtml.length > maxSourceHtmlSize
    ? sourceHtml.slice(0, maxSourceHtmlSize)
    : sourceHtml;

  console.log('[ToolModeGeneration] Calling generate-prototype-v2:', {
    sessionId,
    variantIndex,
    promptLength: prompt.length,
    sourceHtmlLength: sourceHtml.length,
    truncatedHtmlLength: truncatedHtml.length,
    componentsCount: components.length,
    tokensCount: tokens.length,
  });

  const { data, error } = await supabase.functions.invoke('generate-prototype-v2', {
    body: {
      sessionId,
      variantIndex,
      prompt,
      sourceHtml: truncatedHtml,
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
    // Try to extract more details from the error
    const errorContext = (error as { context?: { json?: () => Promise<unknown> } })?.context;
    if (errorContext?.json) {
      try {
        const errorBody = await errorContext.json();
        console.error('[ToolModeGeneration] Error body:', errorBody);
        const errorMessage = (errorBody as { error?: string })?.error;
        if (errorMessage) {
          throw new Error(errorMessage);
        }
      } catch (parseErr) {
        console.error('[ToolModeGeneration] Failed to parse error body:', parseErr);
      }
    }
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
 * Returns both the HTML and the interaction state for the runtime state panel
 */
async function buildHtmlFromSpec(
  sourceHtml: string,
  spec: ModificationSpec,
  components: ExtractedComponentForTools[],
  tokens: ToolDesignToken[]
): Promise<{
  html: string;
  interactionState?: {
    hiddenSelectors: string[];
    clickToggles: Array<{
      triggerSelector: string;
      targetSelector: string;
      closeOnClickOutside?: boolean;
      closeButtonSelector?: string;
    }>;
    hoverEffects: Array<{
      triggerSelector: string;
      targetSelector: string;
    }>;
    tabInteractions: Array<{
      tabsSelector: string;
      panelsSelector: string;
    }>;
    accordions: Array<{
      containerSelector: string;
      headerSelector: string;
      contentSelector: string;
    }>;
  };
}> {
  console.log('[ToolModeGeneration] Stripping scripts from source HTML...');

  // Strip scripts from source HTML to prevent errors from original page's JavaScript
  const cleanedHtml = stripScripts(sourceHtml);
  console.log('[ToolModeGeneration] Source HTML reduced from', sourceHtml.length, 'to', cleanedHtml.length, 'bytes');

  // Debug: Check script tag balance after stripping
  const countTags = (s: string, tag: string) => (s.match(new RegExp(tag, 'gi')) || []).length;
  console.log('[ToolModeGeneration:DEBUG] After strip - <script>:', countTags(cleanedHtml, '<script'));
  console.log('[ToolModeGeneration:DEBUG] After strip - </script>:', countTags(cleanedHtml, '</script>'));

  console.log('[ToolModeGeneration] Applying modifications to cleaned HTML...');

  // Apply modifications using domModifier
  const result = await applyModifications(cleanedHtml, spec, components, tokens);

  if (result.errors.length > 0) {
    console.warn('[ToolModeGeneration] Some modifications had errors:', result.errors);
  }

  // Get the main screen HTML
  const mainScreenId = spec.navigation?.defaultScreen || 'main';
  let html = result.screens.get(mainScreenId) || result.screens.values().next().value;

  if (!html) {
    throw new Error('No HTML generated from modifications');
  }

  // Debug: Check script tag balance after modifications
  console.log('[ToolModeGeneration:DEBUG] After mods - <script>:', countTags(html, '<script'));
  console.log('[ToolModeGeneration:DEBUG] After mods - </script>:', countTags(html, '</script>'));
  console.log('[ToolModeGeneration:DEBUG] After mods - </head> index:', html.indexOf('</head>'));

  console.log('[ToolModeGeneration] Modifications applied, injecting runtime...');

  // Inject VxRuntime bundle - this is now clean because we control the HTML
  html = injectVxRuntimeBundle(html);

  // Debug: Check script tag balance after injection
  console.log('[ToolModeGeneration:DEBUG] After inject - <script>:', countTags(html, '<script'));
  console.log('[ToolModeGeneration:DEBUG] After inject - </script>:', countTags(html, '</script>'));

  // Debug: Check for VxRuntime content
  const runtimeIndex = html.indexOf('VxRuntime:DIAG');
  console.log('[ToolModeGeneration:DEBUG] VxRuntime:DIAG found at index:', runtimeIndex);
  if (runtimeIndex > 0) {
    console.log('[ToolModeGeneration:DEBUG] 200 chars before DIAG:', html.slice(Math.max(0, runtimeIndex - 200), runtimeIndex));
  }

  console.log('[ToolModeGeneration] Runtime injected, HTML ready');

  return {
    html,
    interactionState: result.interactionState,
  };
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

  // Extract custom steps from the spec
  const customSteps = extractStepsFromSpec(specResult.spec);
  const totalSteps = customSteps.length;

  // Update AI Planning step to completed
  customSteps[1].status = 'completed'; // AI Planning step

  // Step 2: Apply modifications to source HTML - show each modification as a step
  const modificationCount = specResult.spec.screens.reduce(
    (sum, s) => sum + s.modifications.length, 0
  );

  // Simulate progress through modification steps
  let completedMods = 0;
  for (const screen of specResult.spec.screens) {
    for (let i = 0; i < screen.modifications.length; i++) {
      const mod = screen.modifications[i];
      const stepIndex = 2 + completedMods; // Skip "Preparing" and "AI Planning"

      // Mark current step as in_progress
      if (customSteps[stepIndex]) {
        customSteps[stepIndex].status = 'in_progress';
      }

      onProgress?.({
        stage: 'applying-modifications',
        message: toolToLabel(mod.tool, mod.params),
        percent: 30 + Math.round((completedMods / modificationCount) * 50),
        variantIndex,
        variantTitle: plan.title,
        steps: [...customSteps], // Send a copy
        totalSteps,
        completedSteps: 2 + completedMods,
      });

      // Mark step as completed (in practice, all mods are applied at once,
      // but we show progress for better UX)
      if (customSteps[stepIndex]) {
        customSteps[stepIndex].status = 'completed';
      }
      completedMods++;
    }
  }

  // Now show the final "applying modifications" progress
  onProgress?.({
    stage: 'applying-modifications',
    message: `Applied ${specResult.toolCallCount} modifications`,
    percent: 80,
    variantIndex,
    variantTitle: plan.title,
    steps: customSteps,
    totalSteps,
    completedSteps: 2 + modificationCount,
  });

  const buildResult = await buildHtmlFromSpec(
    sourceHtml,
    specResult.spec,
    components,
    tokens
  );

  const { html, interactionState } = buildResult;

  // Step 3: Create VirtualFS and update store
  // Mark Building Preview step as in_progress
  const buildingPreviewIndex = customSteps.length - 2;
  if (customSteps[buildingPreviewIndex]) {
    customSteps[buildingPreviewIndex].status = 'in_progress';
  }

  onProgress?.({
    stage: 'injecting-runtime',
    message: 'Building Preview',
    percent: 90,
    variantIndex,
    variantTitle: plan.title,
    steps: customSteps,
    totalSteps,
    completedSteps: totalSteps - 2,
  });

  // Create file list for the store
  const files = [
    { path: 'index.html', content: html, type: 'html' as const },
  ];

  // Convert interaction state to runtime state format for the State Inspector panel
  const runtimeState: Record<string, unknown> = {};
  if (interactionState) {
    // Track hidden elements
    if (interactionState.hiddenSelectors.length > 0) {
      runtimeState.hiddenElements = interactionState.hiddenSelectors.reduce((acc, selector) => {
        // Convert selector to a readable key
        const key = selector.replace(/[#.[\]]/g, '').replace(/\s+/g, '_');
        acc[key] = { selector, visible: false };
        return acc;
      }, {} as Record<string, { selector: string; visible: boolean }>);
    }

    // Track click toggles (modals, panels, etc.)
    if (interactionState.clickToggles.length > 0) {
      runtimeState.toggles = interactionState.clickToggles.reduce((acc, toggle, index) => {
        const triggerKey = toggle.triggerSelector.replace(/[#.[\]]/g, '').replace(/\s+/g, '_') || `toggle_${index}`;
        acc[triggerKey] = {
          trigger: toggle.triggerSelector,
          target: toggle.targetSelector,
          isOpen: false,
          closeOnClickOutside: toggle.closeOnClickOutside ?? true,
        };
        return acc;
      }, {} as Record<string, unknown>);
    }

    // Track hover effects
    if (interactionState.hoverEffects.length > 0) {
      runtimeState.hoverEffects = interactionState.hoverEffects.map(effect => ({
        trigger: effect.triggerSelector,
        target: effect.targetSelector,
        isHovering: false,
      }));
    }

    // Track tabs
    if (interactionState.tabInteractions.length > 0) {
      runtimeState.tabs = interactionState.tabInteractions.map((tab, index) => ({
        id: `tabs_${index}`,
        container: tab.tabsSelector,
        panels: tab.panelsSelector,
        activeIndex: 0,
      }));
    }

    // Track accordions
    if (interactionState.accordions.length > 0) {
      runtimeState.accordions = interactionState.accordions.map((accordion, index) => ({
        id: `accordion_${index}`,
        container: accordion.containerSelector,
        expandedItems: [],
      }));
    }

    console.log('[ToolModeGeneration] Created runtime state from interactions:', runtimeState);
  }

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

    // Set the runtime state if we have interaction state
    if (Object.keys(runtimeState).length > 0) {
      prototypeStore.setRuntimeState(runtimeState);
    }

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

  // Mark all steps as completed
  customSteps.forEach(step => { step.status = 'completed'; });

  // Save variant to storage and database for persistence across refreshes
  try {
    await saveToolModeVariant(
      sessionId,
      plan.id,
      variantIndex,
      html,
      specResult.spec,
      specResult.model,
      specResult.provider
    );
    console.log('[ToolModeGeneration] Variant saved to database:', variantIndex);
  } catch (saveError) {
    // Log but don't fail - the variant is still usable in memory
    console.error('[ToolModeGeneration] Failed to save variant to database:', saveError);
  }

  onProgress?.({
    stage: 'complete',
    message: `${approachName} variant complete!`,
    percent: 100,
    variantIndex,
    variantTitle: plan.title,
    steps: customSteps,
    totalSteps,
    completedSteps: totalSteps,
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
