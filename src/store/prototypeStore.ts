/**
 * Prototype Store
 *
 * State management for file-based prototyping workflow.
 * Manages VirtualFS instances, implementation scripts,
 * and prototype generation state.
 */

import { create } from 'zustand';
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

  // Server generation state (for server-persistent generation)
  serverGenerationSessionId: string | null;
  isServerGenerating: boolean;
  serverGenerationError: string | null;

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

  // Actions - Server Generation
  setServerGenerationSession: (sessionId: string | null) => void;
  startServerGeneration: () => void;
  completeServerGeneration: () => void;
  failServerGeneration: (error: string) => void;

  // Actions - VirtualFS
  getVirtualFS: (variantId: string) => VirtualFS | null;
  createVirtualFS: (variantId: string, files: GeneratedFile[]) => VirtualFS;
  updateFile: (variantId: string, path: string, content: string) => void;
  deleteFile: (variantId: string, path: string) => void;

  // Actions - Progressive Preview Updates
  addFileToVariant: (variantId: string, file: GeneratedFile) => void;
  refreshVariantPreview: (variantId: string) => void;
  initializeVariantWithSourceHtml: (variantId: string, sourceHtml: string) => void;

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

/**
 * Create initial preview HTML with the user's source screen and a building indicator.
 * This gives immediate visual feedback that the system is working with their UI.
 */
function createInitialPreviewHtml(sourceHtml: string): string {
  // If the source HTML is a complete document, inject the indicator
  if (sourceHtml.includes('</body>')) {
    return sourceHtml.replace(
      '</body>',
      `
  <div class="vx-building-indicator" style="
    position: fixed;
    bottom: 16px;
    right: 16px;
    background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%);
    color: white;
    padding: 12px 20px;
    border-radius: 12px;
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 14px;
    font-weight: 500;
    z-index: 9999;
    box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
    display: flex;
    align-items: center;
    gap: 10px;
    animation: vx-pulse 2s ease-in-out infinite;
  ">
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style="animation: vx-spin 1s linear infinite;">
      <circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="2" stroke-dasharray="24 8" stroke-linecap="round"/>
    </svg>
    Building interactive prototype...
  </div>
  <style>
    @keyframes vx-pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.85; transform: scale(0.98); }
    }
    @keyframes vx-spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
  </style>
</body>`
    );
  }

  // If it's a partial HTML fragment, wrap it
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Building Prototype...</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: system-ui, -apple-system, sans-serif; }
    @keyframes vx-pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.85; transform: scale(0.98); }
    }
    @keyframes vx-spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
  </style>
</head>
<body>
  ${sourceHtml}
  <div class="vx-building-indicator" style="
    position: fixed;
    bottom: 16px;
    right: 16px;
    background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%);
    color: white;
    padding: 12px 20px;
    border-radius: 12px;
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 14px;
    font-weight: 500;
    z-index: 9999;
    box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
    display: flex;
    align-items: center;
    gap: 10px;
    animation: vx-pulse 2s ease-in-out infinite;
  ">
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style="animation: vx-spin 1s linear infinite;">
      <circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="2" stroke-dasharray="24 8" stroke-linecap="round"/>
    </svg>
    Building interactive prototype...
  </div>
</body>
</html>`;
}

// Clear any existing prototype store data on module load (legacy cleanup)
// This store no longer uses localStorage - all data is in Supabase
try {
  localStorage.removeItem('voxel-prototype-store');
  // Also clear any other potential problem keys
  const keysToRemove = Object.keys(localStorage).filter(k =>
    k.includes('prototype') || k.includes('voxel') || k.includes('variant')
  );
  keysToRemove.forEach(k => {
    try { localStorage.removeItem(k); } catch {}
  });
  if (keysToRemove.length > 0) {
    console.log('[prototypeStore] Cleared legacy localStorage keys:', keysToRemove);
  }
} catch {
  // Ignore errors during cleanup
}

// ============ Store ============

export const usePrototypeStore = create<PrototypeStoreState>()(
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

      serverGenerationSessionId: null,
      isServerGenerating: false,
      serverGenerationError: null,

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
          serverGenerationSessionId: null,
          isServerGenerating: false,
          serverGenerationError: null,
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

      // ============ Server Generation Actions ============

      setServerGenerationSession: (sessionId) => {
        set({ serverGenerationSessionId: sessionId });
      },

      startServerGeneration: () => {
        set({
          isServerGenerating: true,
          isGenerating: true,
          serverGenerationError: null,
          generationError: null,
          agentProgress: [],
        });
      },

      completeServerGeneration: () => {
        set({
          isServerGenerating: false,
          isGenerating: false,
          generationProgress: null,
        });
      },

      failServerGeneration: (error) => {
        set({
          isServerGenerating: false,
          isGenerating: false,
          serverGenerationError: error,
          generationError: error,
        });
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
          // DIAGNOSTIC: Check if index.html contains runtime
          if (file.path === 'index.html') {
            const content = file.content;
            console.log('[prototypeStore:DEBUG] Writing index.html to VirtualFS');
            console.log('[prototypeStore:DEBUG] Length:', content.length);
            console.log('[prototypeStore:DEBUG] Contains "Voxel Runtime Bundle":', content.includes('Voxel Runtime Bundle'));
            console.log('[prototypeStore:DEBUG] Contains "[VxRuntime:DIAG]":', content.includes('[VxRuntime:DIAG]'));
            console.log('[prototypeStore:DEBUG] Contains "<script>":', content.includes('<script>'));
            console.log('[prototypeStore:DEBUG] Contains "</script>":', content.includes('</script>'));
            // Find the first <script> tag and output what's after it
            const firstScript = content.indexOf('<script>');
            if (firstScript !== -1) {
              console.log('[prototypeStore:DEBUG] First <script> at index:', firstScript);
              console.log('[prototypeStore:DEBUG] After first <script>:', content.slice(firstScript, firstScript + 200));
            }
          }
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

      // ============ Progressive Preview Actions ============

      addFileToVariant: (variantId, file) => {
        const variants = { ...get().variants };
        if (!variants[variantId]) return;

        // Get or create VirtualFS
        let fs = get()._virtualFSInstances[variantId];
        if (!fs) {
          fs = new VirtualFS({ variantId });
          set({
            _virtualFSInstances: {
              ...get()._virtualFSInstances,
              [variantId]: fs,
            },
          });
        }

        // Add file to VirtualFS
        fs.writeFile(file.path, file.content, file.type);

        // Update variant's files list (avoid duplicates)
        const existingFileIndex = variants[variantId].files.findIndex(f => f.path === file.path);
        const updatedFiles = existingFileIndex >= 0
          ? variants[variantId].files.map((f, i) => i === existingFileIndex ? file : f)
          : [...variants[variantId].files, file];

        variants[variantId] = {
          ...variants[variantId],
          files: updatedFiles,
          snapshot: fs.toSnapshot(),
          updatedAt: new Date(),
        };

        set({ variants });
      },

      refreshVariantPreview: (variantId) => {
        const fs = get().getVirtualFS(variantId);
        if (!fs) return;

        const variants = { ...get().variants };
        if (variants[variantId]) {
          // Regenerate preview URL from current VirtualFS state
          const previewUrl = fs.createPreviewUrl();
          variants[variantId] = {
            ...variants[variantId],
            previewUrl,
            snapshot: fs.toSnapshot(),
            updatedAt: new Date(),
          };
          set({ variants });
        }
      },

      initializeVariantWithSourceHtml: (variantId, sourceHtml) => {
        const variants = { ...get().variants };
        if (!variants[variantId]) return;

        // Create initial preview HTML with source content and building indicator
        const initialHtml = createInitialPreviewHtml(sourceHtml);

        // Create VirtualFS with initial HTML
        const fs = new VirtualFS({ variantId });
        fs.writeFile('index.html', initialHtml, 'html');

        // Update variant
        variants[variantId] = {
          ...variants[variantId],
          files: [{ path: 'index.html', content: initialHtml, type: 'html' }],
          snapshot: fs.toSnapshot(),
          previewUrl: fs.createPreviewUrl(),
          status: 'generating',
          updatedAt: new Date(),
        };

        set({
          variants,
          _virtualFSInstances: {
            ...get()._virtualFSInstances,
            [variantId]: fs,
          },
        });
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
      // NOTE: This store no longer persists to localStorage. Variant data is in Supabase.

      saveToStorage: () => {
        // No-op: persistence removed to avoid localStorage quota issues
      },

      loadFromStorage: () => {
        // No-op: data loads from Supabase, not localStorage
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
          agentProgress: [],
          isAgentGenerating: false,
          serverGenerationSessionId: null,
          isServerGenerating: false,
          serverGenerationError: null,
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
    })
);

export default usePrototypeStore;
