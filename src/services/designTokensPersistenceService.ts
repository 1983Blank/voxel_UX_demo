/**
 * Design Tokens Persistence Service
 * Handles syncing design tokens with Supabase backend
 */

import { supabase, isSupabaseConfigured } from './supabase';
import { useAuthStore } from '@/store/authStore';

export type TokenCategory =
  | 'color'
  | 'typography'
  | 'spacing'
  | 'sizing'
  | 'border-radius'
  | 'shadow'
  | 'animation'
  | 'opacity'
  | 'z-index'
  | 'breakpoint'
  | 'other';

export type TokenStatus = 'pending' | 'approved' | 'rejected' | 'deprecated';

export interface DesignToken {
  id: string;
  name: string;
  category: TokenCategory;
  subcategory?: string;
  value: string;
  valueType?: 'color' | 'dimension' | 'duration' | 'font-family' | 'font-weight' | 'number' | 'string';
  description?: string;
  cssVariable?: string;
  usageCount: number;
  sourceScreenIds: string[];
  sourceScreenNames: string[];
  status: TokenStatus;
  approvedAt?: string;
  approvedBy?: string;
  createdAt: string;
  updatedAt: string;
}

// Database row type
export interface DbDesignToken {
  id: string;
  user_id: string;
  name: string;
  category: string;
  subcategory: string | null;
  value: string;
  value_type: string | null;
  description: string | null;
  css_variable: string | null;
  usage_count: number;
  source_screens: string[];
  source_screen_names: string[];
  extraction_session_id: string | null;
  status: string;
  approved_at: string | null;
  approved_by: string | null;
  generated_by: string;
  created_at: string;
  updated_at: string;
}

// Insert type
export interface TokenInsert {
  user_id: string;
  name: string;
  category: string;
  subcategory?: string | null;
  value: string;
  value_type?: string | null;
  description?: string | null;
  css_variable?: string | null;
  usage_count?: number;
  source_screens?: string[];
  source_screen_names?: string[];
  extraction_session_id?: string | null;
  status?: string;
  generated_by?: string;
}

// Convert store token to DB insert format
function toDbFormat(token: DesignToken, userId: string): TokenInsert {
  return {
    user_id: userId,
    name: token.name,
    category: token.category,
    subcategory: token.subcategory || null,
    value: token.value,
    value_type: token.valueType || null,
    description: token.description || null,
    css_variable: token.cssVariable || null,
    usage_count: token.usageCount || 1,
    source_screens: token.sourceScreenIds || [],
    source_screen_names: token.sourceScreenNames || [],
    status: token.status || 'pending',
    generated_by: 'extracted',
  };
}

// Convert DB row to store token format
function fromDbFormat(row: DbDesignToken): DesignToken {
  return {
    id: row.id,
    name: row.name,
    category: row.category as TokenCategory,
    subcategory: row.subcategory || undefined,
    value: row.value,
    valueType: row.value_type as DesignToken['valueType'] || undefined,
    description: row.description || undefined,
    cssVariable: row.css_variable || undefined,
    usageCount: row.usage_count || 1,
    sourceScreenIds: row.source_screens || [],
    sourceScreenNames: row.source_screen_names || [],
    status: (row.status as TokenStatus) || 'pending',
    approvedAt: row.approved_at || undefined,
    approvedBy: row.approved_by || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Fetch all design tokens for the current user
 */
export async function fetchDesignTokens(): Promise<DesignToken[]> {
  if (!isSupabaseConfigured()) {
    console.warn('[DesignTokensPersistence] Supabase not configured');
    return [];
  }

  const user = useAuthStore.getState().supabaseUser;
  if (!user) {
    console.warn('[DesignTokensPersistence] No authenticated user');
    return [];
  }

  const { data, error } = await supabase
    .from('design_tokens')
    .select('*')
    .eq('user_id', user.id)
    .order('category', { ascending: true })
    .order('name', { ascending: true });

  if (error) {
    console.error('[DesignTokensPersistence] Error fetching tokens:', error);
    throw error;
  }

  return (data || []).map(fromDbFormat);
}

/**
 * Save multiple design tokens (batch insert)
 */
export async function saveDesignTokens(
  tokens: DesignToken[],
  options?: {
    extractionSessionId?: string;
  }
): Promise<DesignToken[]> {
  if (!isSupabaseConfigured()) {
    console.warn('[DesignTokensPersistence] Supabase not configured');
    return tokens;
  }

  const user = useAuthStore.getState().supabaseUser;
  if (!user) {
    console.warn('[DesignTokensPersistence] No authenticated user');
    return tokens;
  }

  const inserts: TokenInsert[] = tokens.map((t) => ({
    ...toDbFormat(t, user.id),
    extraction_session_id: options?.extractionSessionId || null,
  }));

  const { data, error } = await supabase
    .from('design_tokens')
    .insert(inserts)
    .select();

  if (error) {
    console.error('[DesignTokensPersistence] Error saving tokens:', error);
    throw error;
  }

  console.log(`[DesignTokensPersistence] Saved ${data?.length || 0} tokens`);
  return (data || []).map(fromDbFormat);
}

/**
 * Update a single design token
 */
export async function updateDesignToken(
  id: string,
  updates: Partial<DesignToken>
): Promise<DesignToken | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const user = useAuthStore.getState().supabaseUser;
  if (!user) {
    return null;
  }

  // Convert store updates to DB format
  const dbUpdates: Record<string, unknown> = {};
  if (updates.name !== undefined) dbUpdates.name = updates.name;
  if (updates.category !== undefined) dbUpdates.category = updates.category;
  if (updates.subcategory !== undefined) dbUpdates.subcategory = updates.subcategory;
  if (updates.value !== undefined) dbUpdates.value = updates.value;
  if (updates.valueType !== undefined) dbUpdates.value_type = updates.valueType;
  if (updates.description !== undefined) dbUpdates.description = updates.description;
  if (updates.cssVariable !== undefined) dbUpdates.css_variable = updates.cssVariable;
  if (updates.usageCount !== undefined) dbUpdates.usage_count = updates.usageCount;
  if (updates.status !== undefined) {
    dbUpdates.status = updates.status;
    if (updates.status === 'approved') {
      dbUpdates.approved_at = new Date().toISOString();
      dbUpdates.approved_by = user.id;
    }
  }

  const { data, error } = await supabase
    .from('design_tokens')
    .update(dbUpdates)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single();

  if (error) {
    console.error('[DesignTokensPersistence] Error updating token:', error);
    throw error;
  }

  return data ? fromDbFormat(data) : null;
}

/**
 * Update status for multiple tokens (batch update)
 */
export async function updateTokensStatus(
  ids: string[],
  status: TokenStatus
): Promise<void> {
  if (!isSupabaseConfigured() || ids.length === 0) {
    return;
  }

  const user = useAuthStore.getState().supabaseUser;
  if (!user) {
    return;
  }

  const updates: Record<string, unknown> = { status };
  if (status === 'approved') {
    updates.approved_at = new Date().toISOString();
    updates.approved_by = user.id;
  }

  const { error } = await supabase
    .from('design_tokens')
    .update(updates)
    .in('id', ids)
    .eq('user_id', user.id);

  if (error) {
    console.error('[DesignTokensPersistence] Error batch updating status:', error);
    throw error;
  }

  console.log(`[DesignTokensPersistence] Updated status to "${status}" for ${ids.length} tokens`);
}

/**
 * Delete multiple design tokens
 */
// Check if a string is a valid UUID format
function isValidUUID(id: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
}

/**
 * Delete multiple design tokens
 * Note: Only attempts to delete from Supabase for valid UUID IDs.
 * Legacy IDs are only in localStorage and will be removed from local state by the store.
 */
export async function deleteDesignTokens(ids: string[]): Promise<void> {
  if (!isSupabaseConfigured() || ids.length === 0) {
    return;
  }

  const user = useAuthStore.getState().supabaseUser;
  if (!user) {
    return;
  }

  // Filter to only valid UUIDs - legacy IDs don't exist in Supabase
  const validUUIDs = ids.filter(isValidUUID);
  const legacyIds = ids.filter(id => !isValidUUID(id));

  if (legacyIds.length > 0) {
    console.log(`[DesignTokensPersistence] Skipping ${legacyIds.length} legacy IDs (not in Supabase)`);
  }

  if (validUUIDs.length === 0) {
    console.log('[DesignTokensPersistence] No valid UUIDs to delete from Supabase');
    return;
  }

  const { error } = await supabase
    .from('design_tokens')
    .delete()
    .in('id', validUUIDs)
    .eq('user_id', user.id);

  if (error) {
    console.error('[DesignTokensPersistence] Error deleting tokens:', error);
    throw error;
  }

  console.log(`[DesignTokensPersistence] Deleted ${validUUIDs.length} tokens from Supabase`);
}

/**
 * Clear all design tokens for the current user
 */
export async function clearAllDesignTokens(): Promise<void> {
  if (!isSupabaseConfigured()) {
    return;
  }

  const user = useAuthStore.getState().supabaseUser;
  if (!user) {
    return;
  }

  const { error } = await supabase
    .from('design_tokens')
    .delete()
    .eq('user_id', user.id);

  if (error) {
    console.error('[DesignTokensPersistence] Error clearing tokens:', error);
    throw error;
  }

  console.log('[DesignTokensPersistence] Cleared all design tokens');
}

/**
 * Get design token statistics by category
 */
export async function getDesignTokenStats(): Promise<{
  total: number;
  byCategory: Record<TokenCategory, number>;
  byStatus: Record<TokenStatus, number>;
}> {
  if (!isSupabaseConfigured()) {
    return {
      total: 0,
      byCategory: {} as Record<TokenCategory, number>,
      byStatus: { pending: 0, approved: 0, rejected: 0, deprecated: 0 },
    };
  }

  const user = useAuthStore.getState().supabaseUser;
  if (!user) {
    return {
      total: 0,
      byCategory: {} as Record<TokenCategory, number>,
      byStatus: { pending: 0, approved: 0, rejected: 0, deprecated: 0 },
    };
  }

  const { data, error } = await supabase
    .from('design_tokens')
    .select('category, status')
    .eq('user_id', user.id);

  if (error) {
    console.error('[DesignTokensPersistence] Error getting stats:', error);
    return {
      total: 0,
      byCategory: {} as Record<TokenCategory, number>,
      byStatus: { pending: 0, approved: 0, rejected: 0, deprecated: 0 },
    };
  }

  const byCategory: Record<string, number> = {};
  const byStatus: Record<string, number> = {
    pending: 0,
    approved: 0,
    rejected: 0,
    deprecated: 0,
  };

  data?.forEach((row) => {
    // Count by category
    byCategory[row.category] = (byCategory[row.category] || 0) + 1;
    // Count by status
    if (row.status in byStatus) {
      byStatus[row.status]++;
    }
  });

  return {
    total: data?.length || 0,
    byCategory: byCategory as Record<TokenCategory, number>,
    byStatus: byStatus as Record<TokenStatus, number>,
  };
}

/**
 * Upsert design tokens (update existing by name+category, insert new ones)
 * This is useful when re-extracting tokens from screens
 */
export async function upsertDesignTokens(
  tokens: DesignToken[],
  options?: {
    extractionSessionId?: string;
  }
): Promise<DesignToken[]> {
  if (!isSupabaseConfigured()) {
    return tokens;
  }

  const user = useAuthStore.getState().supabaseUser;
  if (!user) {
    return tokens;
  }

  // First, fetch existing tokens to find matches
  const { data: existing } = await supabase
    .from('design_tokens')
    .select('id, name, category, usage_count')
    .eq('user_id', user.id);

  const existingMap = new Map<string, { id: string; usageCount: number }>();
  existing?.forEach((t) => {
    const key = `${t.category}:${t.name}`;
    existingMap.set(key, { id: t.id, usageCount: t.usage_count });
  });

  const toInsert: TokenInsert[] = [];
  const toUpdate: Array<{ id: string; usageCount: number; sourceScreens: string[]; sourceScreenNames: string[] }> = [];

  for (const token of tokens) {
    const key = `${token.category}:${token.name}`;
    const existingToken = existingMap.get(key);

    if (existingToken) {
      // Update existing token's usage count and source screens
      toUpdate.push({
        id: existingToken.id,
        usageCount: existingToken.usageCount + token.usageCount,
        sourceScreens: token.sourceScreenIds,
        sourceScreenNames: token.sourceScreenNames,
      });
    } else {
      // Insert new token
      toInsert.push({
        ...toDbFormat(token, user.id),
        extraction_session_id: options?.extractionSessionId || null,
      });
    }
  }

  // Batch insert new tokens
  if (toInsert.length > 0) {
    const { error: insertError } = await supabase
      .from('design_tokens')
      .insert(toInsert)
      .select();

    if (insertError) {
      console.error('[DesignTokensPersistence] Error inserting tokens:', insertError);
    }
  }

  // Update existing tokens (one by one for now, could optimize with batch)
  for (const update of toUpdate) {
    await supabase
      .from('design_tokens')
      .update({
        usage_count: update.usageCount,
        source_screens: update.sourceScreens,
        source_screen_names: update.sourceScreenNames,
      })
      .eq('id', update.id);
  }

  console.log(`[DesignTokensPersistence] Upserted: ${toInsert.length} new, ${toUpdate.length} updated`);

  // Fetch all tokens to return current state
  return await fetchDesignTokens();
}
