/**
 * Component Extraction Service
 * Uses LLM vision capabilities to extract reusable UI components from screens
 */

import { supabase } from './supabase';
import { captureHtmlScreenshot, compressScreenshot } from './screenshotService';

export type ComponentCategory =
  | 'button'
  | 'input'
  | 'card'
  | 'navigation'
  | 'header'
  | 'footer'
  | 'modal'
  | 'list'
  | 'table'
  | 'image'
  | 'icon'
  | 'badge'
  | 'alert'
  | 'form'
  | 'dropdown'
  | 'tabs'
  | 'other';

export interface ComponentVariant {
  name: string;
  html: string;
  css: string;
}

export interface ExtractedComponentLLM {
  id: string;
  name: string;
  category: ComponentCategory;
  description: string;
  html: string;
  css: string;
  variants?: ComponentVariant[];
  props?: string[];
  sourceScreenId: string;
  sourceScreenIds: string[];
  extractedAt: string;
  generatedBy: 'llm';
  occurrences: number;
}

export interface ExtractionProgress {
  screenIndex: number;
  totalScreens: number;
  screenName: string;
  status: 'capturing' | 'extracting' | 'complete' | 'error';
  message: string;
  // Enhanced tracking
  startTime: number;
  elapsedMs: number;
  estimatedTotalMs?: number;
  estimatedRemainingMs?: number;
  screensCompleted: number;
  componentsFound: number;
  currentStep: 'screenshot' | 'compress' | 'upload' | 'llm-processing' | 'parsing' | 'done';
  stepDetail?: string;
}

export interface ExtractionResult {
  success: boolean;
  components: ExtractedComponentLLM[];
  error?: string;
  provider?: string;
  model?: string;
  durationMs?: number;
}

/**
 * Extract components from a single screen using LLM vision
 */
export async function extractComponentsFromScreen(
  screenId: string,
  html: string,
  screenshotBase64?: string,
  options?: {
    provider?: 'anthropic' | 'openai' | 'google';
    model?: string;
  }
): Promise<ExtractionResult> {
  try {
    // Get screenshot if not provided
    let screenshot = screenshotBase64;
    if (!screenshot) {
      console.log('[ComponentExtraction] Capturing screenshot for screen:', screenId);
      const result = await captureHtmlScreenshot(html, {
        maxWidth: 1280,
        maxHeight: 800,
        quality: 0.8,
        format: 'jpeg',
      });

      if (!result) {
        throw new Error('Failed to capture screenshot');
      }

      // Compress if needed (target 400KB for API limits)
      screenshot = await compressScreenshot(result.base64, 400);
    }

    // Get a fresh session - refresh to ensure token is valid
    let accessToken: string | undefined;

    const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError || !refreshData.session) {
      console.log('[ComponentExtraction] Refresh failed, trying getSession:', refreshError?.message);
      // Fall back to getSession if refresh fails
      const { data: { session: fallbackSession } } = await supabase.auth.getSession();
      if (!fallbackSession?.access_token) {
        throw new Error('Not authenticated - please sign in again');
      }
      accessToken = fallbackSession.access_token;
      console.log('[ComponentExtraction] Using fallback session token');
    } else {
      accessToken = refreshData.session.access_token;
      console.log('[ComponentExtraction] Using refreshed session token');
    }

    console.log('[ComponentExtraction] Token available, length:', accessToken.length);

    // Call the edge function with explicit auth header
    console.log('[ComponentExtraction] Calling extract-components edge function');
    const response = await supabase.functions.invoke('extract-components', {
      body: {
        screenId,
        html,
        screenshotBase64: screenshot,
        provider: options?.provider,
        model: options?.model,
      },
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (response.error) {
      console.error('[ComponentExtraction] Edge function error:', response.error);
      // Try to get more details from the response
      const errorDetails = response.error.message || response.error.context?.body || JSON.stringify(response.error);
      throw new Error(errorDetails || 'Edge function error');
    }

    const data = response.data as {
      success: boolean;
      components?: Array<{
        id: string;
        name: string;
        category: string;
        description: string;
        html: string;
        css: string;
        variants?: ComponentVariant[];
        props?: string[];
      }>;
      error?: string;
      provider?: string;
      model?: string;
      durationMs?: number;
    };

    if (!data.success) {
      throw new Error(data.error || 'Extraction failed');
    }

    // Transform components to include source info
    const now = new Date().toISOString();
    const components: ExtractedComponentLLM[] = (data.components || []).map((comp) => ({
      ...comp,
      category: comp.category as ComponentCategory,
      sourceScreenId: screenId,
      sourceScreenIds: [screenId],
      extractedAt: now,
      generatedBy: 'llm' as const,
      occurrences: 1,
    }));

    return {
      success: true,
      components,
      provider: data.provider,
      model: data.model,
      durationMs: data.durationMs,
    };
  } catch (error) {
    console.error('[ComponentExtraction] Error:', error);
    return {
      success: false,
      components: [],
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// Default timeout for LLM extraction (2 minutes per screen)
const EXTRACTION_TIMEOUT_MS = 120000;
// Default concurrency for parallel processing
const DEFAULT_CONCURRENCY = 3;

/**
 * Helper to create a timeout promise
 */
function createTimeout(ms: number, screenName: string): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Extraction timed out after ${ms / 1000}s for "${screenName}"`));
    }, ms);
  });
}

/**
 * Format milliseconds to human-readable string
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = Math.round((ms % 60000) / 1000);
  return `${mins}m ${secs}s`;
}

/**
 * Process a single screen extraction (used for parallel processing)
 */
async function processScreen(
  screen: { id: string; name: string; html: string },
  screenIndex: number,
  totalScreens: number,
  options: {
    provider?: 'anthropic' | 'openai' | 'google';
    model?: string;
    timeoutMs: number;
    onStepChange?: (step: string, detail?: string) => void;
  }
): Promise<{
  screenId: string;
  screenName: string;
  success: boolean;
  components: ExtractedComponentLLM[];
  error?: string;
  durationMs: number;
}> {
  const screenStartTime = Date.now();

  console.log(`[ComponentExtraction] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`[ComponentExtraction] Screen ${screenIndex + 1}/${totalScreens}: "${screen.name}"`);
  console.log(`[ComponentExtraction] Screen ID: ${screen.id}`);
  console.log(`[ComponentExtraction] HTML size: ${(screen.html.length / 1024).toFixed(1)}KB`);

  // Step 1: Capture screenshot
  options.onStepChange?.('screenshot', 'Rendering HTML to canvas');
  let screenshot: string | undefined;

  try {
    console.log(`[ComponentExtraction] Step 1: Capturing screenshot...`);
    const captureStart = Date.now();

    const result = await captureHtmlScreenshot(screen.html, {
      maxWidth: 1280,
      maxHeight: 800,
      quality: 0.8,
      format: 'jpeg',
    });

    if (result) {
      console.log(`[ComponentExtraction] Screenshot captured in ${Date.now() - captureStart}ms`);
      console.log(`[ComponentExtraction] Original size: ${(result.base64.length / 1024).toFixed(1)}KB`);

      // Step 2: Compress screenshot
      options.onStepChange?.('compress', 'Reducing image size for API');
      const compressStart = Date.now();
      screenshot = await compressScreenshot(result.base64, 400);
      console.log(`[ComponentExtraction] Compressed to ${(screenshot.length / 1024).toFixed(1)}KB in ${Date.now() - compressStart}ms`);
    } else {
      console.warn(`[ComponentExtraction] Screenshot capture returned null`);
    }
  } catch (err) {
    console.error('[ComponentExtraction] Screenshot capture error:', err);
  }

  // Step 3: Call LLM API
  options.onStepChange?.('llm-processing', 'AI analyzing components...');
  console.log(`[ComponentExtraction] Step 2: Calling LLM API...`);
  const llmStart = Date.now();

  try {
    // Race between extraction and timeout
    const result = await Promise.race([
      extractComponentsFromScreen(screen.id, screen.html, screenshot, {
        provider: options.provider,
        model: options.model,
      }),
      createTimeout(options.timeoutMs, screen.name),
    ]);

    const llmDuration = Date.now() - llmStart;
    const screenDuration = Date.now() - screenStartTime;
    console.log(`[ComponentExtraction] LLM response received in ${formatDuration(llmDuration)}`);

    if (result.success) {
      console.log(`[ComponentExtraction] ✓ Extracted ${result.components.length} components`);
      console.log(`[ComponentExtraction] Provider: ${result.provider}, Model: ${result.model}`);
      console.log(`[ComponentExtraction] Screen completed in ${formatDuration(screenDuration)}`);

      return {
        screenId: screen.id,
        screenName: screen.name,
        success: true,
        components: result.components,
        durationMs: screenDuration,
      };
    } else {
      console.error(`[ComponentExtraction] ✗ Extraction failed: ${result.error}`);
      return {
        screenId: screen.id,
        screenName: screen.name,
        success: false,
        components: [],
        error: result.error,
        durationMs: screenDuration,
      };
    }
  } catch (err) {
    const screenDuration = Date.now() - screenStartTime;
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    console.error(`[ComponentExtraction] ✗ Exception: ${errorMsg}`);

    return {
      screenId: screen.id,
      screenName: screen.name,
      success: false,
      components: [],
      error: errorMsg,
      durationMs: screenDuration,
    };
  }
}

/**
 * Extract components from multiple screens with parallel processing and progress callbacks
 */
export async function extractComponentsFromMultipleScreens(
  screens: Array<{
    id: string;
    name: string;
    html: string;
    thumbnail?: string;
  }>,
  options?: {
    provider?: 'anthropic' | 'openai' | 'google';
    model?: string;
    onProgress?: (progress: ExtractionProgress) => void;
    onComponentsFound?: (components: ExtractedComponentLLM[], screenName: string) => void;
    timeoutMs?: number;
    concurrency?: number;
  }
): Promise<{
  success: boolean;
  components: ExtractedComponentLLM[];
  errors: Array<{ screenId: string; error: string }>;
}> {
  const allComponents: ExtractedComponentLLM[] = [];
  const errors: Array<{ screenId: string; error: string }> = [];
  const startTime = Date.now();
  const timeout = options?.timeoutMs || EXTRACTION_TIMEOUT_MS;
  const concurrency = options?.concurrency || DEFAULT_CONCURRENCY;

  // Track screen states for parallel progress
  const screenStates = new Map<string, {
    status: 'pending' | 'processing' | 'complete' | 'error';
    step?: string;
    componentsFound: number;
  }>();

  screens.forEach((s) => screenStates.set(s.id, { status: 'pending', componentsFound: 0 }));

  console.log(`[ComponentExtraction] Starting extraction of ${screens.length} screens`);
  console.log(`[ComponentExtraction] Concurrency: ${concurrency}, Timeout: ${timeout / 1000}s`);

  // Helper to report aggregated progress
  const reportProgress = () => {
    const completed = [...screenStates.values()].filter((s) => s.status === 'complete' || s.status === 'error').length;
    const processing = [...screenStates.entries()].filter(([, s]) => s.status === 'processing');
    const currentScreen = processing[0];

    const elapsedMs = Date.now() - startTime;
    const avgTimePerScreen = completed > 0 ? elapsedMs / completed : 60000; // Default estimate: 1 min
    const remainingScreens = screens.length - completed;
    const estimatedRemainingMs = Math.round((avgTimePerScreen * remainingScreens) / concurrency);

    options?.onProgress?.({
      screenIndex: completed,
      totalScreens: screens.length,
      screenName: currentScreen ? screens.find((s) => s.id === currentScreen[0])?.name || '' : '',
      status: completed === screens.length ? 'complete' : 'extracting',
      message: processing.length > 0
        ? `Processing ${processing.length} screen${processing.length > 1 ? 's' : ''} in parallel...`
        : 'Finishing up...',
      startTime,
      elapsedMs,
      estimatedTotalMs: elapsedMs + estimatedRemainingMs,
      estimatedRemainingMs,
      screensCompleted: completed,
      componentsFound: allComponents.length,
      currentStep: currentScreen?.[1].step as ExtractionProgress['currentStep'] || 'llm-processing',
      stepDetail: `${processing.length} of ${concurrency} slots active`,
    });
  };

  // Process screens in parallel with limited concurrency
  const processWithConcurrency = async () => {
    const queue = [...screens.map((s, i) => ({ screen: s, index: i }))];
    const inProgress: Promise<void>[] = [];

    const processNext = async (): Promise<void> => {
      if (queue.length === 0) return;

      const item = queue.shift()!;
      const { screen, index } = item;

      screenStates.set(screen.id, { status: 'processing', componentsFound: 0 });
      reportProgress();

      const result = await processScreen(screen, index, screens.length, {
        provider: options?.provider,
        model: options?.model,
        timeoutMs: timeout,
        onStepChange: (step) => {
          const state = screenStates.get(screen.id);
          if (state) {
            state.step = step;
            reportProgress();
          }
        },
      });

      if (result.success) {
        allComponents.push(...result.components);
        screenStates.set(screen.id, {
          status: 'complete',
          componentsFound: result.components.length,
        });

        // Notify about new components immediately
        if (result.components.length > 0 && options?.onComponentsFound) {
          options.onComponentsFound(result.components, result.screenName);
        }
      } else {
        errors.push({ screenId: result.screenId, error: result.error || 'Unknown error' });
        screenStates.set(screen.id, { status: 'error', componentsFound: 0 });
      }

      reportProgress();

      // Process next item if queue is not empty
      if (queue.length > 0) {
        await processNext();
      }
    };

    // Start initial batch up to concurrency limit
    for (let i = 0; i < Math.min(concurrency, screens.length); i++) {
      inProgress.push(processNext());
    }

    // Wait for all to complete
    await Promise.all(inProgress);
  };

  await processWithConcurrency();

  // Final summary
  const totalDuration = Date.now() - startTime;
  console.log(`[ComponentExtraction] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`[ComponentExtraction] EXTRACTION COMPLETE`);
  console.log(`[ComponentExtraction] Total time: ${formatDuration(totalDuration)}`);
  console.log(`[ComponentExtraction] Screens processed: ${screens.length}`);
  console.log(`[ComponentExtraction] Successful: ${screens.length - errors.length}`);
  console.log(`[ComponentExtraction] Failed: ${errors.length}`);
  console.log(`[ComponentExtraction] Components found: ${allComponents.length}`);
  console.log(`[ComponentExtraction] Effective parallelism: ${concurrency}x`);

  // Deduplicate components by name + category
  const deduplicatedComponents = deduplicateComponents(allComponents);
  console.log(`[ComponentExtraction] After deduplication: ${deduplicatedComponents.length} unique components`);

  return {
    success: errors.length === 0,
    components: deduplicatedComponents,
    errors,
  };
}

/**
 * Deduplicate components across screens by merging similar ones
 */
function deduplicateComponents(
  components: ExtractedComponentLLM[]
): ExtractedComponentLLM[] {
  const componentMap = new Map<string, ExtractedComponentLLM>();

  for (const comp of components) {
    // Create a signature based on category and name similarity
    const signature = `${comp.category}:${normalizeComponentName(comp.name)}`;

    if (componentMap.has(signature)) {
      // Merge with existing
      const existing = componentMap.get(signature)!;
      existing.occurrences++;
      if (!existing.sourceScreenIds.includes(comp.sourceScreenId)) {
        existing.sourceScreenIds.push(comp.sourceScreenId);
      }
      // Merge variants
      if (comp.variants) {
        existing.variants = mergeVariants(existing.variants || [], comp.variants);
      }
    } else {
      componentMap.set(signature, { ...comp });
    }
  }

  // Sort by occurrences (most common first)
  return Array.from(componentMap.values()).sort(
    (a, b) => b.occurrences - a.occurrences
  );
}

/**
 * Normalize component name for deduplication
 */
function normalizeComponentName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 30);
}

/**
 * Merge variant arrays, avoiding duplicates
 */
function mergeVariants(
  existing: ComponentVariant[],
  newVariants: ComponentVariant[]
): ComponentVariant[] {
  const variantMap = new Map<string, ComponentVariant>();

  for (const v of existing) {
    variantMap.set(v.name.toLowerCase(), v);
  }
  for (const v of newVariants) {
    if (!variantMap.has(v.name.toLowerCase())) {
      variantMap.set(v.name.toLowerCase(), v);
    }
  }

  return Array.from(variantMap.values());
}

/**
 * Category display information
 */
export const CATEGORY_INFO: Record<
  ComponentCategory,
  { label: string; icon: string; color: string }
> = {
  button: { label: 'Buttons', icon: 'CursorClick', color: '#3b82f6' },
  input: { label: 'Inputs', icon: 'TextT', color: '#8b5cf6' },
  form: { label: 'Forms', icon: 'Textbox', color: '#ec4899' },
  card: { label: 'Cards', icon: 'Square', color: '#f59e0b' },
  navigation: { label: 'Navigation', icon: 'List', color: '#10b981' },
  header: { label: 'Headers', icon: 'TextHOne', color: '#06b6d4' },
  footer: { label: 'Footers', icon: 'TextAlignBottom', color: '#6366f1' },
  list: { label: 'Lists', icon: 'ListBullets', color: '#84cc16' },
  modal: { label: 'Modals', icon: 'FrameCorners', color: '#f43f5e' },
  image: { label: 'Images', icon: 'Image', color: '#14b8a6' },
  icon: { label: 'Icons', icon: 'Star', color: '#a855f7' },
  badge: { label: 'Badges', icon: 'Tag', color: '#0ea5e9' },
  alert: { label: 'Alerts', icon: 'Warning', color: '#ef4444' },
  dropdown: { label: 'Dropdowns', icon: 'CaretDown', color: '#64748b' },
  tabs: { label: 'Tabs', icon: 'Tabs', color: '#a855f7' },
  table: { label: 'Tables', icon: 'Table', color: '#64748b' },
  other: { label: 'Other', icon: 'Puzzle', color: '#9ca3af' },
};
