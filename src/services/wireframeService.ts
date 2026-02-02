/**
 * Wireframe Service
 * Generates text-based wireframe descriptions for variant plans
 */

import { supabase, isSupabaseConfigured } from './supabase';
import { compactHtml } from './htmlCompactor';
import type { UIMetadata } from './screenAnalyzerService';
import type { VariantPlan } from './variantPlanService';
import { logLLMCall, completeLLMCall, failLLMCall } from '@/store/debugStore';

// Types
export interface WireframeResult {
  variantIndex: number;
  planId: string;
  wireframeText: string;
  layoutDescription: string;
  componentList: string[];
}

// Visual wireframe result with HTML and URL
export interface VisualWireframeResult {
  variantIndex: number;
  planId: string;
  wireframeHtml: string;
  wireframePath: string;
  wireframeUrl: string;
}

export interface GeneratedWireframes {
  wireframes: WireframeResult[];
  model: string;
  provider: string;
}

export interface GeneratedVisualWireframes {
  wireframes: VisualWireframeResult[];
  model: string;
  provider: string;
  durationMs: number;
}

export interface WireframeProgress {
  stage: 'preparing' | 'generating' | 'saving' | 'complete';
  message: string;
  percent: number;
}

type ProgressCallback = (progress: WireframeProgress) => void;

/**
 * Generate wireframes for all variant plans
 */
export async function generateWireframes(
  sessionId: string,
  plans: VariantPlan[],
  html: string,
  uiMetadata?: UIMetadata,
  onProgress?: ProgressCallback,
  screenshotBase64?: string,
  provider?: string,
  model?: string
): Promise<GeneratedWireframes> {
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
    message: 'Preparing wireframe generation...',
    percent: 10,
  });

  // Update session status
  await supabase
    .from('vibe_sessions')
    .update({ status: 'wireframing' })
    .eq('id', sessionId);

  // Compact HTML for smaller payload
  const compactionResult = await compactHtml(html, { method: 'combined-optimal' });
  const compactedHtml = compactionResult.html;

  console.log('[WireframeService] HTML compaction:', {
    originalSize: compactionResult.originalSize,
    compactedSize: compactionResult.compactedSize,
    reductionPercent: compactionResult.reductionPercent,
  });

  // Progress: Generating
  onProgress?.({
    stage: 'generating',
    message: 'AI is creating wireframe layouts...',
    percent: 30,
  });

  // Prepare plans for the edge function
  const plansPayload = plans.map(p => ({
    id: p.id,
    variantIndex: p.variant_index,
    title: p.title,
    description: p.description,
    keyChanges: p.key_changes,
    styleNotes: p.style_notes || '',
  }));

  console.log('[WireframeService] Calling generate-wireframes edge function:', {
    sessionId,
    plansCount: plansPayload.length,
    htmlLength: compactedHtml.length,
  });

  // Call Edge Function
  const { data, error } = await supabase.functions.invoke('generate-wireframes', {
    body: {
      sessionId,
      plans: plansPayload,
      compactedHtml,
      screenshotBase64,
      uiMetadata,
      provider,
      model,
    },
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  });

  if (error) {
    console.error('[WireframeService] Edge function error:', error);
    // Update session status to failed
    await supabase
      .from('vibe_sessions')
      .update({ status: 'failed', error_message: error.message })
      .eq('id', sessionId);
    throw new Error(error.message || 'Failed to generate wireframes');
  }

  if (!data.success) {
    console.error('[WireframeService] Generation failed:', data.error);
    await supabase
      .from('vibe_sessions')
      .update({ status: 'failed', error_message: data.error })
      .eq('id', sessionId);
    throw new Error(data.error || 'Wireframe generation failed');
  }

  // Progress: Complete
  onProgress?.({
    stage: 'complete',
    message: 'Wireframes ready for review!',
    percent: 100,
  });

  console.log('[WireframeService] Generated', data.wireframes?.length, 'wireframes');

  return {
    wireframes: data.wireframes || [],
    model: data.model,
    provider: data.provider,
  };
}

/**
 * Generate visual HTML wireframes with sketch aesthetic
 * These are rendered as iframes instead of ASCII text
 */
export async function generateVisualWireframes(
  sessionId: string,
  plans: VariantPlan[],
  html: string,
  uiMetadata?: UIMetadata,
  selectedVariants?: number[],
  onProgress?: ProgressCallback,
  screenshotBase64?: string,
  provider?: string,
  model?: string
): Promise<GeneratedVisualWireframes> {
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
    message: 'Preparing visual wireframe generation...',
    percent: 10,
  });

  // Update session status
  await supabase
    .from('vibe_sessions')
    .update({ status: 'wireframing' })
    .eq('id', sessionId);

  // Compact HTML for smaller payload
  const compactionResult = await compactHtml(html, { method: 'combined-optimal' });
  const compactedHtml = compactionResult.html;

  console.log('[WireframeService] HTML compaction for visual wireframes:', {
    originalSize: compactionResult.originalSize,
    compactedSize: compactionResult.compactedSize,
    reductionPercent: compactionResult.reductionPercent,
  });

  // Progress: Generating
  onProgress?.({
    stage: 'generating',
    message: 'AI is creating visual wireframe layouts...',
    percent: 30,
  });

  // Prepare plans for the edge function
  const plansPayload = plans.map(p => ({
    id: p.id,
    variantIndex: p.variant_index,
    title: p.title,
    description: p.description,
    keyChanges: p.key_changes,
    styleNotes: p.style_notes || '',
  }));

  console.log('[WireframeService] Calling generate-visual-wireframes edge function:', {
    sessionId,
    plansCount: plansPayload.length,
    selectedVariants,
    htmlLength: compactedHtml.length,
  });

  // Start debug logging
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const debugId = logLLMCall(
    'generate-visual-wireframes',
    `${supabaseUrl}/functions/v1/generate-visual-wireframes`,
    {
      sessionId,
      plans: plansPayload,
      compactedHtml,
      screenshotBase64,
      uiMetadata,
      selectedVariants,
      provider,
      model,
    },
    sessionId
  );

  // Call Visual Wireframes Edge Function
  const { data, error } = await supabase.functions.invoke('generate-visual-wireframes', {
    body: {
      sessionId,
      plans: plansPayload,
      compactedHtml,
      screenshotBase64,
      uiMetadata,
      selectedVariants,
      provider,
      model,
    },
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  });

  if (error) {
    console.error('[WireframeService] Visual wireframe edge function error:', error);
    failLLMCall(debugId, error.message || 'Unknown error');
    // Update session status to failed
    await supabase
      .from('vibe_sessions')
      .update({ status: 'failed', error_message: error.message })
      .eq('id', sessionId);
    throw new Error(error.message || 'Failed to generate visual wireframes');
  }

  if (!data.success) {
    console.error('[WireframeService] Visual wireframe generation failed:', data.error);
    completeLLMCall(debugId, 200, false, data, data.error);
    await supabase
      .from('vibe_sessions')
      .update({ status: 'failed', error_message: data.error })
      .eq('id', sessionId);
    throw new Error(data.error || 'Visual wireframe generation failed');
  }

  // Log successful completion
  completeLLMCall(debugId, 200, true, data);

  // Progress: Saving
  onProgress?.({
    stage: 'saving',
    message: 'Saving visual wireframes...',
    percent: 80,
  });

  // Progress: Complete
  onProgress?.({
    stage: 'complete',
    message: 'Visual wireframes ready for review!',
    percent: 100,
  });

  console.log('[WireframeService] Generated', data.wireframes?.length, 'visual wireframes');

  return {
    wireframes: data.wireframes || [],
    model: data.model,
    provider: data.provider,
    durationMs: data.durationMs,
  };
}

/**
 * Get wireframe data for plans (if already generated)
 */
export async function getWireframesForSession(sessionId: string): Promise<WireframeResult[]> {
  if (!isSupabaseConfigured()) {
    return [];
  }

  const { data, error } = await supabase
    .from('vibe_variant_plans')
    .select('id, variant_index, wireframe_text, layout_description, component_list')
    .eq('session_id', sessionId)
    .not('wireframe_text', 'is', null)
    .order('variant_index', { ascending: true });

  if (error) {
    console.error('[WireframeService] Error fetching wireframes:', error);
    return [];
  }

  return (data || []).map(row => ({
    variantIndex: row.variant_index,
    planId: row.id,
    wireframeText: row.wireframe_text || '',
    layoutDescription: row.layout_description || '',
    componentList: row.component_list || [],
  }));
}

/**
 * Get visual wireframe URLs for plans (if already generated)
 */
export async function getVisualWireframesForSession(sessionId: string): Promise<VisualWireframeResult[]> {
  if (!isSupabaseConfigured()) {
    return [];
  }

  const { data, error } = await supabase
    .from('vibe_variant_plans')
    .select('id, variant_index, wireframe_text, wireframe_url, wireframe_path')
    .eq('session_id', sessionId)
    .not('wireframe_url', 'is', null)
    .order('variant_index', { ascending: true });

  if (error) {
    console.error('[WireframeService] Error fetching visual wireframes:', error);
    return [];
  }

  const result = (data || []).map(row => ({
    variantIndex: row.variant_index,
    planId: row.id,
    wireframeHtml: row.wireframe_text || '', // Body HTML stored for reference
    wireframePath: row.wireframe_path || '',
    wireframeUrl: row.wireframe_url || '',
  }));

  console.log('[WireframeService] Loaded visual wireframes:', result.map(r => ({
    variantIndex: r.variantIndex,
    wireframeUrl: r.wireframeUrl,
    htmlLength: r.wireframeHtml.length,
  })));

  return result;
}
