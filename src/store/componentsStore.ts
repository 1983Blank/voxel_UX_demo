import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import {
  extractComponentsFromMultipleScreens,
  type ExtractedComponentLLM,
  type ComponentCategory,
  type ComponentVariant,
  type ExtractionProgress,
  CATEGORY_INFO,
} from '@/services/componentExtractionService';

export type ComponentStatus = 'pending' | 'approved' | 'rejected' | 'needs-fix';

export interface ExtractedComponent {
  id: string;
  name: string;
  category: string;
  description: string;
  sourceScreen: string;
  sourceScreenIds: string[];
  extractedAt: string;
  tags: string[];
  html: string;
  css: string;
  occurrences: number;
  variants?: ComponentVariant[];
  props?: string[];
  generatedBy: 'dom-parser' | 'llm';
  status?: ComponentStatus;
  approvedAt?: string;
  approvedBy?: string;
}

interface ComponentsState {
  components: ExtractedComponent[];
  selectedComponent: ExtractedComponent | null;
  selectedVariant: string | null; // variant name for detail view
  searchQuery: string;
  selectedCategory: string | null;
  selectedTags: string[];
  isExtracting: boolean;
  extractionProgress: ExtractionProgress | null;
  lastExtractionTime: string | null;
  lastExtractionProvider: string | null;
  lastExtractionModel: string | null;

  // Batch selection state
  selectedIds: string[];

  // Actions
  setSearchQuery: (query: string) => void;
  setSelectedCategory: (category: string | null) => void;
  toggleTag: (tag: string) => void;
  clearFilters: () => void;
  selectComponent: (component: ExtractedComponent | null) => void;
  selectVariant: (variantName: string | null) => void;
  extractWithLLM: (
    screens: Array<{ id: string; name: string; editedHtml?: string }>,
    options?: {
      provider?: 'anthropic' | 'openai' | 'google';
      model?: string;
    }
  ) => Promise<{
    extractedCount: number;
    totalScreens: number;
    failedScreens: number;
    errors: Array<{ screenId: string; error: string }>;
  } | undefined>;
  clearComponents: () => void;

  // Batch selection actions
  toggleComponentSelection: (id: string) => void;
  selectAllComponents: (ids: string[]) => void;
  clearSelection: () => void;

  // Batch operations
  deleteSelectedComponents: () => void;
  approveSelectedComponents: () => void;
  rejectSelectedComponents: () => void;
  markSelectedAsNeedsFix: () => void;
  updateComponentStatus: (id: string, status: ComponentStatus) => void;
}

// Convert LLM extracted component to store component
function convertLLMComponent(comp: ExtractedComponentLLM): ExtractedComponent {
  // Filter out invalid variants that don't have required fields
  const validVariants = comp.variants?.filter(
    (v) => v && typeof v.name === 'string' && v.name.length > 0
  );

  return {
    id: comp.id,
    name: comp.name || 'Unnamed Component',
    category: comp.category || 'other',
    description: comp.description || '',
    sourceScreen: comp.sourceScreenIds?.[0] || 'unknown',
    sourceScreenIds: comp.sourceScreenIds || [],
    extractedAt: comp.extractedAt || new Date().toISOString(),
    tags: generateTags(comp),
    html: comp.html || '',
    css: comp.css || '',
    occurrences: comp.occurrences || 1,
    variants: validVariants,
    props: comp.props,
    generatedBy: 'llm',
  };
}

// Generate tags from component metadata
function generateTags(comp: ExtractedComponentLLM): string[] {
  const tags: string[] = [];

  // Add category as tag
  const categoryInfo = CATEGORY_INFO[comp.category as ComponentCategory];
  if (categoryInfo) {
    tags.push(categoryInfo.label.toLowerCase());
  }

  // Add occurrence-based tags
  if (comp.occurrences > 3) {
    tags.push('frequently-used');
  }
  if (comp.occurrences === 1) {
    tags.push('unique');
  }

  // Add variant-based tags
  if (comp.variants && comp.variants.length > 0) {
    tags.push('has-variants');
    comp.variants.forEach((v) => {
      const variantName = v?.name?.toLowerCase() || '';
      if (variantName.includes('hover')) tags.push('interactive');
      if (variantName.includes('disabled')) tags.push('has-disabled');
    });
  }

  // Add props-based tags
  if (comp.props && comp.props.length > 0) {
    tags.push('customizable');
  }

  // Limit to 5 unique tags
  return [...new Set(tags)].slice(0, 5);
}

// Deduplicate stored components by category + normalized name
function deduplicateStoredComponents(components: ExtractedComponent[]): ExtractedComponent[] {
  const componentMap = new Map<string, ExtractedComponent>();

  for (const comp of components) {
    // Guard against undefined name or category
    const name = comp.name || 'unnamed';
    const category = comp.category || 'other';
    const signature = `${category}:${name.toLowerCase().replace(/[^a-z0-9]/g, '')}`;

    if (componentMap.has(signature)) {
      // Merge with existing
      const existing = componentMap.get(signature)!;
      existing.occurrences = (existing.occurrences || 1) + (comp.occurrences || 1);
      if (!existing.sourceScreenIds.includes(comp.sourceScreen)) {
        existing.sourceScreenIds.push(comp.sourceScreen);
      }
      // Merge variants
      if (comp.variants) {
        const existingVariantNames = new Set(existing.variants?.map((v) => v?.name?.toLowerCase() || '') || []);
        const newVariants = comp.variants.filter((v) => !existingVariantNames.has(v?.name?.toLowerCase() || ''));
        existing.variants = [...(existing.variants || []), ...newVariants];
      }
    } else {
      componentMap.set(signature, { ...comp });
    }
  }

  // Sort by occurrences (most common first)
  return Array.from(componentMap.values()).sort((a, b) => (b.occurrences || 1) - (a.occurrences || 1));
}

export const useComponentsStore = create<ComponentsState>()(
  persist(
    (set, get) => ({
      components: [],
      selectedComponent: null,
      selectedVariant: null,
      searchQuery: '',
      selectedCategory: null,
      selectedTags: [],
      isExtracting: false,
      extractionProgress: null,
      lastExtractionTime: null,
      lastExtractionProvider: null,
      lastExtractionModel: null,

      // Batch selection state
      selectedIds: [],

      setSearchQuery: (query) => set({ searchQuery: query }),

      setSelectedCategory: (category) => set({ selectedCategory: category }),

      toggleTag: (tag) =>
        set((state) => ({
          selectedTags: state.selectedTags.includes(tag)
            ? state.selectedTags.filter((t) => t !== tag)
            : [...state.selectedTags, tag],
        })),

      clearFilters: () =>
        set({
          searchQuery: '',
          selectedCategory: null,
          selectedTags: [],
        }),

      selectComponent: (component) =>
        set({ selectedComponent: component, selectedVariant: null }),

      selectVariant: (variantName) => set({ selectedVariant: variantName }),

      extractWithLLM: async (screens, options) => {
        set({ isExtracting: true, extractionProgress: null });

        try {
          // Filter screens with HTML content
          const screensWithHtml = screens
            .filter((s) => s.editedHtml)
            .map((s) => ({
              id: s.id,
              html: s.editedHtml!,
              name: s.name,
            }));

          if (screensWithHtml.length === 0) {
            set({
              components: [],
              isExtracting: false,
              extractionProgress: null,
              lastExtractionTime: new Date().toISOString(),
            });
            return {
              extractedCount: 0,
              totalScreens: 0,
              failedScreens: 0,
              errors: [],
            };
          }

          // Clear existing components at start
          set({ components: [] });

          // Extract components with progress tracking and progressive loading
          const result = await extractComponentsFromMultipleScreens(
            screensWithHtml,
            {
              provider: options?.provider,
              model: options?.model,
              concurrency: 3, // Process 3 screens in parallel
              onProgress: (progress) => {
                set({ extractionProgress: progress });
              },
              // Progressive loading: add components as they're found (with immediate dedup)
              onComponentsFound: (newComponents, screenName) => {
                const converted = newComponents.map(convertLLMComponent);
                const current = get().components;
                // Deduplicate immediately when adding to prevent visible duplicates
                const merged = deduplicateStoredComponents([...current, ...converted]);
                console.log(`[ComponentsStore] +${converted.length} from "${screenName}" → ${merged.length} total (deduplicated)`);
                set({ components: merged });
              },
            }
          );

          // Components already deduplicated progressively - just finalize state
          const finalComponents = get().components;

          set({
            isExtracting: false,
            extractionProgress: null,
            lastExtractionTime: new Date().toISOString(),
          });

          // Log any errors and return result for caller to handle
          if (result.errors.length > 0) {
            console.warn('[ComponentsStore] Some screens failed:', result.errors);
          }

          return {
            extractedCount: finalComponents.length,
            totalScreens: screensWithHtml.length,
            failedScreens: result.errors.length,
            errors: result.errors,
          };
        } catch (error) {
          console.error('[ComponentsStore] Error extracting components:', error);
          set({
            isExtracting: false,
            extractionProgress: null,
          });
          throw error;
        }
      },

      clearComponents: () =>
        set({
          components: [],
          lastExtractionTime: null,
          lastExtractionProvider: null,
          lastExtractionModel: null,
          selectedIds: [],
        }),

      // Batch selection actions
      toggleComponentSelection: (id) =>
        set((state) => ({
          selectedIds: state.selectedIds.includes(id)
            ? state.selectedIds.filter((i) => i !== id)
            : [...state.selectedIds, id],
        })),

      selectAllComponents: (ids) => set({ selectedIds: ids }),

      clearSelection: () => set({ selectedIds: [] }),

      // Batch operations
      deleteSelectedComponents: () =>
        set((state) => ({
          components: state.components.filter((c) => !state.selectedIds.includes(c.id)),
          selectedIds: [],
        })),

      approveSelectedComponents: () =>
        set((state) => ({
          components: state.components.map((c) =>
            state.selectedIds.includes(c.id)
              ? { ...c, status: 'approved' as ComponentStatus, approvedAt: new Date().toISOString() }
              : c
          ),
          selectedIds: [],
        })),

      rejectSelectedComponents: () =>
        set((state) => ({
          components: state.components.map((c) =>
            state.selectedIds.includes(c.id)
              ? { ...c, status: 'rejected' as ComponentStatus }
              : c
          ),
          selectedIds: [],
        })),

      markSelectedAsNeedsFix: () =>
        set((state) => ({
          components: state.components.map((c) =>
            state.selectedIds.includes(c.id)
              ? { ...c, status: 'needs-fix' as ComponentStatus }
              : c
          ),
          selectedIds: [],
        })),

      updateComponentStatus: (id, status) =>
        set((state) => ({
          components: state.components.map((c) =>
            c.id === id
              ? { ...c, status, ...(status === 'approved' ? { approvedAt: new Date().toISOString() } : {}) }
              : c
          ),
        })),
    }),
    {
      name: 'voxel-components-store',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        components: state.components,
        lastExtractionTime: state.lastExtractionTime,
        lastExtractionProvider: state.lastExtractionProvider,
        lastExtractionModel: state.lastExtractionModel,
      }),
    }
  )
);

// Helper to get categories from components
export const getCategories = (components: ExtractedComponent[]): string[] => {
  return [...new Set(components.map((c) => c.category))].sort();
};

// Helper to get all tags from components
export const getAllTags = (components: ExtractedComponent[]): string[] => {
  return [...new Set(components.flatMap((c) => c.tags))].sort();
};

// Re-export types and constants
export type { ExtractedComponentLLM, ComponentCategory, ComponentVariant };
export { CATEGORY_INFO };
