/**
 * Server Generation Service
 *
 * Client-side service for server-persistent prototype generation.
 * Handles starting generation, Realtime subscriptions, and reconnection.
 *
 * Key features:
 * - Starts generation on server (survives page refresh)
 * - Subscribes to Realtime for streaming progress updates
 * - Syncs from server state on reconnection
 * - Handles continuation for timeout recovery
 */

import { supabase, isSupabaseConfigured } from './supabase';
import { VirtualFS } from '../runtime/virtual-fs';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import type { VariantPlan } from './variantPlanService';
import type { DesignToken, GeneratedFile, VariantApproach } from '../types/implementationScript';
import type { AgentProgress, AgentPhase, AgentStepProgress } from '../types/agentTypes';

// ============================================================================
// Types
// ============================================================================

export interface ServerGenerationSession {
  id: string;
  user_id: string;
  vibe_session_id: string;
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed';
  generation_context: {
    vibeSessionId: string;
    sourceHtml: string;
    screenshotBase64?: string;
    designTokens: DesignToken[];
    plans: VariantPlan[];
    provider?: 'anthropic' | 'openai' | 'google';
    model?: string;
  };
  current_variant_index: number | null;
  total_variants: number;
  continuation_token: string | null;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface ServerGenerationVariant {
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
    metadata: Record<string, unknown>;
  } | null;
  preview_url: string | null;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ServerGenerationStep {
  id: string;
  variant_id: string;
  step_key: string;
  step_label: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  file_path: string | null;
  file_content: string | null;
  file_type: string | null;
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
  error_message: string | null;
  created_at: string;
}

export interface ServerGenerationProgress {
  session: ServerGenerationSession;
  variants: Array<ServerGenerationVariant & { steps: ServerGenerationStep[] }>;
}

export interface StartServerGenerationParams {
  vibeSessionId: string;
  sourceHtml: string;
  screenshotBase64?: string;
  designTokens?: DesignToken[];
  plans: VariantPlan[];
  provider?: 'anthropic' | 'openai' | 'google';
  model?: string;
}

// Map variant index to approach
const INDEX_TO_APPROACH: Record<number, VariantApproach> = {
  1: 'minimal',
  2: 'feature-rich',
  3: 'gamified',
  4: 'accessible',
};

// ============================================================================
// Server Generation API
// ============================================================================

/**
 * Start server-side generation
 */
export async function startServerGeneration(
  params: StartServerGenerationParams
): Promise<{ sessionId: string; status: string }> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase not configured');
  }

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    throw new Error('Not authenticated');
  }

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const response = await fetch(`${supabaseUrl}/functions/v1/orchestrate-generation`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Server generation failed: ${response.status}`);
  }

  return response.json();
}

/**
 * Continue a paused generation session
 */
export async function continueServerGeneration(
  sessionId: string,
  continuationToken: string
): Promise<{ sessionId: string; status: string }> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase not configured');
  }

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    throw new Error('Not authenticated');
  }

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const response = await fetch(`${supabaseUrl}/functions/v1/orchestrate-generation`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ sessionId, continuationToken }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Continue generation failed: ${response.status}`);
  }

  return response.json();
}

/**
 * Get active generation session for a vibe session
 */
export async function getActiveGeneration(
  vibeSessionId: string
): Promise<ServerGenerationSession | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const { data, error } = await supabase
    .from('generation_sessions')
    .select('*')
    .eq('vibe_session_id', vibeSessionId)
    .in('status', ['pending', 'running', 'paused'])
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      // No rows found
      return null;
    }
    console.error('[ServerGeneration] Error getting active session:', error);
    return null;
  }

  return data;
}

/**
 * Get full generation progress with variants and steps
 */
export async function getGenerationProgress(
  sessionId: string
): Promise<ServerGenerationProgress | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const { data, error } = await supabase.rpc('get_generation_progress', {
    p_session_id: sessionId,
  });

  if (error) {
    console.error('[ServerGeneration] Error getting progress:', error);
    return null;
  }

  return data;
}

/**
 * Get generation session by ID
 */
export async function getGenerationSession(
  sessionId: string
): Promise<ServerGenerationSession | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const { data, error } = await supabase
    .from('generation_sessions')
    .select('*')
    .eq('id', sessionId)
    .single();

  if (error) {
    console.error('[ServerGeneration] Error getting session:', error);
    return null;
  }

  return data;
}

/**
 * Get generation variants for a session
 */
export async function getGenerationVariants(
  sessionId: string
): Promise<ServerGenerationVariant[]> {
  if (!isSupabaseConfigured()) {
    return [];
  }

  const { data, error } = await supabase
    .from('generation_variants')
    .select('*')
    .eq('generation_session_id', sessionId)
    .order('variant_index');

  if (error) {
    console.error('[ServerGeneration] Error getting variants:', error);
    return [];
  }

  return data || [];
}

/**
 * Get generation steps for a variant
 */
export async function getGenerationSteps(
  variantId: string
): Promise<ServerGenerationStep[]> {
  if (!isSupabaseConfigured()) {
    return [];
  }

  const { data, error } = await supabase
    .from('generation_steps')
    .select('*')
    .eq('variant_id', variantId)
    .order('created_at');

  if (error) {
    console.error('[ServerGeneration] Error getting steps:', error);
    return [];
  }

  return data || [];
}

// ============================================================================
// Realtime Subscription
// ============================================================================

export interface RealtimeCallbacks {
  onSessionUpdate?: (session: ServerGenerationSession) => void;
  onVariantUpdate?: (variant: ServerGenerationVariant) => void;
  onStepUpdate?: (step: ServerGenerationStep) => void;
  onError?: (error: Error) => void;
}

/**
 * Subscribe to generation progress via Realtime
 */
export function subscribeToGeneration(
  sessionId: string,
  callbacks: RealtimeCallbacks
): RealtimeChannel {
  const channel = supabase
    .channel(`generation:${sessionId}`)
    // Session updates
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'generation_sessions',
        filter: `id=eq.${sessionId}`,
      },
      (payload: RealtimePostgresChangesPayload<ServerGenerationSession>) => {
        console.log('[ServerGeneration] Session update:', payload.new);
        callbacks.onSessionUpdate?.(payload.new as ServerGenerationSession);
      }
    )
    // Variant updates
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'generation_variants',
        filter: `generation_session_id=eq.${sessionId}`,
      },
      (payload: RealtimePostgresChangesPayload<ServerGenerationVariant>) => {
        console.log('[ServerGeneration] Variant update:', payload.new);
        callbacks.onVariantUpdate?.(payload.new as ServerGenerationVariant);
      }
    )
    .subscribe((status) => {
      console.log('[ServerGeneration] Subscription status:', status);
      if (status === 'CHANNEL_ERROR') {
        callbacks.onError?.(new Error('Realtime subscription error'));
      }
    });

  return channel;
}

/**
 * Subscribe to step updates for a specific variant
 */
export function subscribeToVariantSteps(
  variantId: string,
  onStepUpdate: (step: ServerGenerationStep) => void
): RealtimeChannel {
  return supabase
    .channel(`variant-steps:${variantId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'generation_steps',
        filter: `variant_id=eq.${variantId}`,
      },
      (payload: RealtimePostgresChangesPayload<ServerGenerationStep>) => {
        console.log('[ServerGeneration] Step update:', payload.new);
        onStepUpdate(payload.new as ServerGenerationStep);
      }
    )
    .subscribe();
}

/**
 * Unsubscribe from a Realtime channel
 */
export function unsubscribeFromGeneration(channel: RealtimeChannel): void {
  supabase.removeChannel(channel);
}

// ============================================================================
// VirtualFS Integration
// ============================================================================

/**
 * Build VirtualFS from server generation steps
 */
export function buildVirtualFSFromSteps(
  steps: ServerGenerationStep[],
  metadata?: Record<string, unknown>
): VirtualFS {
  const virtualFS = new VirtualFS(metadata);

  for (const step of steps) {
    if (step.status === 'completed' && step.file_path && step.file_content) {
      const fileType = step.file_type as 'html' | 'js' | 'css' | 'json' | undefined;
      virtualFS.writeFile(step.file_path, step.file_content, fileType);
    }
  }

  return virtualFS;
}

/**
 * Build VirtualFS from server variant's virtual_fs snapshot
 */
export function buildVirtualFSFromSnapshot(
  variant: ServerGenerationVariant
): VirtualFS | null {
  if (!variant.virtual_fs?.files) {
    return null;
  }

  const virtualFS = new VirtualFS(variant.virtual_fs.metadata);
  virtualFS.fromSnapshot(variant.virtual_fs as {
    files: Array<{ path: string; content: string; type: 'html' | 'js' | 'css' | 'json' | 'txt' | 'svg' | 'png' | 'jpg' }>;
    metadata: { createdAt: string; variantId?: string; sessionId?: string };
  });

  return virtualFS;
}

/**
 * Convert server step to GeneratedFile
 */
export function stepToGeneratedFile(step: ServerGenerationStep): GeneratedFile | null {
  if (!step.file_path || !step.file_content) {
    return null;
  }

  return {
    path: step.file_path,
    content: step.file_content,
    type: (step.file_type || 'txt') as 'html' | 'js' | 'css' | 'json',
  };
}

/**
 * Convert server steps to GeneratedFile array
 */
export function stepsToGeneratedFiles(steps: ServerGenerationStep[]): GeneratedFile[] {
  return steps
    .filter(s => s.status === 'completed' && s.file_path && s.file_content)
    .map(s => ({
      path: s.file_path!,
      content: s.file_content!,
      type: (s.file_type || 'txt') as 'html' | 'js' | 'css' | 'json',
    }));
}

// ============================================================================
// Progress Conversion
// ============================================================================

/**
 * Convert server variant to AgentProgress format
 */
export function variantToAgentProgress(
  variant: ServerGenerationVariant,
  steps: ServerGenerationStep[],
  plan?: VariantPlan
): AgentProgress {
  const approach = INDEX_TO_APPROACH[variant.variant_index] || 'minimal';

  // Convert phase
  const phaseMap: Record<string, AgentPhase> = {
    queued: 'queued',
    script: 'script',
    files: 'files',
    assembly: 'assembly',
    complete: 'complete',
    failed: 'failed',
  };

  // Convert steps
  const stepProgress: AgentStepProgress[] = steps.map(s => ({
    stepKey: s.step_key,
    label: s.step_label,
    status: s.status as 'pending' | 'in_progress' | 'completed' | 'failed',
    error: s.error_message || undefined,
    duration: s.duration_ms || undefined,
    filePath: s.file_path || undefined,
  }));

  const completedFiles = steps
    .filter(s => s.status === 'completed' && s.file_path)
    .map(s => s.file_path!);

  return {
    variantIndex: variant.variant_index,
    variantTitle: plan?.title || `Variant ${variant.variant_index}`,
    approach,
    phase: phaseMap[variant.phase] || 'queued',
    currentStep: variant.current_step || '',
    completedSteps: variant.completed_steps,
    totalSteps: variant.total_steps || 0,
    filesCompleted: completedFiles,
    steps: stepProgress,
    error: variant.error_message || undefined,
    startedAt: variant.started_at ? new Date(variant.started_at).getTime() : undefined,
    completedAt: variant.completed_at ? new Date(variant.completed_at).getTime() : undefined,
  };
}

/**
 * Sync from server state - rebuilds all VirtualFS instances and progress
 */
export async function syncFromServer(
  vibeSessionId: string
): Promise<{
  session: ServerGenerationSession | null;
  variants: ServerGenerationVariant[];
  agentProgress: AgentProgress[];
  virtualFSInstances: Map<number, VirtualFS>;
} | null> {
  // Get active session
  const session = await getActiveGeneration(vibeSessionId);
  if (!session) {
    // Also check for completed sessions
    const { data: completedSession } = await supabase
      .from('generation_sessions')
      .select('*')
      .eq('vibe_session_id', vibeSessionId)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!completedSession) {
      return null;
    }

    // Use completed session
    const variants = await getGenerationVariants(completedSession.id);
    const plans = (completedSession.generation_context as { plans: VariantPlan[] }).plans;

    const agentProgress: AgentProgress[] = [];
    const virtualFSInstances = new Map<number, VirtualFS>();

    for (const variant of variants) {
      const steps = await getGenerationSteps(variant.id);
      const plan = plans.find(p => p.variant_index === variant.variant_index);

      agentProgress.push(variantToAgentProgress(variant, steps, plan));

      if (variant.phase === 'complete' || steps.some(s => s.status === 'completed')) {
        const virtualFS = buildVirtualFSFromSteps(steps, {
          variantId: variant.id,
          variantIndex: variant.variant_index,
        });
        virtualFSInstances.set(variant.variant_index, virtualFS);
      }
    }

    return {
      session: completedSession,
      variants,
      agentProgress,
      virtualFSInstances,
    };
  }

  // Get variants and their steps
  const variants = await getGenerationVariants(session.id);
  const plans = (session.generation_context as { plans: VariantPlan[] }).plans;

  const agentProgress: AgentProgress[] = [];
  const virtualFSInstances = new Map<number, VirtualFS>();

  for (const variant of variants) {
    const steps = await getGenerationSteps(variant.id);
    const plan = plans.find(p => p.variant_index === variant.variant_index);

    agentProgress.push(variantToAgentProgress(variant, steps, plan));

    // Build VirtualFS from completed steps
    if (steps.some(s => s.status === 'completed' && s.file_path)) {
      const virtualFS = buildVirtualFSFromSteps(steps, {
        variantId: variant.id,
        variantIndex: variant.variant_index,
      });
      virtualFSInstances.set(variant.variant_index, virtualFS);
    }
  }

  return {
    session,
    variants,
    agentProgress,
    virtualFSInstances,
  };
}
