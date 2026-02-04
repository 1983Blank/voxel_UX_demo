/**
 * Iteration Service
 * Handles variant iterations/refinements based on user prompts
 */

import { supabase, isSupabaseConfigured } from './supabase';

// Types
export interface VibeIteration {
  id: string;
  variant_id: string;
  session_id: string;
  variant_index: number;
  iteration_number: number;
  prompt: string;
  html_before: string;
  html_after: string;
  generation_model: string | null;
  generation_duration_ms: number | null;
  created_at: string;
}

export interface IterationResult {
  success: boolean;
  iteration?: VibeIteration;
  htmlUrl?: string;
  htmlPath?: string;
  iterationNumber?: number;
  generatedHtmlLength?: number;
  durationMs?: number;
  model?: string;
  provider?: string;
  error?: string;
}

export interface IterationProgress {
  stage: 'preparing' | 'generating' | 'saving' | 'complete' | 'failed';
  message: string;
  percent: number;
}

type ProgressCallback = (progress: IterationProgress) => void;

/**
 * Context about other variants for LLM awareness
 */
export interface VariantContext {
  variantIndex: number;
  title: string;
  description: string;
  approach: string;
  screenshotUrl?: string;
}

/**
 * Iterate on a variant with a refinement prompt
 */
export async function iterateOnVariant(
  sessionId: string,
  variantId: string,
  variantIndex: number,
  currentHtml: string,
  iterationPrompt: string,
  onProgress?: ProgressCallback,
  otherVariantsContext?: VariantContext[]
): Promise<IterationResult> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase not configured');
  }

  // Get session for auth token
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    throw new Error('Not authenticated');
  }

  // Progress: Preparing
  onProgress?.({
    stage: 'preparing',
    message: 'Preparing iteration...',
    percent: 10,
  });

  console.log('[IterationService] Starting iteration:', {
    sessionId,
    variantId,
    variantIndex,
    promptLength: iterationPrompt.length,
    htmlLength: currentHtml.length,
  });

  // Progress: Generating
  onProgress?.({
    stage: 'generating',
    message: 'AI is refining the variant...',
    percent: 30,
  });

  // Call Edge Function
  const { data, error } = await supabase.functions.invoke('iterate-variant', {
    body: {
      sessionId,
      variantId,
      variantIndex,
      currentHtml,
      iterationPrompt,
      otherVariantsContext,  // Optional context about other variants
    },
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  });

  if (error) {
    console.error('[IterationService] Edge function error:', error);
    onProgress?.({
      stage: 'failed',
      message: `Failed: ${error.message}`,
      percent: 100,
    });
    return {
      success: false,
      error: error.message || 'Failed to iterate variant',
    };
  }

  if (!data.success) {
    console.error('[IterationService] Iteration failed:', data.error);
    onProgress?.({
      stage: 'failed',
      message: `Failed: ${data.error}`,
      percent: 100,
    });
    return {
      success: false,
      error: data.error || 'Iteration failed',
    };
  }

  // Progress: Complete
  onProgress?.({
    stage: 'complete',
    message: 'Iteration complete!',
    percent: 100,
  });

  console.log('[IterationService] Iteration complete:', {
    iterationNumber: data.iterationNumber,
    htmlLength: data.generatedHtmlLength,
    duration: data.durationMs,
  });

  return {
    success: true,
    iteration: data.iteration,
    htmlUrl: data.htmlUrl,
    htmlPath: data.htmlPath,
    iterationNumber: data.iterationNumber,
    generatedHtmlLength: data.generatedHtmlLength,
    durationMs: data.durationMs,
    model: data.model,
    provider: data.provider,
  };
}

/**
 * Get iteration history for a variant
 */
export async function getIterationHistory(variantId: string): Promise<VibeIteration[]> {
  if (!isSupabaseConfigured()) {
    return [];
  }

  const { data, error } = await supabase
    .from('vibe_iterations')
    .select('*')
    .eq('variant_id', variantId)
    .order('iteration_number', { ascending: true });

  if (error) {
    console.error('[IterationService] Error fetching iteration history:', error);
    return [];
  }

  return (data as VibeIteration[]) || [];
}

/**
 * Get iteration history for all variants in a session
 */
export async function getSessionIterationHistory(sessionId: string): Promise<VibeIteration[]> {
  if (!isSupabaseConfigured()) {
    return [];
  }

  const { data, error } = await supabase
    .from('vibe_iterations')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[IterationService] Error fetching session iteration history:', error);
    return [];
  }

  return (data as VibeIteration[]) || [];
}

/**
 * Revert variant to a previous iteration
 */
export async function revertToIteration(
  variantId: string,
  iterationId: string
): Promise<{ success: boolean; htmlUrl?: string; error?: string }> {
  if (!isSupabaseConfigured()) {
    return { success: false, error: 'Supabase not configured' };
  }

  // Get the iteration
  const { data: iteration, error: iterError } = await supabase
    .from('vibe_iterations')
    .select('*')
    .eq('id', iterationId)
    .single();

  if (iterError || !iteration) {
    return { success: false, error: 'Iteration not found' };
  }

  // Get session for auth
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    return { success: false, error: 'Not authenticated' };
  }

  // Get user ID
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'User not found' };
  }

  // Upload the "before" HTML as the new current version
  const htmlPath = `${user.id}/${iteration.session_id}/variant_${iteration.variant_index}_reverted_${Date.now()}.html`;

  const { error: uploadError } = await supabase.storage
    .from('vibe-files')
    .upload(htmlPath, new Blob([iteration.html_before], { type: 'text/html' }), {
      contentType: 'text/html',
      upsert: true,
    });

  if (uploadError) {
    return { success: false, error: `Upload failed: ${uploadError.message}` };
  }

  const { data: urlData } = supabase.storage
    .from('vibe-files')
    .getPublicUrl(htmlPath);

  // Update the variant
  const { error: updateError } = await supabase
    .from('vibe_variants')
    .update({
      html_path: htmlPath,
      html_url: urlData.publicUrl,
    })
    .eq('id', variantId);

  if (updateError) {
    return { success: false, error: `Update failed: ${updateError.message}` };
  }

  return { success: true, htmlUrl: urlData.publicUrl };
}

/**
 * Delete an iteration (removes from history, doesn't affect variant)
 */
export async function deleteIteration(iterationId: string): Promise<boolean> {
  if (!isSupabaseConfigured()) {
    return false;
  }

  const { error } = await supabase
    .from('vibe_iterations')
    .delete()
    .eq('id', iterationId);

  if (error) {
    console.error('[IterationService] Error deleting iteration:', error);
    return false;
  }

  return true;
}
