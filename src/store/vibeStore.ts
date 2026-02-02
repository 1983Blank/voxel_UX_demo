/**
 * Vibe Prototyping Store
 * State management for the vibe prototyping workflow
 * With persistence to survive page refreshes
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { UIMetadata } from '../services/screenAnalyzerService';
import type { VibeSession, VariantPlan } from '../services/variantPlanService';
import type { VibeVariant } from '../services/variantCodeService';
import type { UnderstandingResponse } from '../services/understandingService';
import { captureAndSaveVariantScreenshot } from '../services/screenshotService';

// Chat message for the vibe coding interface
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  status?: 'pending' | 'complete' | 'error';
  metadata?: {
    variantIndex?: number;
    stage?: string;
  };
}

// Progress state
export interface VibeProgress {
  stage: 'analyzing' | 'understanding' | 'planning' | 'wireframing' | 'generating' | 'complete';
  message: string;
  percent: number;
  variantIndex?: number;
  variantTitle?: string;
}

// Understanding response from LLM
export interface Understanding {
  response: UnderstandingResponse;
  text: string;
  model: string;
  provider: string;
  approved: boolean;
  approvedAt?: string;
}

// Generated plan with all 4 variants
export interface GeneratedPlan {
  plans: VariantPlan[];
  model: string;
  provider: string;
}

// Status types - Multi-phase workflow
// 1. idle -> analyzing -> understanding -> understanding_ready (understanding approval)
// 2. understanding_ready -> planning -> plan_ready (paradigm approval)
// 3. plan_ready -> wireframing -> wireframe_ready (sketch iteration)
// 4. wireframe_ready -> generating -> complete (high-fidelity)
export type VibeStatus =
  | 'idle'
  | 'analyzing'
  | 'understanding'        // LLM is generating its understanding
  | 'understanding_ready'  // Understanding ready for user approval
  | 'planning'
  | 'plan_ready'           // Paradigms ready for approval
  | 'wireframing'          // Creating wireframe sketches
  | 'wireframe_ready'      // Wireframes ready for iteration
  | 'generating'           // High-fidelity generation
  | 'complete'
  | 'failed';
export type ComparisonMode = 'grid' | 'split' | 'overlay';
export type PrototypeMode = 'classic' | 'interactive';

interface VibeState {
  // Current session data
  currentSession: VibeSession | null;
  sourceHtml: string | null;
  sourceMetadata: UIMetadata | null;
  understanding: Understanding | null;
  plan: GeneratedPlan | null;
  variants: VibeVariant[];

  // Selected variants (user can choose fewer than 4)
  selectedVariants: number[];  // Array of variant indices [1,2,3,4] by default

  // Chat messages for vibe coding interface
  messages: ChatMessage[];

  // Status tracking
  status: VibeStatus;
  progress: VibeProgress | null;
  error: string | null;

  // UI state
  selectedVariantIndex: number | null;
  comparisonMode: ComparisonMode;
  prototypeMode: PrototypeMode;
  previewVariantIndex: number | null;
  previewTab: 'source' | 1 | 2 | 3 | 4;

  // Actions - Session management
  initSession: (session: VibeSession, sourceHtml: string) => void;
  setSession: (session: VibeSession) => void;
  clearSession: () => void;

  // Actions - Analysis
  setSourceMetadata: (metadata: UIMetadata) => void;
  setAnalyzing: (analyzing: boolean, message?: string) => void;

  // Actions - Understanding phase
  setUnderstanding: (understanding: Understanding) => void;
  approveUnderstanding: () => void;
  clearUnderstanding: () => void;

  // Actions - Variant selection
  setSelectedVariants: (indices: number[]) => void;
  toggleVariantSelection: (index: number) => void;

  // Actions - Plan management (paradigms)
  setPlan: (plan: GeneratedPlan, skipStatusUpdate?: boolean) => void;
  updatePlanItem: (variantIndex: number, updates: Partial<VariantPlan>) => void;
  approvePlan: () => void;  // Approves paradigms -> starts wireframing

  // Actions - Wireframe management
  startWireframing: () => void;
  approveWireframes: () => void;  // Approves wireframes -> starts generation
  goBackToWireframes: () => void;  // Return to wireframe stage from any later stage

  // Actions - Variant management
  setVariants: (variants: VibeVariant[], skipStatusUpdate?: boolean) => void;
  updateVariant: (variantIndex: number, updates: Partial<VibeVariant>) => void;
  addVariant: (variant: VibeVariant) => void;
  captureVariantScreenshots: () => Promise<void>;

  // Actions - Status & progress
  setStatus: (status: VibeStatus) => void;
  setProgress: (progress: VibeProgress | null) => void;
  setError: (error: string | null) => void;

  // Actions - UI state
  selectVariant: (index: number | null) => void;
  setComparisonMode: (mode: ComparisonMode) => void;
  setPrototypeMode: (mode: PrototypeMode) => void;
  setPreviewVariant: (index: number | null) => void;
  setPreviewTab: (tab: 'source' | 1 | 2 | 3 | 4) => void;

  // Actions - Messages
  addMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => string;
  updateMessage: (id: string, updates: Partial<ChatMessage>) => void;
  clearMessages: () => void;

  // Computed getters
  getVariantByIndex: (index: number) => VibeVariant | undefined;
  getPlanByIndex: (index: number) => VariantPlan | undefined;
  isAllVariantsComplete: () => boolean;
  getCompletedVariantsCount: () => number;
}

export const useVibeStore = create<VibeState>()(
  persist(
    (set, get) => ({
  // Initial state
  currentSession: null,
  sourceHtml: null,
  sourceMetadata: null,
  understanding: null,
  plan: null,
  variants: [],
  selectedVariants: [1, 2, 3, 4],  // Default: all 4 selected
  messages: [],

  status: 'idle',
  progress: null,
  error: null,

  selectedVariantIndex: null,
  comparisonMode: 'grid',
  prototypeMode: 'classic',
  previewVariantIndex: null,
  previewTab: 'source',

  // Session management
  initSession: (session, sourceHtml) => {
    set({
      currentSession: session,
      sourceHtml,
      sourceMetadata: null,
      understanding: null,
      plan: null,
      variants: [],
      selectedVariants: [1, 2, 3, 4],
      messages: [],
      status: session.status as VibeStatus,
      progress: null,
      error: null,
      selectedVariantIndex: session.selected_variant_index,
      previewVariantIndex: null,
      previewTab: 'source',
    });
  },

  setSession: (session) => {
    set({
      currentSession: session,
      status: session.status as VibeStatus,
      selectedVariantIndex: session.selected_variant_index,
      error: session.error_message,
    });
  },

  clearSession: () => {
    set({
      currentSession: null,
      sourceHtml: null,
      sourceMetadata: null,
      understanding: null,
      plan: null,
      variants: [],
      selectedVariants: [1, 2, 3, 4],
      messages: [],
      status: 'idle',
      progress: null,
      error: null,
      selectedVariantIndex: null,
      previewVariantIndex: null,
      previewTab: 'source',
    });
  },

  // Analysis
  setSourceMetadata: (metadata) => {
    set({ sourceMetadata: metadata });
  },

  setAnalyzing: (analyzing, message) => {
    if (analyzing) {
      set({
        status: 'analyzing',
        progress: {
          stage: 'analyzing',
          message: message || 'Analyzing screen...',
          percent: 20,
        },
      });
    } else {
      set({
        progress: null,
      });
    }
  },

  // Understanding phase
  setUnderstanding: (understanding) => {
    set({
      understanding,
      status: 'understanding_ready',
      progress: null,
    });
  },

  approveUnderstanding: () => {
    const { understanding } = get();
    if (understanding) {
      set({
        understanding: {
          ...understanding,
          approved: true,
          approvedAt: new Date().toISOString(),
        },
        status: 'planning',
        progress: {
          stage: 'planning',
          message: 'Generating 4 design approaches...',
          percent: 30,
        },
      });
    }
  },

  clearUnderstanding: () => {
    set({
      understanding: null,
      status: 'idle',
    });
  },

  // Variant selection
  setSelectedVariants: (indices) => {
    set({ selectedVariants: indices });
  },

  toggleVariantSelection: (index) => {
    const { selectedVariants } = get();
    if (selectedVariants.includes(index)) {
      // Don't allow deselecting if only one is selected
      if (selectedVariants.length > 1) {
        set({ selectedVariants: selectedVariants.filter(i => i !== index) });
      }
    } else {
      set({ selectedVariants: [...selectedVariants, index].sort() });
    }
  },

  // Plan management
  setPlan: (plan, skipStatusUpdate = false) => {
    if (skipStatusUpdate) {
      set({ plan });
    } else {
      set({
        plan,
        status: 'plan_ready',
        progress: null,
      });
    }
  },

  updatePlanItem: (variantIndex, updates) => {
    const { plan } = get();
    if (!plan) return;

    const updatedPlans = plan.plans.map((p) =>
      p.variant_index === variantIndex ? { ...p, ...updates } : p
    );

    set({
      plan: { ...plan, plans: updatedPlans },
    });
  },

  approvePlan: () => {
    const { currentSession } = get();
    if (currentSession) {
      set({
        currentSession: {
          ...currentSession,
          plan_approved: true,
          status: 'wireframing',  // Changed: Go to wireframing instead of generating
        },
        status: 'wireframing',
        progress: {
          stage: 'wireframing',
          message: 'Creating wireframe sketches...',
          percent: 50,
        },
      });
    }
  },

  // Wireframe management
  startWireframing: () => {
    set({
      status: 'wireframing',
      progress: {
        stage: 'wireframing',
        message: 'Creating wireframe sketches...',
        percent: 50,
      },
    });
  },

  approveWireframes: () => {
    const { currentSession } = get();
    if (currentSession) {
      set({
        currentSession: {
          ...currentSession,
          status: 'generating',
        },
        status: 'generating',
        progress: {
          stage: 'generating',
          message: 'Generating high-fidelity prototypes...',
          percent: 70,
        },
      });
    }
  },

  goBackToWireframes: () => {
    const { currentSession } = get();
    if (currentSession) {
      set({
        currentSession: {
          ...currentSession,
          status: 'wireframe_ready',
        },
        status: 'wireframe_ready',
        progress: null,
        // Keep variants in case user wants to compare
      });
    }
  },

  // Variant management
  setVariants: (variants, skipStatusUpdate = false) => {
    set({ variants });

    if (!skipStatusUpdate) {
      // Check if all complete or if we have any completed variants (for existing sessions)
      const completedCount = variants.filter((v) => v.status === 'complete').length;
      const allComplete = variants.length === 4 && completedCount === 4;

      // If all 4 are complete, or if we're loading an existing session with some completed variants,
      // set status to 'complete' (this allows tabs to be clickable)
      if (allComplete || (completedCount > 0 && get().status !== 'generating')) {
        set({ status: 'complete' });
      }
    }
  },

  updateVariant: (variantIndex, updates) => {
    const { variants } = get();
    const updatedVariants = variants.map((v) =>
      v.variant_index === variantIndex ? { ...v, ...updates } : v
    );
    set({ variants: updatedVariants });

    // Check if all complete
    const allComplete = updatedVariants.length === 4 && updatedVariants.every((v) => v.status === 'complete');
    if (allComplete) {
      set({ status: 'complete', progress: null });
      // Capture screenshots in background
      setTimeout(() => get().captureVariantScreenshots(), 1000);
    }
  },

  addVariant: (variant) => {
    const { variants } = get();
    const existingIndex = variants.findIndex((v) => v.variant_index === variant.variant_index);

    if (existingIndex >= 0) {
      // Replace existing
      const updatedVariants = [...variants];
      updatedVariants[existingIndex] = variant;
      set({ variants: updatedVariants });
    } else {
      // Add new
      set({ variants: [...variants, variant].sort((a, b) => a.variant_index - b.variant_index) });
    }

    // Check if all complete
    const allVariants = get().variants;
    const allComplete = allVariants.length === 4 && allVariants.every((v) => v.status === 'complete');
    if (allComplete) {
      set({ status: 'complete', progress: null });
      // Capture screenshots in background
      setTimeout(() => get().captureVariantScreenshots(), 1000);
    }
  },

  captureVariantScreenshots: async () => {
    const { currentSession, variants } = get();
    if (!currentSession) {
      console.warn('[VibeStore] No session for screenshot capture');
      return;
    }

    // Find variants that are complete but don't have screenshots
    const variantsToCapture = variants.filter(
      (v) => v.status === 'complete' && !v.screenshot_url && v.html_url
    );

    if (variantsToCapture.length === 0) {
      console.log('[VibeStore] No variants need screenshot capture');
      return;
    }

    console.log('[VibeStore] Capturing screenshots for', variantsToCapture.length, 'variants');

    for (const variant of variantsToCapture) {
      try {
        // Fetch HTML from storage
        const response = await fetch(variant.html_url);
        if (!response.ok) {
          console.error('[VibeStore] Failed to fetch HTML for variant', variant.variant_index);
          continue;
        }
        const html = await response.text();

        // Capture and save screenshot
        const screenshotUrl = await captureAndSaveVariantScreenshot(
          currentSession.id,
          variant.variant_index,
          html
        );

        if (screenshotUrl) {
          // Update local state with screenshot URL
          const updatedVariants = get().variants.map((v) =>
            v.variant_index === variant.variant_index
              ? { ...v, screenshot_url: screenshotUrl }
              : v
          );
          set({ variants: updatedVariants });
          console.log('[VibeStore] Screenshot captured for variant', variant.variant_index);
        }
      } catch (error) {
        console.error('[VibeStore] Error capturing screenshot for variant', variant.variant_index, error);
      }
    }
  },

  // Status & progress
  setStatus: (status) => {
    set({ status });
  },

  setProgress: (progress) => {
    set({ progress });
  },

  setError: (error) => {
    set({
      error,
      status: error ? 'failed' : get().status,
      progress: null,
    });
  },

  // UI state
  selectVariant: (index) => {
    set({ selectedVariantIndex: index });
  },

  setComparisonMode: (mode) => {
    set({ comparisonMode: mode });
  },

  setPrototypeMode: (mode) => {
    set({ prototypeMode: mode });
  },

  setPreviewVariant: (index) => {
    set({ previewVariantIndex: index });
  },

  setPreviewTab: (tab) => {
    set({ previewTab: tab });
  },

  // Messages
  addMessage: (message) => {
    const id = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const newMessage: ChatMessage = {
      ...message,
      id,
      timestamp: new Date(),
    };
    set((state) => ({
      messages: [...state.messages, newMessage],
    }));
    return id;
  },

  updateMessage: (id, updates) => {
    set((state) => ({
      messages: state.messages.map((msg) =>
        msg.id === id ? { ...msg, ...updates } : msg
      ),
    }));
  },

  clearMessages: () => {
    set({ messages: [] });
  },

  // Computed getters
  getVariantByIndex: (index) => {
    return get().variants.find((v) => v.variant_index === index);
  },

  getPlanByIndex: (index) => {
    return get().plan?.plans.find((p) => p.variant_index === index);
  },

  isAllVariantsComplete: () => {
    const { variants } = get();
    return variants.length === 4 && variants.every((v) => v.status === 'complete');
  },

  getCompletedVariantsCount: () => {
    return get().variants.filter((v) => v.status === 'complete').length;
  },
}),
    {
      name: 'voxel-vibe-store',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        // Only persist minimal session data, not large content
        currentSession: state.currentSession,
        // Don't persist sourceHtml - it's too large and causes quota errors
        // sourceHtml: state.sourceHtml,
        // Don't persist sourceMetadata - it can be re-extracted
        // sourceMetadata: state.sourceMetadata,
        understanding: state.understanding,
        plan: state.plan,
        // Don't persist full variants - they contain large HTML
        // variants: state.variants,
        selectedVariants: state.selectedVariants,
        // Don't persist messages - they can grow large
        // messages: state.messages,
        status: state.status,
        selectedVariantIndex: state.selectedVariantIndex,
        comparisonMode: state.comparisonMode,
        prototypeMode: state.prototypeMode,
        // Don't persist progress or error - these are transient
      }),
    }
  )
);

// Variant label colors
export const VIBE_VARIANT_COLORS: Record<number, string> = {
  1: '#1890ff', // Blue - Conservative
  2: '#52c41a', // Green - Modern
  3: '#faad14', // Gold - Bold
  4: '#eb2f96', // Pink - Alternative
};

export const getVibeVariantColor = (index: number): string =>
  VIBE_VARIANT_COLORS[index] || '#999';

// Variant label names
export const VIBE_VARIANT_LABELS: Record<number, string> = {
  1: 'Conservative',
  2: 'Modern',
  3: 'Bold',
  4: 'Alternative',
};

export const getVibeVariantLabel = (index: number): string =>
  VIBE_VARIANT_LABELS[index] || `Variant ${index}`;
