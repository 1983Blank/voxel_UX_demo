/**
 * Generation Checkpoint Service
 *
 * Saves and loads generation progress to/from database for recovery on refresh.
 * Uses the generation_sessions, generation_variants, and generation_steps tables.
 *
 * Flow:
 * 1. Start generation → createCheckpointSession()
 * 2. Each step completes → saveStepCheckpoint()
 * 3. Variant completes → completeVariantCheckpoint()
 * 4. Page refresh → getActiveCheckpoint() → resumeFromCheckpoint()
 */

import { supabase } from './supabase';
import type { VariantPlan } from './variantPlanService';
import type { GeneratedFile } from '../types/implementationScript';
import type { AgentProgress, AgentPhase } from '../types/agentTypes';

// ============================================================================
// Feature Flag
// ============================================================================

/**
 * Server orchestration feature flag.
 * Set to true when the generation_sessions table is deployed and working.
 * When false, all checkpoint functions return early without making DB queries.
 */
const SERVER_ORCHESTRATION_ENABLED = true;

// ============================================================================
// Types
// ============================================================================

export interface CheckpointSession {
  id: string;
  vibe_session_id: string;
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed';
  generation_context: {
    sourceHtml: string;
    screenshotBase64?: string;
    plans: VariantPlan[];
  };
  current_variant_index: number | null;
  total_variants: number;
  created_at: string;
}

export interface CheckpointVariant {
  id: string;
  generation_session_id: string;
  variant_index: number;
  phase: 'queued' | 'script' | 'files' | 'assembly' | 'complete' | 'failed';
  current_step: string | null;
  completed_steps: number;
  total_steps: number | null;
  implementation_script: Record<string, unknown> | null;
  virtual_fs: {
    files: Array<{ path: string; content: string; type: string }>;
  } | null;
}

export interface CheckpointStep {
  id: string;
  variant_id: string;
  step_key: string;
  step_label: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  file_path: string | null;
  file_content: string | null;
  file_type: string | null;
  duration_ms: number | null;
}

export interface CheckpointData {
  session: CheckpointSession;
  variants: Array<CheckpointVariant & { steps: CheckpointStep[] }>;
}

// ============================================================================
// Session Management
// ============================================================================

/**
 * Create a new checkpoint session when starting generation
 */
export async function createCheckpointSession(
  vibeSessionId: string,
  sourceHtml: string,
  plans: VariantPlan[],
  screenshotBase64?: string
): Promise<CheckpointSession | null> {
  // Skip if server orchestration not enabled
  if (!SERVER_ORCHESTRATION_ENABLED) {
    return null;
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    console.error('[Checkpoint] No authenticated user');
    return null;
  }

  // First, mark any existing running sessions for this vibe session as failed
  const { error: updateError } = await supabase
    .from('generation_sessions')
    .update({ status: 'failed', error_message: 'Superseded by new generation' })
    .eq('vibe_session_id', vibeSessionId)
    .in('status', ['pending', 'running', 'paused']);

  // If table doesn't exist, silently skip checkpoint creation (server orchestration not enabled)
  if (updateError?.code === '42P01' || updateError?.message?.includes('does not exist') ||
      updateError?.message?.includes('406')) {
    console.log('[Checkpoint] Skipping - generation_sessions table not available');
    return null;
  }

  // Create new session
  const { data: session, error: sessionError } = await supabase
    .from('generation_sessions')
    .insert({
      user_id: user.id,
      vibe_session_id: vibeSessionId,
      status: 'running',
      generation_context: {
        sourceHtml,
        screenshotBase64,
        plans,
      },
      total_variants: plans.length,
      started_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (sessionError || !session) {
    // Silently handle table not found errors
    if (sessionError?.code === '42P01' || sessionError?.message?.includes('does not exist') ||
        sessionError?.message?.includes('406')) {
      return null;
    }
    console.error('[Checkpoint] Failed to create session:', sessionError);
    return null;
  }

  // Create variant records
  const variants = plans.map((plan) => ({
    generation_session_id: session.id,
    variant_index: plan.variant_index,
    phase: 'queued' as const,
    completed_steps: 0,
  }));

  const { error: variantsError } = await supabase
    .from('generation_variants')
    .insert(variants);

  if (variantsError) {
    console.error('[Checkpoint] Failed to create variants:', variantsError);
  }

  console.log('[Checkpoint] Created session:', session.id);
  return session;
}

/**
 * Get active (in-progress) checkpoint for a vibe session
 */
export async function getActiveCheckpoint(
  vibeSessionId: string
): Promise<CheckpointData | null> {
  // Skip if server orchestration not enabled
  if (!SERVER_ORCHESTRATION_ENABLED) {
    return null;
  }

  // Get running or paused session
  const { data: session, error: sessionError } = await supabase
    .from('generation_sessions')
    .select('*')
    .eq('vibe_session_id', vibeSessionId)
    .in('status', ['running', 'paused'])
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (sessionError || !session) {
    // Silently handle 406/table not found errors (server orchestration not enabled)
    if (sessionError?.code === 'PGRST116' || sessionError?.message?.includes('406') ||
        sessionError?.code === '42P01' || sessionError?.message?.includes('does not exist')) {
      return null;
    }
    return null;
  }

  // Get variants with their steps
  const { data: variants, error: variantsError } = await supabase
    .from('generation_variants')
    .select('*')
    .eq('generation_session_id', session.id)
    .order('variant_index');

  if (variantsError || !variants) {
    console.error('[Checkpoint] Failed to get variants:', variantsError);
    return null;
  }

  // Get steps for each variant
  const variantsWithSteps = await Promise.all(
    variants.map(async (variant) => {
      const { data: steps } = await supabase
        .from('generation_steps')
        .select('*')
        .eq('variant_id', variant.id)
        .order('created_at');

      return {
        ...variant,
        steps: steps || [],
      };
    })
  );

  console.log('[Checkpoint] Found active session:', session.id, 'with', variants.length, 'variants');
  return {
    session,
    variants: variantsWithSteps,
  };
}

/**
 * Update session status
 */
export async function updateSessionStatus(
  sessionId: string,
  status: 'running' | 'paused' | 'completed' | 'failed',
  errorMessage?: string
): Promise<void> {
  const updates: Record<string, unknown> = { status };

  if (status === 'completed' || status === 'failed') {
    updates.completed_at = new Date().toISOString();
  }
  if (errorMessage) {
    updates.error_message = errorMessage;
  }

  await supabase
    .from('generation_sessions')
    .update(updates)
    .eq('id', sessionId);
}

/**
 * Update current variant index
 */
export async function updateCurrentVariant(
  sessionId: string,
  variantIndex: number
): Promise<void> {
  await supabase
    .from('generation_sessions')
    .update({ current_variant_index: variantIndex })
    .eq('id', sessionId);
}

// ============================================================================
// Variant Management
// ============================================================================

/**
 * Get variant ID by session and index
 */
export async function getVariantId(
  sessionId: string,
  variantIndex: number
): Promise<string | null> {
  const { data } = await supabase
    .from('generation_variants')
    .select('id')
    .eq('generation_session_id', sessionId)
    .eq('variant_index', variantIndex)
    .single();

  return data?.id || null;
}

/**
 * Update variant phase and progress
 */
export async function updateVariantPhase(
  variantId: string,
  phase: 'queued' | 'script' | 'files' | 'assembly' | 'complete' | 'failed',
  currentStep?: string,
  errorMessage?: string
): Promise<void> {
  const updates: Record<string, unknown> = { phase };

  if (currentStep !== undefined) {
    updates.current_step = currentStep;
  }
  if (phase === 'complete' || phase === 'failed') {
    updates.completed_at = new Date().toISOString();
  }
  if (phase === 'script' || phase === 'files') {
    updates.started_at = new Date().toISOString();
  }
  if (errorMessage) {
    updates.error_message = errorMessage;
  }

  await supabase
    .from('generation_variants')
    .update(updates)
    .eq('id', variantId);
}

/**
 * Save implementation script to variant
 */
export async function saveImplementationScript(
  variantId: string,
  script: Record<string, unknown>
): Promise<void> {
  await supabase
    .from('generation_variants')
    .update({
      implementation_script: script,
      phase: 'files',
    })
    .eq('id', variantId);
}

/**
 * Save final VirtualFS to variant
 */
export async function saveVariantVirtualFS(
  variantId: string,
  files: GeneratedFile[]
): Promise<void> {
  await supabase
    .from('generation_variants')
    .update({
      virtual_fs: { files },
      phase: 'complete',
      completed_at: new Date().toISOString(),
    })
    .eq('id', variantId);
}

// ============================================================================
// Step Management
// ============================================================================

/**
 * Create or update a step checkpoint
 */
export async function saveStepCheckpoint(
  variantId: string,
  stepKey: string,
  stepLabel: string,
  status: 'pending' | 'in_progress' | 'completed' | 'failed',
  file?: { path: string; content: string; type: string },
  durationMs?: number,
  errorMessage?: string
): Promise<void> {
  const stepData: Record<string, unknown> = {
    variant_id: variantId,
    step_key: stepKey,
    step_label: stepLabel,
    status,
  };

  if (file) {
    stepData.file_path = file.path;
    stepData.file_content = file.content;
    stepData.file_type = file.type;
  }
  if (durationMs !== undefined) {
    stepData.duration_ms = durationMs;
  }
  if (status === 'in_progress') {
    stepData.started_at = new Date().toISOString();
  }
  if (status === 'completed' || status === 'failed') {
    stepData.completed_at = new Date().toISOString();
  }
  if (errorMessage) {
    stepData.error_message = errorMessage;
  }

  // Upsert - insert or update if exists
  const { error } = await supabase
    .from('generation_steps')
    .upsert(stepData, {
      onConflict: 'variant_id,step_key',
    });

  if (error) {
    console.error('[Checkpoint] Failed to save step:', error);
  }

  // Update variant's completed step count
  if (status === 'completed') {
    const { data: steps } = await supabase
      .from('generation_steps')
      .select('status')
      .eq('variant_id', variantId);

    const completedCount = steps?.filter(s => s.status === 'completed').length || 0;
    const totalCount = steps?.length || 0;

    await supabase
      .from('generation_variants')
      .update({
        completed_steps: completedCount,
        total_steps: totalCount,
      })
      .eq('id', variantId);
  }
}

/**
 * Get completed steps for a variant
 */
export async function getCompletedSteps(
  variantId: string
): Promise<CheckpointStep[]> {
  const { data } = await supabase
    .from('generation_steps')
    .select('*')
    .eq('variant_id', variantId)
    .eq('status', 'completed')
    .order('created_at');

  return data || [];
}

// ============================================================================
// Recovery Helpers
// ============================================================================

/**
 * Build GeneratedFile array from checkpoint steps
 */
export function buildFilesFromCheckpoint(
  steps: CheckpointStep[]
): GeneratedFile[] {
  return steps
    .filter(s => s.status === 'completed' && s.file_path && s.file_content)
    .map(s => ({
      path: s.file_path!,
      content: s.file_content!,
      type: (s.file_type || 'txt') as 'html' | 'js' | 'css' | 'json',
    }));
}

/**
 * Build AgentProgress from checkpoint data
 */
export function buildAgentProgressFromCheckpoint(
  variants: Array<CheckpointVariant & { steps: CheckpointStep[] }>,
  plans: VariantPlan[]
): AgentProgress[] {
  const phaseMap: Record<string, AgentPhase> = {
    queued: 'queued',
    script: 'script',
    files: 'files',
    assembly: 'assembly',
    complete: 'complete',
    failed: 'failed',
  };

  return variants.map((variant) => {
    const plan = plans.find(p => p.variant_index === variant.variant_index);
    const completedFiles = variant.steps
      .filter(s => s.status === 'completed' && s.file_path)
      .map(s => s.file_path!);

    return {
      variantIndex: variant.variant_index,
      variantTitle: plan?.title || `Variant ${variant.variant_index}`,
      approach: (['minimal', 'feature-rich', 'gamified', 'accessible'] as const)[variant.variant_index - 1] || 'minimal',
      phase: phaseMap[variant.phase] || 'queued',
      currentStep: variant.current_step || '',
      completedSteps: variant.completed_steps,
      totalSteps: variant.total_steps || 0,
      filesCompleted: completedFiles,
      steps: variant.steps.map(s => ({
        stepKey: s.step_key,
        label: s.step_label,
        status: s.status as 'pending' | 'in_progress' | 'completed' | 'failed',
        duration: s.duration_ms || undefined,
        filePath: s.file_path || undefined,
      })),
      error: variant.phase === 'failed' ? 'Generation failed' : undefined,
    };
  });
}

/**
 * Determine what needs to be resumed for a variant
 */
export function getResumePoint(
  variant: CheckpointVariant & { steps: CheckpointStep[] }
): {
  needsScript: boolean;
  completedStepKeys: Set<string>;
  lastCompletedStep: string | null;
} {
  const completedStepKeys = new Set(
    variant.steps
      .filter(s => s.status === 'completed')
      .map(s => s.step_key)
  );

  const needsScript = !variant.implementation_script && variant.phase !== 'complete';

  const completedSteps = variant.steps.filter(s => s.status === 'completed');
  const lastCompletedStep = completedSteps.length > 0
    ? completedSteps[completedSteps.length - 1].step_key
    : null;

  return {
    needsScript,
    completedStepKeys,
    lastCompletedStep,
  };
}
