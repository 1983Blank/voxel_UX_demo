/**
 * useServerGeneration Hook
 *
 * React hook for server-persistent generation with streaming preview.
 *
 * Features:
 * - Starts generation on server (survives page refresh)
 * - Subscribes to Realtime for live progress updates
 * - Updates VirtualFS incrementally as files complete
 * - Automatically syncs state on reconnection
 * - Handles continuation for timeout recovery
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { VirtualFS } from '../runtime/virtual-fs';
import {
  startServerGeneration,
  continueServerGeneration,
  getActiveGeneration,
  getGenerationProgress,
  getGenerationVariants,
  getGenerationSteps,
  subscribeToGeneration,
  subscribeToVariantSteps,
  unsubscribeFromGeneration,
  buildVirtualFSFromSteps,
  variantToAgentProgress,
  stepsToGeneratedFiles,
  syncFromServer,
  type ServerGenerationSession,
  type ServerGenerationVariant,
  type ServerGenerationStep,
  type StartServerGenerationParams,
  type RealtimeCallbacks,
} from '../services/serverGenerationService';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { AgentProgress, AgentPhase } from '../types/agentTypes';
import type { VariantApproach, GeneratedFile } from '../types/implementationScript';
import type { VariantPlan } from '../services/variantPlanService';

// ============================================================================
// Types
// ============================================================================

export interface ServerGenerationState {
  /** Whether generation is active */
  isGenerating: boolean;
  /** Current session (if any) */
  session: ServerGenerationSession | null;
  /** Variants with their progress */
  variants: ServerGenerationVariant[];
  /** Agent progress for UI display */
  agentProgress: AgentProgress[];
  /** VirtualFS instances per variant (keyed by variant_index) */
  virtualFSInstances: Map<number, VirtualFS>;
  /** Preview URLs per variant (keyed by variant_index) */
  previewUrls: Map<number, string>;
  /** Generated files per variant (keyed by variant_index) */
  generatedFiles: Map<number, GeneratedFile[]>;
  /** Error message if generation failed */
  error: string | null;
  /** Whether we're currently syncing from server */
  isSyncing: boolean;
}

export interface UseServerGenerationResult extends ServerGenerationState {
  /** Start a new server generation */
  startGeneration: (params: StartServerGenerationParams) => Promise<void>;
  /** Resume a paused generation */
  resumeGeneration: (sessionId: string, continuationToken: string) => Promise<void>;
  /** Sync state from server (useful after reconnection) */
  syncFromServer: () => Promise<void>;
  /** Get VirtualFS for a variant */
  getVirtualFS: (variantIndex: number) => VirtualFS | null;
  /** Get preview URL for a variant */
  getPreviewUrl: (variantIndex: number) => string | null;
  /** Get generated files for a variant */
  getFiles: (variantIndex: number) => GeneratedFile[];
  /** Clear generation state */
  clear: () => void;
}

// Map variant index to approach
const INDEX_TO_APPROACH: Record<number, VariantApproach> = {
  1: 'minimal',
  2: 'feature-rich',
  3: 'gamified',
  4: 'accessible',
};

// ============================================================================
// Hook Implementation
// ============================================================================

export function useServerGeneration(vibeSessionId: string | null): UseServerGenerationResult {
  // State
  const [state, setState] = useState<ServerGenerationState>({
    isGenerating: false,
    session: null,
    variants: [],
    agentProgress: [],
    virtualFSInstances: new Map(),
    previewUrls: new Map(),
    generatedFiles: new Map(),
    error: null,
    isSyncing: false,
  });

  // Refs for cleanup
  const sessionChannelRef = useRef<RealtimeChannel | null>(null);
  const variantChannelsRef = useRef<Map<string, RealtimeChannel>>(new Map());
  const plansRef = useRef<VariantPlan[]>([]);

  // ============================================================================
  // Helpers
  // ============================================================================

  /**
   * Update VirtualFS and preview URL for a variant
   */
  const updateVirtualFSForVariant = useCallback(
    (variantIndex: number, steps: ServerGenerationStep[]) => {
      setState((prev) => {
        const newVirtualFSInstances = new Map(prev.virtualFSInstances);
        const newPreviewUrls = new Map(prev.previewUrls);
        const newGeneratedFiles = new Map(prev.generatedFiles);

        // Build VirtualFS from completed steps
        const virtualFS = buildVirtualFSFromSteps(steps, {
          variantIndex,
          sessionId: prev.session?.id,
        });

        // Only update if we have files
        if (virtualFS.getFileCount() > 0) {
          // Dispose old instance if exists
          const oldFS = newVirtualFSInstances.get(variantIndex);
          if (oldFS) {
            oldFS.dispose();
          }

          newVirtualFSInstances.set(variantIndex, virtualFS);

          // Generate preview URL if we have index.html
          if (virtualFS.exists('index.html')) {
            try {
              const previewUrl = virtualFS.createPreviewUrl();
              newPreviewUrls.set(variantIndex, previewUrl);
            } catch (e) {
              console.error('[useServerGeneration] Error creating preview URL:', e);
            }
          }

          // Update generated files
          newGeneratedFiles.set(variantIndex, stepsToGeneratedFiles(steps));
        }

        return {
          ...prev,
          virtualFSInstances: newVirtualFSInstances,
          previewUrls: newPreviewUrls,
          generatedFiles: newGeneratedFiles,
        };
      });
    },
    []
  );

  /**
   * Update agent progress from variant and steps
   */
  const updateAgentProgress = useCallback(
    (variant: ServerGenerationVariant, steps: ServerGenerationStep[]) => {
      const plan = plansRef.current.find((p) => p.variant_index === variant.variant_index);
      const progress = variantToAgentProgress(variant, steps, plan);

      setState((prev) => {
        const newProgress = [...prev.agentProgress];
        const existingIndex = newProgress.findIndex(
          (p) => p.variantIndex === variant.variant_index
        );

        if (existingIndex >= 0) {
          newProgress[existingIndex] = progress;
        } else {
          newProgress.push(progress);
        }

        // Sort by variant index
        newProgress.sort((a, b) => a.variantIndex - b.variantIndex);

        return {
          ...prev,
          agentProgress: newProgress,
        };
      });
    },
    []
  );

  // ============================================================================
  // Realtime Subscription Handlers
  // ============================================================================

  const handleSessionUpdate = useCallback(
    (session: ServerGenerationSession) => {
      setState((prev) => ({
        ...prev,
        session,
        isGenerating: session.status === 'running' || session.status === 'pending',
        error: session.error_message,
      }));

      // If session is paused with continuation token, auto-resume
      if (session.status === 'paused' && session.continuation_token) {
        console.log('[useServerGeneration] Session paused, auto-resuming...');
        continueServerGeneration(session.id, session.continuation_token)
          .then(() => {
            console.log('[useServerGeneration] Resumed successfully');
          })
          .catch((err) => {
            console.error('[useServerGeneration] Resume failed:', err);
            setState((prev) => ({
              ...prev,
              error: err.message,
              isGenerating: false,
            }));
          });
      }
    },
    []
  );

  const handleVariantUpdate = useCallback(
    async (variant: ServerGenerationVariant) => {
      setState((prev) => {
        const newVariants = prev.variants.map((v) =>
          v.id === variant.id ? variant : v
        );

        // Add if not exists
        if (!newVariants.find((v) => v.id === variant.id)) {
          newVariants.push(variant);
        }

        return {
          ...prev,
          variants: newVariants.sort((a, b) => a.variant_index - b.variant_index),
        };
      });

      // Fetch steps for this variant and update progress
      const steps = await getGenerationSteps(variant.id);
      updateAgentProgress(variant, steps);
      updateVirtualFSForVariant(variant.variant_index, steps);

      // Subscribe to step updates if not already
      if (!variantChannelsRef.current.has(variant.id)) {
        const channel = subscribeToVariantSteps(variant.id, (step) => {
          handleStepUpdate(step, variant);
        });
        variantChannelsRef.current.set(variant.id, channel);
      }
    },
    [updateAgentProgress, updateVirtualFSForVariant]
  );

  const handleStepUpdate = useCallback(
    async (step: ServerGenerationStep, variant: ServerGenerationVariant) => {
      console.log('[useServerGeneration] Step update:', step.step_label, step.status);

      // Re-fetch all steps for the variant to rebuild VirtualFS
      const steps = await getGenerationSteps(variant.id);
      updateAgentProgress(variant, steps);
      updateVirtualFSForVariant(variant.variant_index, steps);
    },
    [updateAgentProgress, updateVirtualFSForVariant]
  );

  // ============================================================================
  // Subscription Management
  // ============================================================================

  const setupSubscription = useCallback(
    (sessionId: string) => {
      // Clean up existing subscriptions
      if (sessionChannelRef.current) {
        unsubscribeFromGeneration(sessionChannelRef.current);
      }
      variantChannelsRef.current.forEach((channel) => {
        unsubscribeFromGeneration(channel);
      });
      variantChannelsRef.current.clear();

      // Subscribe to session and variant updates
      const callbacks: RealtimeCallbacks = {
        onSessionUpdate: handleSessionUpdate,
        onVariantUpdate: handleVariantUpdate,
        onError: (error) => {
          console.error('[useServerGeneration] Realtime error:', error);
          setState((prev) => ({ ...prev, error: error.message }));
        },
      };

      sessionChannelRef.current = subscribeToGeneration(sessionId, callbacks);
    },
    [handleSessionUpdate, handleVariantUpdate]
  );

  // ============================================================================
  // Actions
  // ============================================================================

  const startGeneration = useCallback(
    async (params: StartServerGenerationParams) => {
      setState((prev) => ({
        ...prev,
        isGenerating: true,
        error: null,
        variants: [],
        agentProgress: [],
        virtualFSInstances: new Map(),
        previewUrls: new Map(),
        generatedFiles: new Map(),
      }));

      // Store plans for agent progress conversion
      plansRef.current = params.plans;

      try {
        const result = await startServerGeneration(params);
        console.log('[useServerGeneration] Generation started:', result);

        // Get the created session
        const session = await getActiveGeneration(params.vibeSessionId);
        if (session) {
          setState((prev) => ({
            ...prev,
            session,
          }));

          // Setup realtime subscription
          setupSubscription(session.id);

          // Get initial variants
          const variants = await getGenerationVariants(session.id);
          setState((prev) => ({
            ...prev,
            variants,
          }));

          // Initialize agent progress for each variant
          for (const variant of variants) {
            const steps = await getGenerationSteps(variant.id);
            updateAgentProgress(variant, steps);
          }
        }
      } catch (error) {
        console.error('[useServerGeneration] Start failed:', error);
        setState((prev) => ({
          ...prev,
          isGenerating: false,
          error: error instanceof Error ? error.message : 'Generation failed',
        }));
      }
    },
    [setupSubscription, updateAgentProgress]
  );

  const resumeGeneration = useCallback(
    async (sessionId: string, continuationToken: string) => {
      setState((prev) => ({ ...prev, isGenerating: true, error: null }));

      try {
        await continueServerGeneration(sessionId, continuationToken);
        setupSubscription(sessionId);
      } catch (error) {
        console.error('[useServerGeneration] Resume failed:', error);
        setState((prev) => ({
          ...prev,
          isGenerating: false,
          error: error instanceof Error ? error.message : 'Resume failed',
        }));
      }
    },
    [setupSubscription]
  );

  const syncFromServerAction = useCallback(async () => {
    if (!vibeSessionId) return;

    setState((prev) => ({ ...prev, isSyncing: true }));

    try {
      const result = await syncFromServer(vibeSessionId);

      if (result) {
        // Store plans if available
        if (result.session?.generation_context?.plans) {
          plansRef.current = result.session.generation_context.plans;
        }

        setState((prev) => {
          // Dispose old VirtualFS instances
          prev.virtualFSInstances.forEach((fs) => fs.dispose());

          const newPreviewUrls = new Map<number, string>();
          const newGeneratedFiles = new Map<number, GeneratedFile[]>();

          // Generate preview URLs for completed variants
          result.virtualFSInstances.forEach((fs, variantIndex) => {
            if (fs.exists('index.html')) {
              try {
                newPreviewUrls.set(variantIndex, fs.createPreviewUrl());
              } catch (e) {
                console.error('[useServerGeneration] Error creating preview URL:', e);
              }
            }

            // Get files from VirtualFS
            const files: GeneratedFile[] = [];
            for (const [path, file] of fs.entries()) {
              if (typeof file.content === 'string') {
                files.push({
                  path,
                  content: file.content,
                  type: file.type as 'html' | 'js' | 'css' | 'json',
                });
              }
            }
            newGeneratedFiles.set(variantIndex, files);
          });

          return {
            ...prev,
            session: result.session,
            variants: result.variants,
            agentProgress: result.agentProgress,
            virtualFSInstances: result.virtualFSInstances,
            previewUrls: newPreviewUrls,
            generatedFiles: newGeneratedFiles,
            isGenerating:
              result.session?.status === 'running' ||
              result.session?.status === 'pending',
            isSyncing: false,
          };
        });

        // Setup subscription if generation is active
        if (
          result.session &&
          (result.session.status === 'running' ||
            result.session.status === 'pending' ||
            result.session.status === 'paused')
        ) {
          setupSubscription(result.session.id);
        }
      } else {
        setState((prev) => ({ ...prev, isSyncing: false }));
      }
    } catch (error) {
      console.error('[useServerGeneration] Sync failed:', error);
      setState((prev) => ({
        ...prev,
        isSyncing: false,
        error: error instanceof Error ? error.message : 'Sync failed',
      }));
    }
  }, [vibeSessionId, setupSubscription]);

  const getVirtualFS = useCallback(
    (variantIndex: number): VirtualFS | null => {
      return state.virtualFSInstances.get(variantIndex) || null;
    },
    [state.virtualFSInstances]
  );

  const getPreviewUrl = useCallback(
    (variantIndex: number): string | null => {
      return state.previewUrls.get(variantIndex) || null;
    },
    [state.previewUrls]
  );

  const getFiles = useCallback(
    (variantIndex: number): GeneratedFile[] => {
      return state.generatedFiles.get(variantIndex) || [];
    },
    [state.generatedFiles]
  );

  const clear = useCallback(() => {
    // Clean up subscriptions
    if (sessionChannelRef.current) {
      unsubscribeFromGeneration(sessionChannelRef.current);
      sessionChannelRef.current = null;
    }
    variantChannelsRef.current.forEach((channel) => {
      unsubscribeFromGeneration(channel);
    });
    variantChannelsRef.current.clear();

    // Dispose VirtualFS instances
    state.virtualFSInstances.forEach((fs) => fs.dispose());

    setState({
      isGenerating: false,
      session: null,
      variants: [],
      agentProgress: [],
      virtualFSInstances: new Map(),
      previewUrls: new Map(),
      generatedFiles: new Map(),
      error: null,
      isSyncing: false,
    });

    plansRef.current = [];
  }, [state.virtualFSInstances]);

  // ============================================================================
  // Effects
  // ============================================================================

  // Sync from server on mount or when vibeSessionId changes
  useEffect(() => {
    if (vibeSessionId) {
      syncFromServerAction();
    }

    return () => {
      // Cleanup on unmount
      if (sessionChannelRef.current) {
        unsubscribeFromGeneration(sessionChannelRef.current);
      }
      variantChannelsRef.current.forEach((channel) => {
        unsubscribeFromGeneration(channel);
      });
    };
  }, [vibeSessionId, syncFromServerAction]);

  // ============================================================================
  // Return
  // ============================================================================

  return {
    ...state,
    startGeneration,
    resumeGeneration,
    syncFromServer: syncFromServerAction,
    getVirtualFS,
    getPreviewUrl,
    getFiles,
    clear,
  };
}

export default useServerGeneration;
