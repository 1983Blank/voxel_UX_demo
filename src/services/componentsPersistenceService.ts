/**
 * Components Persistence Service
 * Handles syncing extracted components with Supabase backend
 */

import { supabase, isSupabaseConfigured } from './supabase';
import { useAuthStore } from '@/store/authStore';
import type { ExtractedComponent, ComponentStatus } from '@/store/componentsStore';

// Database row type
export interface DbExtractedComponent {
  id: string;
  user_id: string;
  screen_id: string | null;
  source_screen_name: string | null;
  extraction_session_id: string | null;
  name: string;
  category: string;
  description: string | null;
  tags: string[];
  html: string;
  css: string | null;
  variants: unknown;
  props: unknown;
  occurrences: number;
  status: string;
  approved_at: string | null;
  approved_by: string | null;
  generated_by: string;
  generation_model: string | null;
  generation_provider: string | null;
  created_at: string;
  updated_at: string;
}

// Insert type (without auto-generated fields)
export interface ComponentInsert {
  user_id: string;
  screen_id?: string | null;
  source_screen_name?: string | null;
  extraction_session_id?: string | null;
  name: string;
  category: string;
  description?: string | null;
  tags?: string[];
  html: string;
  css?: string | null;
  variants?: unknown;
  props?: unknown;
  occurrences?: number;
  status?: string;
  generated_by?: string;
  generation_model?: string | null;
  generation_provider?: string | null;
}

// Convert store component to DB insert format
function toDbFormat(component: ExtractedComponent, userId: string): ComponentInsert {
  return {
    user_id: userId,
    screen_id: component.sourceScreenIds?.[0] || null,
    source_screen_name: component.sourceScreen || null,
    name: component.name,
    category: component.category,
    description: component.description || null,
    tags: component.tags || [],
    html: component.html,
    css: component.css || null,
    variants: component.variants || [],
    props: component.props || [],
    occurrences: component.occurrences || 1,
    status: component.status || 'pending',
    generated_by: component.generatedBy || 'llm',
  };
}

// Convert DB row to store component format
function fromDbFormat(row: DbExtractedComponent): ExtractedComponent {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    description: row.description || '',
    sourceScreen: row.source_screen_name || 'unknown',
    sourceScreenIds: row.screen_id ? [row.screen_id] : [],
    extractedAt: row.created_at,
    tags: row.tags || [],
    html: row.html,
    css: row.css || '',
    occurrences: row.occurrences || 1,
    variants: Array.isArray(row.variants) ? row.variants as ExtractedComponent['variants'] : [],
    props: Array.isArray(row.props) ? row.props as string[] : [],
    generatedBy: (row.generated_by as 'llm' | 'dom-parser') || 'llm',
    status: (row.status as ComponentStatus) || 'pending',
    approvedAt: row.approved_at || undefined,
    approvedBy: row.approved_by || undefined,
  };
}

/**
 * Fetch all components for the current user
 */
export async function fetchComponents(): Promise<ExtractedComponent[]> {
  if (!isSupabaseConfigured()) {
    console.warn('[ComponentsPersistence] Supabase not configured');
    return [];
  }

  const user = useAuthStore.getState().supabaseUser;
  if (!user) {
    console.warn('[ComponentsPersistence] No authenticated user');
    return [];
  }

  const { data, error } = await supabase
    .from('extracted_components')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[ComponentsPersistence] Error fetching components:', error);
    throw error;
  }

  return (data || []).map(fromDbFormat);
}

/**
 * Save multiple components (batch insert)
 * Returns the saved components with their database IDs
 */
export async function saveComponents(
  components: ExtractedComponent[],
  options?: {
    extractionSessionId?: string;
    generationModel?: string;
    generationProvider?: string;
  }
): Promise<ExtractedComponent[]> {
  if (!isSupabaseConfigured()) {
    console.warn('[ComponentsPersistence] Supabase not configured');
    return components;
  }

  const user = useAuthStore.getState().supabaseUser;
  if (!user) {
    console.warn('[ComponentsPersistence] No authenticated user');
    return components;
  }

  const inserts: ComponentInsert[] = components.map((c) => ({
    ...toDbFormat(c, user.id),
    extraction_session_id: options?.extractionSessionId || null,
    generation_model: options?.generationModel || null,
    generation_provider: options?.generationProvider || null,
  }));

  const { data, error } = await supabase
    .from('extracted_components')
    .insert(inserts)
    .select();

  if (error) {
    console.error('[ComponentsPersistence] Error saving components:', error);
    throw error;
  }

  console.log(`[ComponentsPersistence] Saved ${data?.length || 0} components`);
  return (data || []).map(fromDbFormat);
}

/**
 * Update a single component
 */
export async function updateComponent(
  id: string,
  updates: Partial<ExtractedComponent>
): Promise<ExtractedComponent | null> {
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
  if (updates.description !== undefined) dbUpdates.description = updates.description;
  if (updates.tags !== undefined) dbUpdates.tags = updates.tags;
  if (updates.html !== undefined) dbUpdates.html = updates.html;
  if (updates.css !== undefined) dbUpdates.css = updates.css;
  if (updates.variants !== undefined) dbUpdates.variants = updates.variants;
  if (updates.props !== undefined) dbUpdates.props = updates.props;
  if (updates.occurrences !== undefined) dbUpdates.occurrences = updates.occurrences;
  if (updates.status !== undefined) {
    dbUpdates.status = updates.status;
    if (updates.status === 'approved') {
      dbUpdates.approved_at = new Date().toISOString();
      dbUpdates.approved_by = user.id;
    }
  }

  const { data, error } = await supabase
    .from('extracted_components')
    .update(dbUpdates)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single();

  if (error) {
    console.error('[ComponentsPersistence] Error updating component:', error);
    throw error;
  }

  return data ? fromDbFormat(data) : null;
}

/**
 * Update status for multiple components (batch update)
 */
export async function updateComponentsStatus(
  ids: string[],
  status: ComponentStatus
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
    .from('extracted_components')
    .update(updates)
    .in('id', ids)
    .eq('user_id', user.id);

  if (error) {
    console.error('[ComponentsPersistence] Error batch updating status:', error);
    throw error;
  }

  console.log(`[ComponentsPersistence] Updated status to "${status}" for ${ids.length} components`);
}

// Check if a string is a valid UUID format
function isValidUUID(id: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
}

/**
 * Delete multiple components
 * Note: Only attempts to delete from Supabase for valid UUID IDs.
 * Legacy IDs (comp_xxx format) are only in localStorage and will be
 * removed from local state by the store.
 */
export async function deleteComponents(ids: string[]): Promise<void> {
  if (!isSupabaseConfigured() || ids.length === 0) {
    return;
  }

  const user = useAuthStore.getState().supabaseUser;
  if (!user) {
    return;
  }

  // Filter to only valid UUIDs - legacy IDs (comp_xxx) don't exist in Supabase
  const validUUIDs = ids.filter(isValidUUID);
  const legacyIds = ids.filter(id => !isValidUUID(id));

  if (legacyIds.length > 0) {
    console.log(`[ComponentsPersistence] Skipping ${legacyIds.length} legacy IDs (not in Supabase)`);
  }

  if (validUUIDs.length === 0) {
    console.log('[ComponentsPersistence] No valid UUIDs to delete from Supabase');
    return;
  }

  const { error } = await supabase
    .from('extracted_components')
    .delete()
    .in('id', validUUIDs)
    .eq('user_id', user.id);

  if (error) {
    console.error('[ComponentsPersistence] Error deleting components:', error);
    throw error;
  }

  console.log(`[ComponentsPersistence] Deleted ${validUUIDs.length} components from Supabase`);
}

/**
 * Clear all components for the current user
 */
export async function clearAllComponents(): Promise<void> {
  if (!isSupabaseConfigured()) {
    return;
  }

  const user = useAuthStore.getState().supabaseUser;
  if (!user) {
    return;
  }

  const { error } = await supabase
    .from('extracted_components')
    .delete()
    .eq('user_id', user.id);

  if (error) {
    console.error('[ComponentsPersistence] Error clearing components:', error);
    throw error;
  }

  console.log('[ComponentsPersistence] Cleared all components');
}

/**
 * Get component count by status
 */
export async function getComponentStats(): Promise<{
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  needsFix: number;
}> {
  if (!isSupabaseConfigured()) {
    return { total: 0, pending: 0, approved: 0, rejected: 0, needsFix: 0 };
  }

  const user = useAuthStore.getState().supabaseUser;
  if (!user) {
    return { total: 0, pending: 0, approved: 0, rejected: 0, needsFix: 0 };
  }

  const { data, error } = await supabase
    .from('extracted_components')
    .select('status')
    .eq('user_id', user.id);

  if (error) {
    console.error('[ComponentsPersistence] Error getting stats:', error);
    return { total: 0, pending: 0, approved: 0, rejected: 0, needsFix: 0 };
  }

  const stats = {
    total: data?.length || 0,
    pending: 0,
    approved: 0,
    rejected: 0,
    needsFix: 0,
  };

  data?.forEach((row) => {
    switch (row.status) {
      case 'pending':
        stats.pending++;
        break;
      case 'approved':
        stats.approved++;
        break;
      case 'rejected':
        stats.rejected++;
        break;
      case 'needs-fix':
        stats.needsFix++;
        break;
    }
  });

  return stats;
}
