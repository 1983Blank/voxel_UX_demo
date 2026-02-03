/**
 * Prototype Store
 *
 * State management for file-based prototyping workflow.
 * Manages VirtualFS instances, implementation scripts,
 * and prototype generation state.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { VirtualFS, type FileSystemSnapshot } from '../runtime/virtual-fs';
import type {
  ImplementationScript,
  ScreenAnalysisResponse,
  GeneratedFile,
  VariantApproach,
  Flow,
  EntryPoint,
} from '../types/implementationScript';
import type { AgentProgress } from '../types/agentTypes';

// ============ Types ============

export interface PrototypeVariant {
  id: string;
  approach: VariantApproach;
  status: 'pending' | 'generating' | 'ready' | 'error';
  error?: string;
  files: GeneratedFile[];
  snapshot?: FileSystemSnapshot;
  componentsUsed: string[];
  previewUrl?: string;
  createdAt: Date;
  updatedAt: Date;
  /** Agent progress for multi-stage generation */
  agentProgress?: AgentProgress;
}

export interface PrototypeState {
  /** Current state object for runtime sync */
  runtimeState: Record<string, unknown>;
  /** Execution history for flow debugger */
  executionHistory: ExecutionEvent[];
}

export interface ExecutionEvent {
  id: string;
  timestamp: number;
  type: 'flow_start' | 'flow_end' | 'step_execute' | 'state_change' | 'error';
  flowName?: string;
  stepIndex?: number;
  path?: string;
  value?: unknown;
  error?: string;
  duration?: number;
}

// Store state interface
interface PrototypeStoreState {
  // Analysis state
  analysisResult: ScreenAnalysisResponse | null;
  selectedScript: ImplementationScript | null;
  isAnalyzing: boolean;
  analysisError: string | null;

  // Generation state
  variants: Record<string, PrototypeVariant>;
  activeVariantId: string | null;
  isGenerating: boolean;
  generationProgress: {
    current: number;
    total: number;
    message: string;
  } | null;
  generationError: string | null;

  // Runtime state (for preview sync)
  prototypeState: PrototypeState;

  // UI state
  selectedFilePath: string | null;
  showStateInspector: boolean;
  showFlowDebugger: boolean;

  // VirtualFS instances (not persisted, recreated from snapshots)
  _virtualFSInstances: Record<string, VirtualFS>;

  // Agent progress (for multi-stage generation)
  agentProgress: AgentProgress[];
  isAgentGenerating: boolean;

  // Actions - Analysis
  setAnalysisResult: (result: ScreenAnalysisResponse | null) => void;
  selectScript: (script: ImplementationScript | null) => void;
  updateScript: (updates: Partial<ImplementationScript>) => void;
  addEntryPoint: (entryPoint: EntryPoint) => void;
  removeEntryPoint: (index: number) => void;
  addFlow: (flow: Flow) => void;
  updateFlow: (flowName: string, updates: Partial<Flow>) => void;
  removeFlow: (flowName: string) => void;
  setAnalyzing: (analyzing: boolean, error?: string) => void;

  // Actions - Generation
  startGeneration: (approaches: VariantApproach[]) => void;
  setVariantGenerating: (variantId: string) => void;
  setVariantReady: (variantId: string, files: GeneratedFile[], componentsUsed: string[]) => void;
  setVariantError: (variantId: string, error: string) => void;
  setGenerationProgress: (progress: { current: number; total: number; message: string } | null) => void;
  setGenerationError: (error: string | null) => void;
  clearVariants: () => void;

  // Actions - Agent Progress (multi-stage generation)
  setAgentProgress: (progress: AgentProgress[]) => void;
  updateVariantAgentProgress: (variantIndex: number, progress: AgentProgress) => void;
  startAgentGeneration: () => void;
  completeAgentGeneration: () => void;
  getVariantAgentProgress: (variantIndex: number) => AgentProgress | null;

  // Actions - VirtualFS
  getVirtualFS: (variantId: string) => VirtualFS | null;
  createVirtualFS: (variantId: string, files: GeneratedFile[]) => VirtualFS;
  updateFile: (variantId: string, path: string, content: string) => void;
  deleteFile: (variantId: string, path: string) => void;

  // Actions - Runtime state
  setRuntimeState: (state: Record<string, unknown>) => void;
  updateRuntimeState: (path: string, value: unknown) => void;
  resetRuntimeState: () => void;
  addExecutionEvent: (event: Omit<ExecutionEvent, 'id' | 'timestamp'>) => void;
  clearExecutionHistory: () => void;

  // Actions - UI state
  setActiveVariant: (variantId: string | null) => void;
  setSelectedFile: (path: string | null) => void;
  toggleStateInspector: () => void;
  toggleFlowDebugger: () => void;

  // Actions - Persistence
  saveToStorage: () => void;
  loadFromStorage: () => void;
  clearAll: () => void;

  // Computed getters
  getActiveVariant: () => PrototypeVariant | null;
  getVariantFiles: (variantId: string) => GeneratedFile[];
  getFlows: () => Flow[];
  isAnyVariantGenerating: () => boolean;
  getCompletedVariantsCount: () => number;
}

// ============ Helper Functions ============

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createVariantId(approach: VariantApproach): string {
  return `variant-${approach}-${Date.now()}`;
}

// ============ Store ============

export const usePrototypeStore = create<PrototypeStoreState>()(
  persist(
    (set, get) => ({
      // Initial state
      analysisResult: null,
      selectedScript: null,
      isAnalyzing: false,
      analysisError: null,

      variants: {},
      activeVariantId: null,
      isGenerating: false,
      generationProgress: null,
      generationError: null,

      prototypeState: {
        runtimeState: {},
        executionHistory: [],
      },

      selectedFilePath: null,
      showStateInspector: true,
      showFlowDebugger: true,

      _virtualFSInstances: {},

      agentProgress: [],
      isAgentGenerating: false,

      // ============ Analysis Actions ============

      setAnalysisResult: (result) => {
        set({
          analysisResult: result,
          analysisError: null,
          // Auto-select first suggested script
          selectedScript: result?.suggestedScripts?.[0] || null,
        });
      },

      selectScript: (script) => {
        set({
          selectedScript: script,
          // Reset runtime state when selecting new script
          prototypeState: {
            runtimeState: script?.initialState || {},
            executionHistory: [],
          },
        });
      },

      updateScript: (updates) => {
        const current = get().selectedScript;
        if (!current) return;

        set({
          selectedScript: { ...current, ...updates },
        });
      },

      addEntryPoint: (entryPoint) => {
        const current = get().selectedScript;
        if (!current) return;

        set({
          selectedScript: {
            ...current,
            entryPoints: [...current.entryPoints, entryPoint],
          },
        });
      },

      removeEntryPoint: (index) => {
        const current = get().selectedScript;
        if (!current) return;

        set({
          selectedScript: {
            ...current,
            entryPoints: current.entryPoints.filter((_, i) => i !== index),
          },
        });
      },

      addFlow: (flow) => {
        const current = get().selectedScript;
        if (!current) return;

        set({
          selectedScript: {
            ...current,
            flows: [...current.flows, flow],
          },
        });
      },

      updateFlow: (flowName, updates) => {
        const current = get().selectedScript;
        if (!current) return;

        set({
          selectedScript: {
            ...current,
            flows: current.flows.map((f) =>
              f.name === flowName ? { ...f, ...updates } : f
            ),
          },
        });
      },

      removeFlow: (flowName) => {
        const current = get().selectedScript;
        if (!current) return;

        set({
          selectedScript: {
            ...current,
            flows: current.flows.filter((f) => f.name !== flowName),
          },
        });
      },

      setAnalyzing: (analyzing, error) => {
        set({
          isAnalyzing: analyzing,
          analysisError: error || null,
        });
      },

      // ============ Generation Actions ============

      startGeneration: (approaches) => {
        const variants: Record<string, PrototypeVariant> = {};

        approaches.forEach((approach) => {
          const id = createVariantId(approach);
          variants[id] = {
            id,
            approach,
            status: 'pending',
            files: [],
            componentsUsed: [],
            createdAt: new Date(),
            updatedAt: new Date(),
          };
        });

        set({
          variants,
          activeVariantId: Object.keys(variants)[0] || null,
          isGenerating: true,
          generationProgress: {
            current: 0,
            total: approaches.length,
            message: 'Starting generation...',
          },
          generationError: null,
          _virtualFSInstances: {},
        });
      },

      setVariantGenerating: (variantId) => {
        const variants = { ...get().variants };
        if (variants[variantId]) {
          variants[variantId] = {
            ...variants[variantId],
            status: 'generating',
            updatedAt: new Date(),
          };
          set({ variants });
        }
      },

      setVariantReady: (variantId, files, componentsUsed) => {
        const variants = { ...get().variants };
        if (variants[variantId]) {
          // Create VirtualFS instance
          const fs = get().createVirtualFS(variantId, files);

          variants[variantId] = {
            ...variants[variantId],
            status: 'ready',
            files,
            componentsUsed,
            snapshot: fs.toSnapshot(),
            previewUrl: fs.createPreviewUrl(),
            updatedAt: new Date(),
          };

          // Update progress
          const completed = Object.values(variants).filter((v) => v.status === 'ready').length;
          const total = Object.keys(variants).length;

          set({
            variants,
            isGenerating: completed < total,
            generationProgress:
              completed < total
                ? {
                    current: completed,
                    total,
                    message: `Generated ${completed}/${total} variants`,
                  }
                : null,
          });
        }
      },

      setVariantError: (variantId, error) => {
        const variants = { ...get().variants };
        if (variants[variantId]) {
          variants[variantId] = {
            ...variants[variantId],
            status: 'error',
            error,
            updatedAt: new Date(),
          };
          set({ variants });
        }
      },

      setGenerationProgress: (progress) => {
        set({ generationProgress: progress });
      },

      setGenerationError: (error) => {
        set({
          generationError: error,
          isGenerating: false,
          generationProgress: null,
        });
      },

      clearVariants: () => {
        // Dispose all VirtualFS instances
        const instances = get()._virtualFSInstances;
        Object.values(instances).forEach((fs) => fs.dispose());

        set({
          variants: {},
          activeVariantId: null,
          isGenerating: false,
          generationProgress: null,
          generationError: null,
          _virtualFSInstances: {},
          selectedFilePath: null,
          agentProgress: [],
          isAgentGenerating: false,
        });
      },

      // ============ Agent Progress Actions ============

      setAgentProgress: (progress) => {
        set({ agentProgress: progress });

        // Also update individual variant agentProgress
        const variants = { ...get().variants };
        let hasChanges = false;

        for (const p of progress) {
          const variantId = Object.keys(variants).find((id) => {
            const v = variants[id];
            // Match by variant index (1-4) to approach
            const approachMap: Record<number, VariantApproach> = {
              1: 'minimal',
              2: 'feature-rich',
              3: 'gamified',
              4: 'accessible',
            };
            return v.approach === approachMap[p.variantIndex];
          });

          if (variantId && variants[variantId]) {
            variants[variantId] = {
              ...variants[variantId],
              agentProgress: p,
              updatedAt: new Date(),
            };
            hasChanges = true;
          }
        }

        if (hasChanges) {
          set({ variants });
        }
      },

      updateVariantAgentProgress: (variantIndex, progress) => {
        const currentProgress = [...get().agentProgress];
        const existingIdx = currentProgress.findIndex((p) => p.variantIndex === variantIndex);

        if (existingIdx >= 0) {
          currentProgress[existingIdx] = progress;
        } else {
          currentProgress.push(progress);
        }

        set({ agentProgress: currentProgress });
      },

      startAgentGeneration: () => {
        set({
          isAgentGenerating: true,
          isGenerating: true,
          agentProgress: [],
          generationError: null,
        });
      },

      completeAgentGeneration: () => {
        set({
          isAgentGenerating: false,
          isGenerating: false,
          generationProgress: null,
        });
      },

      getVariantAgentProgress: (variantIndex) => {
        return get().agentProgress.find((p) => p.variantIndex === variantIndex) || null;
      },

      // ============ VirtualFS Actions ============

      getVirtualFS: (variantId) => {
        const instances = get()._virtualFSInstances;
        if (instances[variantId]) {
          return instances[variantId];
        }

        // Recreate from snapshot if available
        const variant = get().variants[variantId];
        if (variant?.snapshot) {
          const fs = VirtualFS.fromSnapshot(variant.snapshot);
          set({
            _virtualFSInstances: {
              ...get()._virtualFSInstances,
              [variantId]: fs,
            },
          });
          return fs;
        }

        return null;
      },

      createVirtualFS: (variantId, files) => {
        const fs = new VirtualFS({ variantId });

        files.forEach((file) => {
          fs.writeFile(file.path, file.content, file.type);
        });

        set({
          _virtualFSInstances: {
            ...get()._virtualFSInstances,
            [variantId]: fs,
          },
        });

        return fs;
      },

      updateFile: (variantId, path, content) => {
        const fs = get().getVirtualFS(variantId);
        if (!fs) return;

        fs.writeFile(path, content);

        // Update variant's files and snapshot
        const variants = { ...get().variants };
        if (variants[variantId]) {
          variants[variantId] = {
            ...variants[variantId],
            files: variants[variantId].files.map((f) =>
              f.path === path ? { ...f, content } : f
            ),
            snapshot: fs.toSnapshot(),
            updatedAt: new Date(),
          };
          set({ variants });
        }
      },

      deleteFile: (variantId, path) => {
        const fs = get().getVirtualFS(variantId);
        if (!fs) return;

        fs.deleteFile(path);

        // Update variant's files and snapshot
        const variants = { ...get().variants };
        if (variants[variantId]) {
          variants[variantId] = {
            ...variants[variantId],
            files: variants[variantId].files.filter((f) => f.path !== path),
            snapshot: fs.toSnapshot(),
            updatedAt: new Date(),
          };
          set({ variants });
        }
      },

      // ============ Runtime State Actions ============

      setRuntimeState: (state) => {
        set({
          prototypeState: {
            ...get().prototypeState,
            runtimeState: state,
          },
        });
      },

      updateRuntimeState: (path, value) => {
        const current = { ...get().prototypeState.runtimeState };
        const keys = path.split('.');
        const last = keys.pop()!;
        let target = current as Record<string, unknown>;

        keys.forEach((key) => {
          if (!target[key] || typeof target[key] !== 'object') {
            target[key] = {};
          }
          target = target[key] as Record<string, unknown>;
        });

        target[last] = value;

        // Add execution event
        get().addExecutionEvent({
          type: 'state_change',
          path,
          value,
        });

        set({
          prototypeState: {
            ...get().prototypeState,
            runtimeState: current,
          },
        });
      },

      resetRuntimeState: () => {
        const script = get().selectedScript;
        set({
          prototypeState: {
            runtimeState: script?.initialState || {},
            executionHistory: [],
          },
        });
      },

      addExecutionEvent: (event) => {
        const history = get().prototypeState.executionHistory;
        set({
          prototypeState: {
            ...get().prototypeState,
            executionHistory: [
              ...history,
              {
                ...event,
                id: generateId(),
                timestamp: Date.now(),
              },
            ].slice(-100), // Keep last 100 events
          },
        });
      },

      clearExecutionHistory: () => {
        set({
          prototypeState: {
            ...get().prototypeState,
            executionHistory: [],
          },
        });
      },

      // ============ UI State Actions ============

      setActiveVariant: (variantId) => {
        set({
          activeVariantId: variantId,
          selectedFilePath: null,
        });
      },

      setSelectedFile: (path) => {
        set({ selectedFilePath: path });
      },

      toggleStateInspector: () => {
        set({ showStateInspector: !get().showStateInspector });
      },

      toggleFlowDebugger: () => {
        set({ showFlowDebugger: !get().showFlowDebugger });
      },

      // ============ Persistence Actions ============

      saveToStorage: () => {
        // Handled by zustand persist middleware
      },

      loadFromStorage: () => {
        // Handled by zustand persist middleware
        // Recreate VirtualFS instances from snapshots
        const variants = get().variants;
        Object.entries(variants).forEach(([id, variant]) => {
          if (variant.snapshot) {
            const fs = VirtualFS.fromSnapshot(variant.snapshot);
            set({
              _virtualFSInstances: {
                ...get()._virtualFSInstances,
                [id]: fs,
              },
            });
          }
        });
      },

      clearAll: () => {
        // Dispose all VirtualFS instances
        const instances = get()._virtualFSInstances;
        Object.values(instances).forEach((fs) => fs.dispose());

        set({
          analysisResult: null,
          selectedScript: null,
          isAnalyzing: false,
          analysisError: null,
          variants: {},
          activeVariantId: null,
          isGenerating: false,
          generationProgress: null,
          generationError: null,
          prototypeState: {
            runtimeState: {},
            executionHistory: [],
          },
          selectedFilePath: null,
          _virtualFSInstances: {},
        });
      },

      // ============ Computed Getters ============

      getActiveVariant: () => {
        const { activeVariantId, variants } = get();
        return activeVariantId ? variants[activeVariantId] || null : null;
      },

      getVariantFiles: (variantId) => {
        return get().variants[variantId]?.files || [];
      },

      getFlows: () => {
        return get().selectedScript?.flows || [];
      },

      isAnyVariantGenerating: () => {
        return Object.values(get().variants).some((v) => v.status === 'generating');
      },

      getCompletedVariantsCount: () => {
        return Object.values(get().variants).filter((v) => v.status === 'ready').length;
      },
    }),
    {
      name: 'voxel-prototype-store',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        // Only persist these fields
        analysisResult: state.analysisResult,
        selectedScript: state.selectedScript,
        variants: state.variants,
        activeVariantId: state.activeVariantId,
        prototypeState: state.prototypeState,
        showStateInspector: state.showStateInspector,
        showFlowDebugger: state.showFlowDebugger,
      }),
    }
  )
);

export default usePrototypeStore;
