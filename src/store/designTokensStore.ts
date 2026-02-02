/**
 * Design Tokens Store
 * Manages design system tokens with Supabase persistence
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

// Use crypto.randomUUID() which is built into browsers and Node.js
const uuidv4 = () => crypto.randomUUID();
import {
  fetchDesignTokens,
  saveDesignTokens,
  updateDesignToken,
  updateTokensStatus,
  deleteDesignTokens,
  clearAllDesignTokens,
  replaceAllDesignTokens,
  type DesignToken,
  type TokenCategory,
  type TokenStatus,
} from '@/services/designTokensPersistenceService';
import { isSupabaseConfigured } from '@/services/supabase';

// Re-export types
export type { DesignToken, TokenCategory, TokenStatus };

interface DesignTokensState {
  tokens: DesignToken[];
  isLoading: boolean;
  isInitialized: boolean;
  isExtracting: boolean;
  lastExtractionTime: string | null;

  // Filters
  searchQuery: string;
  selectedCategory: TokenCategory | null;
  selectedStatus: TokenStatus | null;

  // Batch selection
  selectedIds: string[];

  // Actions
  initializeTokens: () => Promise<void>;
  setSearchQuery: (query: string) => void;
  setSelectedCategory: (category: TokenCategory | null) => void;
  setSelectedStatus: (status: TokenStatus | null) => void;
  clearFilters: () => void;

  // Token CRUD
  extractTokensFromScreens: (
    screens: Array<{ id: string; name: string; html: string }>
  ) => Promise<DesignToken[]>;
  addToken: (token: Omit<DesignToken, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  updateToken: (id: string, updates: Partial<DesignToken>) => Promise<void>;
  deleteTokens: (ids: string[]) => Promise<void>;
  clearTokens: () => Promise<void>;

  // Batch selection
  toggleTokenSelection: (id: string) => void;
  selectAllTokens: (ids: string[]) => void;
  clearSelection: () => void;

  // Batch operations
  approveSelectedTokens: () => Promise<void>;
  rejectSelectedTokens: () => Promise<void>;
  deprecateSelectedTokens: () => Promise<void>;
  deleteSelectedTokens: () => Promise<void>;
}

// Token extraction utilities
function extractColorsFromHtml(html: string, screenId: string, screenName: string): DesignToken[] {
  const tokens: DesignToken[] = [];
  const colorRegex = /#([0-9A-Fa-f]{3,8})\b|rgb\([^)]+\)|rgba\([^)]+\)|hsl\([^)]+\)|hsla\([^)]+\)/g;
  const colorCounts = new Map<string, number>();

  let match;
  while ((match = colorRegex.exec(html)) !== null) {
    const color = match[0].toLowerCase();
    colorCounts.set(color, (colorCounts.get(color) || 0) + 1);
  }

  colorCounts.forEach((count, color) => {
    if (count >= 2) {
      // Only include colors used multiple times
      tokens.push({
        id: uuidv4(),
        name: color,
        category: 'color',
        value: color,
        valueType: 'color',
        usageCount: count,
        sourceScreenIds: [screenId],
        sourceScreenNames: [screenName],
        status: 'pending',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
  });

  return tokens;
}

function extractTypographyFromHtml(html: string, screenId: string, screenName: string): DesignToken[] {
  const tokens: DesignToken[] = [];

  // Font families
  const fontFamilyRegex = /font-family:\s*([^;}"']+)/gi;
  const fontFamilies = new Map<string, number>();
  let match;

  while ((match = fontFamilyRegex.exec(html)) !== null) {
    const family = match[1].trim().replace(/["']/g, '');
    fontFamilies.set(family, (fontFamilies.get(family) || 0) + 1);
  }

  fontFamilies.forEach((count, family) => {
    tokens.push({
      id: uuidv4(),
      name: `font-${family.split(',')[0].trim().toLowerCase().replace(/\s+/g, '-')}`,
      category: 'typography',
      subcategory: 'font-family',
      value: family,
      valueType: 'font-family',
      usageCount: count,
      sourceScreenIds: [screenId],
      sourceScreenNames: [screenName],
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  });

  // Font sizes
  const fontSizeRegex = /font-size:\s*([^;}"']+)/gi;
  const fontSizes = new Map<string, number>();

  while ((match = fontSizeRegex.exec(html)) !== null) {
    const size = match[1].trim();
    fontSizes.set(size, (fontSizes.get(size) || 0) + 1);
  }

  fontSizes.forEach((count, size) => {
    tokens.push({
      id: uuidv4(),
      name: `font-size-${size.replace(/[^a-z0-9]/gi, '')}`,
      category: 'typography',
      subcategory: 'font-size',
      value: size,
      valueType: 'dimension',
      usageCount: count,
      sourceScreenIds: [screenId],
      sourceScreenNames: [screenName],
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  });

  // Font weights
  const fontWeightRegex = /font-weight:\s*([^;}"']+)/gi;
  const fontWeights = new Map<string, number>();

  while ((match = fontWeightRegex.exec(html)) !== null) {
    const weight = match[1].trim();
    fontWeights.set(weight, (fontWeights.get(weight) || 0) + 1);
  }

  fontWeights.forEach((count, weight) => {
    tokens.push({
      id: uuidv4(),
      name: `font-weight-${weight}`,
      category: 'typography',
      subcategory: 'font-weight',
      value: weight,
      valueType: 'font-weight',
      usageCount: count,
      sourceScreenIds: [screenId],
      sourceScreenNames: [screenName],
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  });

  return tokens;
}

function extractSpacingFromHtml(html: string, screenId: string, screenName: string): DesignToken[] {
  const tokens: DesignToken[] = [];
  const spacingRegex = /(margin|padding)(?:-(?:top|right|bottom|left))?:\s*([^;}"']+)/gi;
  const spacingValues = new Map<string, number>();

  let match;
  while ((match = spacingRegex.exec(html)) !== null) {
    const value = match[2].trim();
    // Only track px, rem, em values
    if (/^\d+(?:px|rem|em)$/.test(value)) {
      spacingValues.set(value, (spacingValues.get(value) || 0) + 1);
    }
  }

  spacingValues.forEach((count, value) => {
    if (count >= 2) {
      tokens.push({
        id: uuidv4(),
        name: `spacing-${value.replace(/[^a-z0-9]/gi, '')}`,
        category: 'spacing',
        value: value,
        valueType: 'dimension',
        usageCount: count,
        sourceScreenIds: [screenId],
        sourceScreenNames: [screenName],
        status: 'pending',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
  });

  return tokens;
}

function extractBorderRadiusFromHtml(html: string, screenId: string, screenName: string): DesignToken[] {
  const tokens: DesignToken[] = [];
  const radiusRegex = /border-radius:\s*([^;}"']+)/gi;
  const radiusValues = new Map<string, number>();

  let match;
  while ((match = radiusRegex.exec(html)) !== null) {
    const value = match[1].trim();
    radiusValues.set(value, (radiusValues.get(value) || 0) + 1);
  }

  radiusValues.forEach((count, value) => {
    if (count >= 2) {
      tokens.push({
        id: uuidv4(),
        name: `radius-${value.replace(/[^a-z0-9]/gi, '')}`,
        category: 'border-radius',
        value: value,
        valueType: 'dimension',
        usageCount: count,
        sourceScreenIds: [screenId],
        sourceScreenNames: [screenName],
        status: 'pending',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
  });

  return tokens;
}

function extractShadowsFromHtml(html: string, screenId: string, screenName: string): DesignToken[] {
  const tokens: DesignToken[] = [];
  const shadowRegex = /box-shadow:\s*([^;}"']+)/gi;
  const shadowValues = new Map<string, number>();

  let match;
  while ((match = shadowRegex.exec(html)) !== null) {
    const value = match[1].trim();
    if (value !== 'none') {
      shadowValues.set(value, (shadowValues.get(value) || 0) + 1);
    }
  }

  let shadowIndex = 1;
  shadowValues.forEach((count, value) => {
    tokens.push({
      id: uuidv4(),
      name: `shadow-${shadowIndex++}`,
      category: 'shadow',
      value: value,
      valueType: 'string',
      usageCount: count,
      sourceScreenIds: [screenId],
      sourceScreenNames: [screenName],
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  });

  return tokens;
}

// Deduplicate tokens by merging usage counts and sources
function deduplicateTokens(tokens: DesignToken[]): DesignToken[] {
  const tokenMap = new Map<string, DesignToken>();

  for (const token of tokens) {
    const key = `${token.category}:${token.value}`;
    const existing = tokenMap.get(key);

    if (existing) {
      // Merge
      existing.usageCount += token.usageCount;
      token.sourceScreenIds.forEach((id) => {
        if (!existing.sourceScreenIds.includes(id)) {
          existing.sourceScreenIds.push(id);
        }
      });
      token.sourceScreenNames.forEach((name) => {
        if (!existing.sourceScreenNames.includes(name)) {
          existing.sourceScreenNames.push(name);
        }
      });
    } else {
      tokenMap.set(key, { ...token });
    }
  }

  return Array.from(tokenMap.values()).sort((a, b) => b.usageCount - a.usageCount);
}

export const useDesignTokensStore = create<DesignTokensState>()(
  persist(
    (set, get) => ({
      tokens: [],
      isLoading: false,
      isInitialized: false,
      isExtracting: false,
      lastExtractionTime: null,

      searchQuery: '',
      selectedCategory: null,
      selectedStatus: null,
      selectedIds: [],

      initializeTokens: async () => {
        const state = get();
        if (state.isLoading) return;

        // Always fetch from Supabase to ensure fresh data
        // (localStorage cache from persist middleware might be stale)
        set({ isLoading: true });

        try {
          if (isSupabaseConfigured()) {
            const tokens = await fetchDesignTokens();
            set({ tokens, isInitialized: true, isLoading: false });
            console.log(`[DesignTokensStore] Loaded ${tokens.length} tokens from Supabase`);
          } else {
            // Local only - use what's in localStorage (from persist)
            set({ isInitialized: true, isLoading: false });
          }
        } catch (error) {
          console.error('[DesignTokensStore] Error loading tokens:', error);
          set({ isInitialized: true, isLoading: false });
        }
      },

      setSearchQuery: (query) => set({ searchQuery: query }),
      setSelectedCategory: (category) => set({ selectedCategory: category }),
      setSelectedStatus: (status) => set({ selectedStatus: status }),
      clearFilters: () =>
        set({ searchQuery: '', selectedCategory: null, selectedStatus: null }),

      extractTokensFromScreens: async (screens) => {
        set({ isExtracting: true });

        try {
          let allTokens: DesignToken[] = [];

          for (const screen of screens) {
            const colors = extractColorsFromHtml(screen.html, screen.id, screen.name);
            const typography = extractTypographyFromHtml(screen.html, screen.id, screen.name);
            const spacing = extractSpacingFromHtml(screen.html, screen.id, screen.name);
            const borderRadius = extractBorderRadiusFromHtml(screen.html, screen.id, screen.name);
            const shadows = extractShadowsFromHtml(screen.html, screen.id, screen.name);

            allTokens = [...allTokens, ...colors, ...typography, ...spacing, ...borderRadius, ...shadows];
          }

          // Deduplicate
          const deduped = deduplicateTokens(allTokens);
          console.log(`[DesignTokensStore] Extracted ${deduped.length} unique tokens from ${screens.length} screens`);

          // Save to Supabase (replace all to ensure clean state)
          if (isSupabaseConfigured()) {
            const savedTokens = await replaceAllDesignTokens(deduped);
            set({
              tokens: savedTokens,
              isExtracting: false,
              lastExtractionTime: new Date().toISOString(),
            });
            return savedTokens;
          } else {
            // Local only - replace all tokens
            set({
              tokens: deduped,
              isExtracting: false,
              lastExtractionTime: new Date().toISOString(),
            });
            return deduped;
          }
        } catch (error) {
          console.error('[DesignTokensStore] Error extracting tokens:', error);
          set({ isExtracting: false });
          throw error;
        }
      },

      addToken: async (tokenData) => {
        const newToken: DesignToken = {
          ...tokenData,
          id: uuidv4(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        // Optimistic update
        set((state) => ({ tokens: [...state.tokens, newToken] }));

        // Persist
        if (isSupabaseConfigured()) {
          try {
            const [saved] = await saveDesignTokens([newToken]);
            set((state) => ({
              tokens: state.tokens.map((t) => (t.id === newToken.id ? saved : t)),
            }));
          } catch (error) {
            console.error('[DesignTokensStore] Error saving token:', error);
            // Rollback
            set((state) => ({
              tokens: state.tokens.filter((t) => t.id !== newToken.id),
            }));
          }
        }
      },

      updateToken: async (id, updates) => {
        const current = get().tokens.find((t) => t.id === id);
        if (!current) return;

        // Optimistic update
        set((state) => ({
          tokens: state.tokens.map((t) =>
            t.id === id ? { ...t, ...updates, updatedAt: new Date().toISOString() } : t
          ),
        }));

        // Persist
        if (isSupabaseConfigured()) {
          try {
            await updateDesignToken(id, updates);
          } catch (error) {
            console.error('[DesignTokensStore] Error updating token:', error);
            // Rollback
            set((state) => ({
              tokens: state.tokens.map((t) => (t.id === id ? current : t)),
            }));
          }
        }
      },

      deleteTokens: async (ids) => {
        const toDelete = get().tokens.filter((t) => ids.includes(t.id));

        // Optimistic update
        set((state) => ({
          tokens: state.tokens.filter((t) => !ids.includes(t.id)),
          selectedIds: state.selectedIds.filter((id) => !ids.includes(id)),
        }));

        // Persist
        if (isSupabaseConfigured()) {
          try {
            await deleteDesignTokens(ids);
          } catch (error) {
            console.error('[DesignTokensStore] Error deleting tokens:', error);
            // Rollback
            set((state) => ({
              tokens: [...state.tokens, ...toDelete],
            }));
          }
        }
      },

      clearTokens: async () => {
        const previousTokens = get().tokens;

        // Optimistic update
        set({ tokens: [], selectedIds: [], lastExtractionTime: null });

        // Persist
        if (isSupabaseConfigured()) {
          try {
            await clearAllDesignTokens();
          } catch (error) {
            console.error('[DesignTokensStore] Error clearing tokens:', error);
            // Rollback
            set({ tokens: previousTokens });
          }
        }
      },

      // Batch selection
      toggleTokenSelection: (id) =>
        set((state) => ({
          selectedIds: state.selectedIds.includes(id)
            ? state.selectedIds.filter((i) => i !== id)
            : [...state.selectedIds, id],
        })),

      selectAllTokens: (ids) => set({ selectedIds: ids }),

      clearSelection: () => set({ selectedIds: [] }),

      // Batch operations
      approveSelectedTokens: async () => {
        const { selectedIds } = get();
        if (selectedIds.length === 0) return;

        // Optimistic update
        set((state) => ({
          tokens: state.tokens.map((t) =>
            selectedIds.includes(t.id)
              ? { ...t, status: 'approved' as TokenStatus, approvedAt: new Date().toISOString() }
              : t
          ),
          selectedIds: [],
        }));

        // Persist
        if (isSupabaseConfigured()) {
          try {
            await updateTokensStatus(selectedIds, 'approved');
          } catch (error) {
            console.error('[DesignTokensStore] Error approving tokens:', error);
          }
        }
      },

      rejectSelectedTokens: async () => {
        const { selectedIds } = get();
        if (selectedIds.length === 0) return;

        set((state) => ({
          tokens: state.tokens.map((t) =>
            selectedIds.includes(t.id) ? { ...t, status: 'rejected' as TokenStatus } : t
          ),
          selectedIds: [],
        }));

        if (isSupabaseConfigured()) {
          try {
            await updateTokensStatus(selectedIds, 'rejected');
          } catch (error) {
            console.error('[DesignTokensStore] Error rejecting tokens:', error);
          }
        }
      },

      deprecateSelectedTokens: async () => {
        const { selectedIds } = get();
        if (selectedIds.length === 0) return;

        set((state) => ({
          tokens: state.tokens.map((t) =>
            selectedIds.includes(t.id) ? { ...t, status: 'deprecated' as TokenStatus } : t
          ),
          selectedIds: [],
        }));

        if (isSupabaseConfigured()) {
          try {
            await updateTokensStatus(selectedIds, 'deprecated');
          } catch (error) {
            console.error('[DesignTokensStore] Error deprecating tokens:', error);
          }
        }
      },

      deleteSelectedTokens: async () => {
        const { selectedIds, deleteTokens } = get();
        await deleteTokens(selectedIds);
      },
    }),
    {
      name: 'voxel-design-tokens-store',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        tokens: state.tokens,
        lastExtractionTime: state.lastExtractionTime,
      }),
    }
  )
);

// Selectors
export const getTokensByCategory = (tokens: DesignToken[], category: TokenCategory): DesignToken[] =>
  tokens.filter((t) => t.category === category);

export const getApprovedTokens = (tokens: DesignToken[]): DesignToken[] =>
  tokens.filter((t) => t.status === 'approved');

export const getTokenCategories = (tokens: DesignToken[]): TokenCategory[] =>
  [...new Set(tokens.map((t) => t.category))].sort() as TokenCategory[];
