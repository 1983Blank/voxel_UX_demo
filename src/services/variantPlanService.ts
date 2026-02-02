/**
 * Variant Plan Service
 * Generates and manages variant plans (4 concepts) for vibe prototyping
 */

import { supabase, isSupabaseConfigured } from './supabase';
import { compactHtml } from './htmlCompactor';
import type { UIMetadata } from './screenAnalyzerService';
import { logLLMCall, completeLLMCall, failLLMCall } from '@/store/debugStore';

// Types
export interface VariantPlan {
  id: string;
  session_id: string;
  variant_index: number;
  title: string;
  description: string;
  key_changes: string[];
  style_notes: string | null;
  // Wireframe fields (populated after wireframe generation)
  wireframe_text?: string | null;
  layout_description?: string | null;
  component_list?: string[] | null;
  created_at: string;
}

export interface VibeSession {
  id: string;
  user_id: string;
  screen_id: string;
  name: string;
  prompt: string;
  status: 'pending' | 'analyzing' | 'planning' | 'plan_ready' | 'wireframing' | 'wireframe_ready' | 'generating' | 'complete' | 'failed';
  plan_approved: boolean;
  selected_variant_index: number | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface GeneratedPlan {
  session: VibeSession;
  plans: VariantPlan[];
  model: string;
  provider: string;
}

export interface PlanProgress {
  stage: 'preparing' | 'generating' | 'saving' | 'complete';
  message: string;
  percent: number;
}

type ProgressCallback = (progress: PlanProgress) => void;

/**
 * Create a new vibe session
 */
export async function createVibeSession(
  screenId: string,
  name: string,
  prompt: string
): Promise<VibeSession | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('Not authenticated');
  }

  const { data, error } = await supabase
    .from('vibe_sessions')
    .insert({
      user_id: user.id,
      screen_id: screenId,
      name,
      prompt,
      status: 'pending',
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating vibe session:', error);
    throw error;
  }

  return data as VibeSession;
}

/**
 * Get a vibe session by ID
 */
export async function getVibeSession(sessionId: string): Promise<VibeSession | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const { data, error } = await supabase
    .from('vibe_sessions')
    .select('*')
    .eq('id', sessionId)
    .single();

  if (error) {
    console.error('Error fetching vibe session:', error);
    return null;
  }

  return data as VibeSession;
}

/**
 * Get all vibe sessions for a screen
 */
export async function getVibeSessionsForScreen(screenId: string): Promise<VibeSession[]> {
  if (!isSupabaseConfigured()) {
    return [];
  }

  const { data, error } = await supabase
    .from('vibe_sessions')
    .select('*')
    .eq('screen_id', screenId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching vibe sessions:', error);
    return [];
  }

  return (data as VibeSession[]) || [];
}

/**
 * Get variant plans for a session
 */
export async function getVariantPlans(sessionId: string): Promise<VariantPlan[]> {
  if (!isSupabaseConfigured()) {
    return [];
  }

  const { data, error } = await supabase
    .from('vibe_variant_plans')
    .select('*')
    .eq('session_id', sessionId)
    .order('variant_index', { ascending: true });

  if (error) {
    console.error('Error fetching variant plans:', error);
    return [];
  }

  return (data as VariantPlan[]) || [];
}

/**
 * Generate variant plan (4 concepts) using LLM
 */
export async function generateVariantPlan(
  sessionId: string,
  prompt: string,
  html: string,
  uiMetadata?: UIMetadata,
  productContext?: string,
  onProgress?: ProgressCallback,
  screenshotBase64?: string,
  provider?: string,
  model?: string,
  uxGuidelines?: string
): Promise<GeneratedPlan> {
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
    message: 'Preparing context for AI...',
    percent: 10,
  });

  // Update session status
  await supabase
    .from('vibe_sessions')
    .update({ status: 'planning' })
    .eq('id', sessionId);

  // Compact HTML for smaller payload
  const compactionResult = await compactHtml(html, { method: 'combined-optimal' });
  const compactedHtml = compactionResult.html;

  console.log('[VariantPlanService] HTML compaction result:', {
    originalSize: compactionResult.originalSize,
    compactedSize: compactionResult.compactedSize,
    reductionPercent: compactionResult.reductionPercent,
    warnings: compactionResult.warnings,
  });

  // Progress: Generating
  onProgress?.({
    stage: 'generating',
    message: 'AI is designing 4 variants...',
    percent: 30,
  });

  // Call Edge Function using direct fetch for better error visibility (same as V2 edits service)
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const functionUrl = `${supabaseUrl}/functions/v1/generate-variant-plan`;

  console.log('[VariantPlanService] Calling:', functionUrl);

  // Start debug logging
  const debugId = logLLMCall(
    'generate-variant-plan',
    functionUrl,
    {
      sessionId,
      prompt,
      compactedHtml,
      screenshotBase64,
      uiMetadata,
      productContext,
      uxGuidelines,
      provider,
      model,
    },
    sessionId
  );

  const response = await fetch(functionUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      sessionId,
      prompt,
      compactedHtml,
      screenshotBase64,
      uiMetadata,
      productContext,
      uxGuidelines,
      provider,
      model,
    }),
  });

  let data;
  try {
    data = await response.json();
  } catch (e) {
    console.error('[VariantPlanService] Failed to parse response:', e);
    const text = await response.text().catch(() => 'Unable to read response');
    console.error('[VariantPlanService] Raw response:', text);
    failLLMCall(debugId, `Failed to parse response: ${text.slice(0, 200)}`);
    await supabase
      .from('vibe_sessions')
      .update({ status: 'failed', error_message: 'Edge function returned invalid response' })
      .eq('id', sessionId);
    throw new Error(`Edge function returned invalid JSON: ${response.status}`);
  }

  if (!response.ok) {
    console.error('[VariantPlanService] Edge function error:', response.status, data);
    completeLLMCall(debugId, response.status, false, data, data?.error);
    await supabase
      .from('vibe_sessions')
      .update({ status: 'failed', error_message: data?.error || `HTTP ${response.status}` })
      .eq('id', sessionId);
    throw new Error(data?.error || `Edge function failed: ${response.status}`);
  }

  if (!data?.success) {
    completeLLMCall(debugId, response.status, false, data, data?.error);
    await supabase
      .from('vibe_sessions')
      .update({ status: 'failed', error_message: data?.error })
      .eq('id', sessionId);
    throw new Error(data?.error || 'Plan generation failed');
  }

  // Log successful completion
  completeLLMCall(debugId, response.status, true, data);

  // Progress: Saving
  onProgress?.({
    stage: 'saving',
    message: 'Saving variant plans...',
    percent: 80,
  });

  // Get updated session
  const updatedSession = await getVibeSession(sessionId);

  // Progress: Complete
  onProgress?.({
    stage: 'complete',
    message: 'Plan ready for review!',
    percent: 100,
  });

  return {
    session: updatedSession!,
    plans: data.plans,
    model: data.model,
    provider: data.provider,
  };
}

/**
 * Approve the variant plan to proceed with code generation
 */
export async function approvePlan(sessionId: string): Promise<VibeSession | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const { data, error } = await supabase
    .from('vibe_sessions')
    .update({
      plan_approved: true,
      status: 'generating',
    })
    .eq('id', sessionId)
    .select()
    .single();

  if (error) {
    console.error('Error approving plan:', error);
    throw error;
  }

  return data as VibeSession;
}

/**
 * Update a variant plan (user edits before generation)
 */
export async function updateVariantPlan(
  planId: string,
  updates: Partial<Pick<VariantPlan, 'title' | 'description' | 'key_changes' | 'style_notes'>>
): Promise<VariantPlan | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const { data, error } = await supabase
    .from('vibe_variant_plans')
    .update(updates)
    .eq('id', planId)
    .select()
    .single();

  if (error) {
    console.error('Error updating variant plan:', error);
    throw error;
  }

  return data as VariantPlan;
}

/**
 * Delete a vibe session and all related data
 */
export async function deleteVibeSession(sessionId: string): Promise<boolean> {
  if (!isSupabaseConfigured()) {
    return false;
  }

  const { error } = await supabase
    .from('vibe_sessions')
    .delete()
    .eq('id', sessionId);

  if (error) {
    console.error('Error deleting vibe session:', error);
    return false;
  }

  return true;
}
