/**
 * Variant Code Service
 * Generates HTML/CSS code for variants and manages storage
 */

import { supabase, isSupabaseConfigured } from './supabase';
import type { UIMetadata } from './screenAnalyzerService';
import type { VariantPlan } from './variantPlanService';
import type {
  ModificationSpec,
  ExtractedComponentForTools,
  DesignToken,
} from '@/types/toolSchema';

// Types
export interface VibeVariant {
  id: string;
  session_id: string;
  plan_id: string;
  variant_index: number;
  html_path: string;
  css_path: string | null;
  screenshot_path: string | null;
  html_url: string;
  css_url: string | null;
  screenshot_url: string | null;
  generation_model: string | null;
  generation_duration_ms: number | null;
  token_count: number | null;
  status: 'pending' | 'generating' | 'capturing' | 'complete' | 'failed';
  error_message: string | null;
  iteration_count: number;
  edited_html: string | null;
  edited_at: string | null;
  partial_html: string | null;
  partial_html_updated_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface GenerationProgress {
  stage: 'queued' | 'generating' | 'uploading' | 'complete' | 'failed';
  message: string;
  percent: number;
  variantIndex: number;
  title?: string;
}

type ProgressCallback = (progress: GenerationProgress) => void;

// Custom error class for generation errors with additional context
export class GenerationError extends Error {
  code?: string;
  provider?: string;

  constructor(message: string, code?: string, provider?: string) {
    super(message);
    this.name = 'GenerationError';
    this.code = code;
    this.provider = provider;
  }
}

/**
 * Get all variants for a session
 */
export async function getVariants(sessionId: string): Promise<VibeVariant[]> {
  if (!isSupabaseConfigured()) {
    return [];
  }

  const { data, error } = await supabase
    .from('vibe_variants')
    .select('*')
    .eq('session_id', sessionId)
    .order('variant_index', { ascending: true });

  if (error) {
    console.error('Error fetching variants:', error);
    return [];
  }

  return (data as VibeVariant[]) || [];
}

/**
 * Get a single variant by ID
 */
export async function getVariant(variantId: string): Promise<VibeVariant | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const { data, error } = await supabase
    .from('vibe_variants')
    .select('*')
    .eq('id', variantId)
    .single();

  if (error) {
    console.error('Error fetching variant:', error);
    return null;
  }

  return data as VibeVariant;
}

/**
 * Generate code for a single variant
 */
export async function generateVariantCode(
  sessionId: string,
  plan: VariantPlan,
  sourceHtml: string,
  uiMetadata?: UIMetadata,
  productContext?: string,
  onProgress?: ProgressCallback
): Promise<VibeVariant> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase not configured');
  }

  // Get session for auth token
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    throw new Error('Not authenticated');
  }

  // Progress: Generating
  onProgress?.({
    stage: 'generating',
    message: `Generating "${plan.title}"...`,
    percent: 30,
    variantIndex: plan.variant_index,
    title: plan.title,
  });

  // Debug logging
  console.log('[VariantCodeService] Calling generate-variant-code edge function:', {
    sessionId,
    planId: plan.id,
    variantIndex: plan.variant_index,
    planTitle: plan.title,
    sourceHtmlLength: sourceHtml.length,
    hasMetadata: !!uiMetadata,
    hasContext: !!productContext,
  });

  // Call Edge Function
  const { data, error } = await supabase.functions.invoke('generate-variant-code', {
    body: {
      sessionId,
      planId: plan.id,
      variantIndex: plan.variant_index,
      plan: {
        title: plan.title,
        description: plan.description,
        keyChanges: plan.key_changes,
        styleNotes: plan.style_notes,
      },
      sourceHtml,
      uiMetadata,
      productContext,
    },
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  });

  if (error) {
    onProgress?.({
      stage: 'failed',
      message: `Failed: ${error.message}`,
      percent: 100,
      variantIndex: plan.variant_index,
      title: plan.title,
    });
    throw new Error(error.message || 'Failed to generate variant code');
  }

  if (!data.success) {
    onProgress?.({
      stage: 'failed',
      message: `Failed: ${data.error}`,
      percent: 100,
      variantIndex: plan.variant_index,
      title: plan.title,
    });
    throw new Error(data.error || 'Code generation failed');
  }

  // Progress: Complete
  onProgress?.({
    stage: 'complete',
    message: `Variant ${plan.variant_index} complete!`,
    percent: 100,
    variantIndex: plan.variant_index,
    title: plan.title,
  });

  return data.variant;
}

/**
 * Generate code for all variants sequentially
 * Shows progress as each variant completes
 */
export async function generateAllVariants(
  sessionId: string,
  plans: VariantPlan[],
  sourceHtml: string,
  uiMetadata?: UIMetadata,
  productContext?: string,
  onProgress?: ProgressCallback
): Promise<VibeVariant[]> {
  const variants: VibeVariant[] = [];
  const totalPlans = plans.length;

  for (let i = 0; i < totalPlans; i++) {
    const plan = plans[i];

    // Progress: Starting this variant
    onProgress?.({
      stage: 'generating',
      message: `Generating "${plan.title}" (${i + 1}/${totalPlans})...`,
      percent: Math.round((i / totalPlans) * 100),
      variantIndex: plan.variant_index,
      title: plan.title,
    });

    try {
      const variant = await generateVariantCode(
        sessionId,
        plan,
        sourceHtml,
        uiMetadata,
        productContext,
        (progress) => {
          // Adjust percent for overall progress
          const basePercent = (i / totalPlans) * 100;
          const variantProgress = (progress.percent / 100) * (100 / totalPlans);
          onProgress?.({
            ...progress,
            percent: Math.round(basePercent + variantProgress),
          });
        }
      );
      variants.push(variant);
    } catch (error) {
      console.error(`Failed to generate variant ${plan.variant_index}:`, error);
      // Continue with other variants
      onProgress?.({
        stage: 'failed',
        message: `Variant ${plan.variant_index} failed, continuing...`,
        percent: Math.round(((i + 1) / totalPlans) * 100),
        variantIndex: plan.variant_index,
        title: plan.title,
      });
    }
  }

  return variants;
}

/**
 * Get variant HTML content from URL
 */
export async function fetchVariantHtml(htmlUrl: string): Promise<string> {
  const response = await fetch(htmlUrl);
  if (!response.ok) {
    throw new Error('Failed to fetch variant HTML');
  }
  return response.text();
}

/**
 * Select a variant as the winner
 */
export async function selectVariant(sessionId: string, variantIndex: number): Promise<boolean> {
  if (!isSupabaseConfigured()) {
    return false;
  }

  const { error } = await supabase
    .from('vibe_sessions')
    .update({ selected_variant_index: variantIndex })
    .eq('id', sessionId);

  if (error) {
    console.error('Error selecting variant:', error);
    return false;
  }

  return true;
}

/**
 * Delete a variant (and its files from storage)
 */
export async function deleteVariant(variantId: string): Promise<boolean> {
  if (!isSupabaseConfigured()) {
    return false;
  }

  // Get variant to find file paths
  const variant = await getVariant(variantId);
  if (!variant) {
    return false;
  }

  // Delete files from storage
  const filesToDelete = [variant.html_path, variant.css_path, variant.screenshot_path].filter(Boolean) as string[];

  if (filesToDelete.length > 0) {
    const { error: storageError } = await supabase.storage
      .from('vibe-files')
      .remove(filesToDelete);

    if (storageError) {
      console.error('Error deleting variant files:', storageError);
    }
  }

  // Delete database record
  const { error } = await supabase
    .from('vibe_variants')
    .delete()
    .eq('id', variantId);

  if (error) {
    console.error('Error deleting variant:', error);
    return false;
  }

  return true;
}

/**
 * Save edited HTML for a variant
 */
export async function saveVariantEditedHtml(variantId: string, editedHtml: string): Promise<boolean> {
  if (!isSupabaseConfigured()) {
    return false;
  }

  const { error } = await supabase
    .from('vibe_variants')
    .update({
      edited_html: editedHtml,
      edited_at: new Date().toISOString(),
    })
    .eq('id', variantId);

  if (error) {
    console.error('Error saving variant edited HTML:', error);
    return false;
  }

  return true;
}

/**
 * Save partial HTML during streaming generation
 * This allows resuming preview after page refresh
 */
export async function saveVariantPartialHtml(
  sessionId: string,
  variantIndex: number,
  partialHtml: string
): Promise<boolean> {
  if (!isSupabaseConfigured()) {
    return false;
  }

  const { error } = await supabase
    .from('vibe_variants')
    .update({
      partial_html: partialHtml,
      partial_html_updated_at: new Date().toISOString(),
    })
    .eq('session_id', sessionId)
    .eq('variant_index', variantIndex)
    .eq('status', 'generating');

  if (error) {
    console.error('Error saving variant partial HTML:', error);
    return false;
  }

  return true;
}

/**
 * Get partial HTML for variants in generating state
 * Used to restore streaming preview after page refresh
 */
export async function getPartialHtmlForSession(sessionId: string): Promise<Record<number, string>> {
  if (!isSupabaseConfigured()) {
    return {};
  }

  const { data, error } = await supabase
    .from('vibe_variants')
    .select('variant_index, partial_html')
    .eq('session_id', sessionId)
    .eq('status', 'generating')
    .not('partial_html', 'is', null);

  if (error) {
    console.error('Error fetching partial HTML:', error);
    return {};
  }

  const result: Record<number, string> = {};
  for (const row of data || []) {
    if (row.partial_html) {
      result[row.variant_index] = row.partial_html;
    }
  }
  return result;
}

/**
 * Get variant HTML content - prefers edited_html over original if available
 */
export async function getVariantHtmlContent(variant: VibeVariant): Promise<string> {
  // If there's edited HTML, return that
  if (variant.edited_html) {
    return variant.edited_html;
  }

  // Otherwise, fetch from the original URL
  return fetchVariantHtml(variant.html_url);
}

// Streaming types
export interface StreamingChunk {
  variantIndex: number;
  chunk: string;
  totalLength: number;
}

export interface StreamingComplete {
  variantIndex: number;
  htmlUrl: string;
  htmlPath: string;
  htmlLength: number;
  durationMs: number;
  model: string;
  provider: string;
  allVariantsComplete: boolean;
}

export interface StreamingError {
  variantIndex: number;
  error: string;
}

export interface StreamingProgress {
  variantIndex: number;
  chunksReceived: number;
  htmlLength: number;
}

export type StreamingEvent =
  | { type: 'chunk'; data: StreamingChunk }
  | { type: 'progress'; data: StreamingProgress }
  | { type: 'complete'; data: StreamingComplete }
  | { type: 'error'; data: StreamingError }
  | { type: 'status'; data: { stage: string; variantIndex: number; message: string } };

type StreamingCallback = (event: StreamingEvent) => void;

// Design tokens for vision-first generation
export interface DesignTokens {
  colors: {
    primary: string[];
    secondary: string[];
    background: string[];
    text: string[];
    accent: string[];
  };
  typography: {
    fontFamilies: string[];
    fontSizes: string[];
    fontWeights: string[];
  };
  layout: {
    containerWidths: string[];
    spacing: string[];
  };
  components: Array<{ type: string; count: number }>;
}

/**
 * Generate code for a single variant with streaming (VISION-FIRST)
 * Uses screenshot + design tokens + wireframe instead of source HTML
 */
export async function generateVariantCodeStreaming(
  sessionId: string,
  plan: VariantPlan,
  screenshotBase64: string, // REQUIRED: Screenshot is now primary input
  designTokens?: DesignTokens, // Design system tokens for consistency
  wireframeText?: string, // Layout description from wireframe phase
  productContext?: string,
  onChunk?: StreamingCallback,
  provider?: string,
  model?: string,
  uxGuidelines?: string // UX guidelines extracted from product videos
): Promise<VibeVariant | null> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase not configured');
  }

  // Get session for auth token
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    throw new Error('Not authenticated');
  }

  // Get the Supabase URL for the edge function
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (!supabaseUrl) {
    throw new Error('Supabase URL not configured');
  }

  console.log('[VariantCodeService] Starting VISION-FIRST streaming generation:', {
    sessionId,
    planId: plan.id,
    variantIndex: plan.variant_index,
    planTitle: plan.title,
    screenshotSize: `${Math.round(screenshotBase64.length / 1024)}KB`,
    hasDesignTokens: !!designTokens,
    hasWireframe: !!wireframeText,
    hasProductContext: !!productContext,
    provider,
    model,
  });

  // Build the streaming endpoint URL
  const streamUrl = `${supabaseUrl}/functions/v1/generate-variant-code-streaming`;

  // Make the streaming request (VISION-FIRST: no source HTML)
  const response = await fetch(streamUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      sessionId,
      planId: plan.id,
      variantIndex: plan.variant_index,
      plan: {
        title: plan.title,
        description: plan.description,
        keyChanges: plan.key_changes,
        styleNotes: plan.style_notes,
      },
      // Vision-first approach
      screenshotBase64,
      designTokens,
      wireframeText,
      productContext,
      uxGuidelines,
      provider,
      model,
    }),
  });

  console.log('[VariantCodeService] Response received:', {
    status: response.status,
    statusText: response.statusText,
    contentType: response.headers.get('Content-Type'),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
    console.error('[VariantCodeService] Error response:', errorData);
    // Throw custom error with code and provider for UI handling
    throw new GenerationError(
      errorData.error || `HTTP ${response.status}`,
      errorData.errorCode,
      errorData.provider
    );
  }

  // Check if we got an SSE stream
  const contentType = response.headers.get('Content-Type') || '';
  if (!contentType.includes('text/event-stream')) {
    // Non-streaming response (error)
    const data = await response.json();
    if (!data.success) {
      throw new Error(data.error || 'Streaming failed');
    }
    return data.variant;
  }

  // Process SSE stream
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('No response body');
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let fullHtml = '';
  let result: VibeVariant | null = null;
  let currentEventType = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        // Parse event type
        if (line.startsWith('event: ')) {
          currentEventType = line.slice(7).trim();
          continue;
        }

        // Parse data
        if (line.startsWith('data: ')) {
          const dataStr = line.slice(6);
          try {
            const data = JSON.parse(dataStr);

            if (currentEventType === 'chunk') {
              const chunkData = data as StreamingChunk;
              fullHtml += chunkData.chunk;
              onChunk?.({ type: 'chunk', data: chunkData });
            } else if (currentEventType === 'progress') {
              onChunk?.({ type: 'progress', data: data as StreamingProgress });
            } else if (currentEventType === 'complete') {
              const completeData = data as StreamingComplete;
              onChunk?.({ type: 'complete', data: completeData });
              // Get the updated variant from DB
              const { data: variants } = await supabase
                .from('vibe_variants')
                .select('*')
                .eq('session_id', sessionId)
                .eq('variant_index', plan.variant_index)
                .single();
              result = variants as VibeVariant;
            } else if (currentEventType === 'error') {
              const errorData = data as StreamingError;
              onChunk?.({ type: 'error', data: errorData });
              throw new Error(errorData.error || 'Streaming error');
            } else if (currentEventType === 'status') {
              onChunk?.({ type: 'status', data });
            }

            // Reset event type after processing
            currentEventType = '';
          } catch (parseError) {
            // Skip non-JSON lines
            if (parseError instanceof SyntaxError) continue;
            throw parseError;
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return result;
}

/**
 * Generate code for all variants with streaming (VISION-FIRST)
 * Uses screenshot + design tokens instead of source HTML
 */
export async function generateAllVariantsStreaming(
  sessionId: string,
  plans: VariantPlan[],
  screenshotBase64: string, // REQUIRED: Screenshot is now primary input
  designTokens?: DesignTokens, // Design system tokens for consistency
  wireframeTexts?: Record<number, string>, // Wireframe text per variant index
  productContext?: string,
  onProgress?: ProgressCallback,
  onChunk?: (variantIndex: number, chunk: string, fullHtml: string) => void,
  provider?: string,
  model?: string,
  uxGuidelines?: string // UX guidelines extracted from product videos
): Promise<VibeVariant[]> {
  const variants: VibeVariant[] = [];
  const totalPlans = plans.length;
  const htmlAccumulators: Record<number, string> = {};

  for (let i = 0; i < totalPlans; i++) {
    const plan = plans[i];
    htmlAccumulators[plan.variant_index] = '';

    // Progress: Starting this variant
    onProgress?.({
      stage: 'generating',
      message: `Generating "${plan.title}" (${i + 1}/${totalPlans})...`,
      percent: Math.round((i / totalPlans) * 100),
      variantIndex: plan.variant_index,
      title: plan.title,
    });

    try {
      // Get wireframe text for this variant (if available)
      const wireframeText = wireframeTexts?.[plan.variant_index];

      const variant = await generateVariantCodeStreaming(
        sessionId,
        plan,
        screenshotBase64,
        designTokens,
        wireframeText,
        productContext,
        (event) => {
          if (event.type === 'chunk') {
            htmlAccumulators[plan.variant_index] += event.data.chunk;
            onChunk?.(plan.variant_index, event.data.chunk, htmlAccumulators[plan.variant_index]);
          } else if (event.type === 'complete') {
            onProgress?.({
              stage: 'complete',
              message: `Variant ${plan.variant_index} complete!`,
              percent: Math.round(((i + 1) / totalPlans) * 100),
              variantIndex: plan.variant_index,
              title: plan.title,
            });
          }
        },
        provider,
        model,
        uxGuidelines
      );

      if (variant) {
        console.log(`[VariantCodeService] Variant ${plan.variant_index} generated successfully`);
        variants.push(variant);
      } else {
        console.warn(`[VariantCodeService] Variant ${plan.variant_index} returned null`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[VariantCodeService] Failed to generate variant ${plan.variant_index}:`, errorMessage, error);

      // Re-throw API_KEY_MISSING errors - no point trying other variants
      if (error instanceof GenerationError && error.code === 'API_KEY_MISSING') {
        throw error;
      }

      onProgress?.({
        stage: 'failed',
        message: `Variant ${plan.variant_index} failed: ${errorMessage}`,
        percent: Math.round(((i + 1) / totalPlans) * 100),
        variantIndex: plan.variant_index,
        title: plan.title,
      });
    }
  }

  return variants;
}

/**
 * Get full session data with plans and variants
 */
export async function getFullSession(sessionId: string): Promise<{
  session: import('./variantPlanService').VibeSession;
  plans: VariantPlan[];
  variants: VibeVariant[];
  metadata: import('./screenAnalyzerService').ScreenUIMetadata | null;
} | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  // Use the database function for efficient fetching
  const { data, error } = await supabase.rpc('get_vibe_session_full', {
    p_session_id: sessionId,
  });

  if (error) {
    console.error('Error fetching full session:', error);
    return null;
  }

  if (!data || !data.session) {
    return null;
  }

  return {
    session: data.session,
    plans: data.plans || [],
    variants: data.variants || [],
    metadata: data.screen_metadata || null,
  };
}

// =============================================================================
// Tool-Based Generation (Dynamic Tools Architecture)
// =============================================================================

export interface ToolModeGenerationOptions {
  /** Use tool-based modification mode instead of raw HTML */
  useToolMode: true;
  /** Include multi-screen navigation tools */
  includeScreenTools?: boolean;
  /** Include state/interaction tools */
  includeInteractionTools?: boolean;
  /** Extracted components for the account */
  components?: ExtractedComponentForTools[];
  /** Design tokens for the account */
  tokens?: DesignToken[];
  /** Provider to use */
  provider?: 'anthropic' | 'openai';
  /** Model to use */
  model?: string;
}

export interface ToolModeGenerationResult {
  /** The modification specification */
  spec: ModificationSpec;
  /** Path to stored spec file */
  specPath: string;
  /** Number of tool calls made */
  toolCallCount: number;
  /** Number of screens generated */
  screensGenerated: number;
  /** Generation duration in ms */
  durationMs: number;
  /** Model used */
  model: string;
  /** Provider used */
  provider: string;
}

/**
 * Generate a variant using tool-based modifications
 *
 * Instead of generating raw HTML, this calls an LLM with tool definitions
 * and receives modification instructions that are applied to the source DOM.
 */
export async function generateVariantWithTools(
  sessionId: string,
  variantIndex: number,
  prompt: string,
  sourceHtml: string,
  options: ToolModeGenerationOptions,
  onProgress?: ProgressCallback
): Promise<ToolModeGenerationResult> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase not configured');
  }

  // Get session for auth token
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    throw new Error('Not authenticated');
  }

  // Progress: Starting
  onProgress?.({
    stage: 'generating',
    message: `Generating with tool mode...`,
    percent: 10,
    variantIndex,
  });

  console.log('[VariantCodeService] Calling generate-prototype-v2 edge function:', {
    sessionId,
    variantIndex,
    promptLength: prompt.length,
    sourceHtmlLength: sourceHtml.length,
    hasComponents: !!options.components?.length,
    hasTokens: !!options.tokens?.length,
  });

  // Call the v2 Edge Function
  const { data, error } = await supabase.functions.invoke('generate-prototype-v2', {
    body: {
      sessionId,
      variantIndex,
      prompt,
      sourceHtml,
      components: options.components || [],
      tokens: options.tokens || [],
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
    onProgress?.({
      stage: 'failed',
      message: `Tool generation failed: ${error.message}`,
      percent: 100,
      variantIndex,
    });
    throw new Error(error.message || 'Failed to generate with tools');
  }

  if (!data.success) {
    onProgress?.({
      stage: 'failed',
      message: `Tool generation failed: ${data.error}`,
      percent: 100,
      variantIndex,
    });
    throw new Error(data.error || 'Tool generation failed');
  }

  // Progress: Complete
  onProgress?.({
    stage: 'complete',
    message: `Generated ${data.toolCallCount} modifications`,
    percent: 100,
    variantIndex,
  });

  return {
    spec: data.spec,
    specPath: data.specPath,
    toolCallCount: data.toolCallCount,
    screensGenerated: data.screensGenerated,
    durationMs: data.durationMs,
    model: data.model,
    provider: data.provider,
  };
}

/**
 * Check if a variant was generated with tool mode
 */
export async function isVariantToolMode(
  sessionId: string,
  variantIndex: number
): Promise<boolean> {
  if (!isSupabaseConfigured()) {
    return false;
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return false;
  }

  // Check if spec file exists in storage
  const { data } = await supabase.storage
    .from('vibe-files')
    .list(`${user.id}/${sessionId}`, {
      search: `variant_${variantIndex}_spec.json`,
    });

  return (data?.length || 0) > 0;
}

/**
 * Get the modification spec for a tool-mode variant
 */
export async function getVariantSpec(
  sessionId: string,
  variantIndex: number
): Promise<ModificationSpec | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return null;
  }

  const specPath = `${user.id}/${sessionId}/variant_${variantIndex}_spec.json`;
  const { data, error } = await supabase.storage
    .from('vibe-files')
    .download(specPath);

  if (error || !data) {
    console.log('[VariantCodeService] No spec found for variant:', variantIndex);
    return null;
  }

  try {
    const text = await data.text();
    return JSON.parse(text) as ModificationSpec;
  } catch (parseError) {
    console.error('[VariantCodeService] Failed to parse spec:', parseError);
    return null;
  }
}
