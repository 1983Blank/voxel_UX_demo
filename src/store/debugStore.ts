/**
 * Debug Store
 * Captures and stores LLM request/response data for debugging
 */

import { create } from 'zustand';

export type DebugStage =
  | 'understand-request'
  | 'generate-variant-plan'
  | 'generate-visual-wireframes'
  | 'generate-variant-edits-v2'
  | 'generate-variant-code'
  | 'extract-components'
  | 'iterate-variant'
  | 'other';

export interface DebugEntry {
  id: string;
  timestamp: string;
  stage: DebugStage;
  sessionId?: string;
  variantIndex?: number;

  // Request data
  request: {
    endpoint: string;
    method: string;
    headers?: Record<string, string>;
    body: {
      prompt?: string;
      systemPrompt?: string;
      compactedHtml?: string;
      screenshotIncluded?: boolean;
      screenshotSize?: number;
      uiMetadata?: unknown;
      productContext?: string;
      uxGuidelines?: string;
      provider?: string;
      model?: string;
      [key: string]: unknown;
    };
  };

  // Response data
  response?: {
    status: number;
    success: boolean;
    data?: unknown;
    error?: string;
    rawText?: string;
    parsedResult?: unknown;
  };

  // Timing
  startTime: number;
  endTime?: number;
  durationMs?: number;

  // Status
  status: 'pending' | 'success' | 'error';
}

interface DebugState {
  entries: DebugEntry[];
  isEnabled: boolean;
  isPanelOpen: boolean;
  selectedEntryId: string | null;
  filterStage: DebugStage | 'all';

  // Actions
  setEnabled: (enabled: boolean) => void;
  togglePanel: () => void;
  setPanelOpen: (open: boolean) => void;
  selectEntry: (id: string | null) => void;
  setFilterStage: (stage: DebugStage | 'all') => void;

  // Entry management
  startEntry: (stage: DebugStage, request: DebugEntry['request'], sessionId?: string, variantIndex?: number) => string;
  completeEntry: (id: string, response: DebugEntry['response']) => void;
  failEntry: (id: string, error: string) => void;
  clearEntries: () => void;

  // Helpers
  getEntriesBySession: (sessionId: string) => DebugEntry[];
  getLatestEntry: () => DebugEntry | null;
}

function generateId(): string {
  return `debug_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export const useDebugStore = create<DebugState>((set, get) => ({
  entries: [],
  isEnabled: true, // Enable by default for debugging
  isPanelOpen: false,
  selectedEntryId: null,
  filterStage: 'all',

  setEnabled: (enabled) => set({ isEnabled: enabled }),

  togglePanel: () => set((state) => ({ isPanelOpen: !state.isPanelOpen })),

  setPanelOpen: (open) => set({ isPanelOpen: open }),

  selectEntry: (id) => set({ selectedEntryId: id }),

  setFilterStage: (stage) => set({ filterStage: stage }),

  startEntry: (stage, request, sessionId, variantIndex) => {
    const state = get();
    if (!state.isEnabled) return '';

    const id = generateId();
    const entry: DebugEntry = {
      id,
      timestamp: new Date().toISOString(),
      stage,
      sessionId,
      variantIndex,
      request,
      startTime: Date.now(),
      status: 'pending',
    };

    set((state) => ({
      entries: [entry, ...state.entries].slice(0, 100), // Keep last 100 entries
    }));

    console.log(`[Debug] Started ${stage}`, { id, sessionId, variantIndex });
    return id;
  },

  completeEntry: (id, response) => {
    const endTime = Date.now();

    set((state) => ({
      entries: state.entries.map((entry) =>
        entry.id === id
          ? {
              ...entry,
              response,
              endTime,
              durationMs: endTime - entry.startTime,
              status: response?.success ? 'success' : 'error',
            }
          : entry
      ),
    }));

    const entry = get().entries.find((e) => e.id === id);
    console.log(`[Debug] Completed ${entry?.stage}`, {
      id,
      success: response?.success,
      durationMs: endTime - (entry?.startTime || endTime),
    });
  },

  failEntry: (id, error) => {
    const endTime = Date.now();

    set((state) => ({
      entries: state.entries.map((entry) =>
        entry.id === id
          ? {
              ...entry,
              response: { status: 0, success: false, error },
              endTime,
              durationMs: endTime - entry.startTime,
              status: 'error',
            }
          : entry
      ),
    }));

    const entry = get().entries.find((e) => e.id === id);
    console.log(`[Debug] Failed ${entry?.stage}`, { id, error });
  },

  clearEntries: () => set({ entries: [], selectedEntryId: null }),

  getEntriesBySession: (sessionId) => {
    return get().entries.filter((e) => e.sessionId === sessionId);
  },

  getLatestEntry: () => {
    const entries = get().entries;
    return entries.length > 0 ? entries[0] : null;
  },
}));

// Convenience function to log LLM calls from services
export function logLLMCall(
  stage: DebugStage,
  endpoint: string,
  body: DebugEntry['request']['body'],
  sessionId?: string,
  variantIndex?: number
): string {
  const { startEntry, isEnabled } = useDebugStore.getState();

  if (!isEnabled) return '';

  return startEntry(
    stage,
    {
      endpoint,
      method: 'POST',
      body: {
        ...body,
        // Truncate large fields for display
        compactedHtml: body.compactedHtml
          ? `[${String(body.compactedHtml).length} chars]`
          : undefined,
        screenshotIncluded: !!body.screenshotBase64,
        screenshotSize: typeof body.screenshotBase64 === 'string'
          ? Math.round(body.screenshotBase64.length / 1024)
          : undefined,
      },
    },
    sessionId,
    variantIndex
  );
}

export function completeLLMCall(
  debugId: string,
  status: number,
  success: boolean,
  data?: unknown,
  error?: string,
  rawText?: string
): void {
  const { completeEntry, isEnabled } = useDebugStore.getState();

  if (!isEnabled || !debugId) return;

  completeEntry(debugId, {
    status,
    success,
    data,
    error,
    rawText: rawText ? (rawText.length > 5000 ? rawText.slice(0, 5000) + '...[truncated]' : rawText) : undefined,
  });
}

export function failLLMCall(debugId: string, error: string): void {
  const { failEntry, isEnabled } = useDebugStore.getState();

  if (!isEnabled || !debugId) return;

  failEntry(debugId, error);
}
