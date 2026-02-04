/**
 * Sharing Service
 * Manages share links for vibe prototypes
 */

import { supabase, supabasePublic, isSupabaseConfigured } from './supabase';

// Types
export type ShareType = 'specific' | 'random';

export interface ShareConfig {
  sessionId: string;
  shareType: ShareType;
  variantIndex?: number; // Required for 'specific' type
  expiresInDays?: number; // null = never expires
  shareWireframes?: boolean; // When true, share wireframes instead of prototypes
}

export interface ShareLink {
  shareId: string;
  shareToken: string;
  shareUrl: string;
  shareType: ShareType;
  variantIndex?: number;
  expiresAt?: string;
  createdAt: string;
  shareWireframes?: boolean;
}

export interface ShareData {
  share: {
    id: string;
    type: ShareType;
    created_at: string;
    shareWireframes?: boolean;
  };
  session: {
    id: string;
    name: string;
    prompt: string;
  };
  variant: {
    index: number;
    html_url?: string;
    wireframe_url?: string;
    title: string;
    description: string;
  };
  // For wireframe shares, may include all variants
  variants?: Array<{
    index: number;
    wireframe_url: string;
    title: string;
    description: string;
  }>;
}

export interface ShareWithViews extends ShareLink {
  viewCount: number;
  isActive: boolean;
  shareWireframes: boolean;
}

/**
 * Create a share link for a vibe session
 */
export async function createShareLink(config: ShareConfig): Promise<ShareLink> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase not configured');
  }

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    throw new Error('Not authenticated');
  }

  // Validate config
  if (config.shareType === 'specific' && !config.variantIndex) {
    throw new Error('Variant index required for specific share type');
  }

  console.log('[SharingService] Creating share link:', config);

  // Call the database function to create the share
  const { data, error } = await supabase.rpc('create_share_link', {
    p_session_id: config.sessionId,
    p_share_type: config.shareType,
    p_variant_index: config.variantIndex || null,
    p_expires_in_days: config.expiresInDays || null,
    p_share_wireframes: config.shareWireframes || false,
  });

  if (error) {
    console.error('[SharingService] Error creating share:', error);
    throw new Error(error.message || 'Failed to create share link');
  }

  if (!data || data.length === 0) {
    throw new Error('Failed to create share link');
  }

  const result = data[0];
  const baseUrl = window.location.origin;
  const shareUrl = `${baseUrl}/share/${result.share_token}`;

  // Fetch the full share details
  const { data: shareDetails } = await supabase
    .from('vibe_shares')
    .select('*')
    .eq('id', result.share_id)
    .single();

  return {
    shareId: result.share_id,
    shareToken: result.share_token,
    shareUrl,
    shareType: config.shareType,
    variantIndex: config.variantIndex,
    expiresAt: shareDetails?.expires_at,
    createdAt: shareDetails?.created_at || new Date().toISOString(),
    shareWireframes: config.shareWireframes,
  };
}

/**
 * Get share data for public viewing (no auth required)
 */
export async function getShareData(token: string): Promise<ShareData | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  console.log('[SharingService] Fetching share data for token:', token);

  // Use public client for anonymous access (no auth required)
  // Try new parameter name first, fall back to old if needed
  let data, error;

  // First try with the new parameter name (from 20260210_wireframe_sharing.sql migration)
  ({ data, error } = await supabasePublic.rpc('get_share_data', {
    p_share_token: token,
  }));

  // If that fails with a parameter error, try the old parameter name (p_token)
  if (error && (error.message?.includes('parameter') || error.code === 'PGRST202')) {
    console.log('[SharingService] Trying with legacy parameter name...');
    ({ data, error } = await supabasePublic.rpc('get_share_data', {
      p_token: token,
    }));
  }

  console.log('[SharingService] RPC response:', { data, error });

  if (error) {
    console.error('[SharingService] Error fetching share:', error);
    return null;
  }

  // The RPC returns an array of rows - we need the first one
  if (!data || (Array.isArray(data) && data.length === 0)) {
    console.error('[SharingService] No share data found. Data:', data);
    return null;
  }

  // Transform flat row(s) into ShareData structure
  const rows = Array.isArray(data) ? data : [data];
  const firstRow = rows[0];

  // Build ShareData from the flat response
  const shareData: ShareData = {
    share: {
      id: firstRow.share_id,
      type: firstRow.share_type as ShareType,
      created_at: new Date().toISOString(), // Not returned by function, use current
      shareWireframes: firstRow.share_wireframes,
    },
    session: {
      id: firstRow.session_id,
      name: firstRow.screen_name || 'Shared Prototype',
      prompt: '', // Not returned by function
    },
    variant: {
      index: firstRow.variant_index,
      html_url: firstRow.html_url,
      wireframe_url: firstRow.wireframe_url,
      title: firstRow.title || `Variant ${String.fromCharCode(64 + firstRow.variant_index)}`,
      description: firstRow.description || '',
    },
  };

  // If sharing wireframes and multiple rows returned, include all variants
  if (firstRow.share_wireframes && rows.length > 1) {
    shareData.variants = rows.map(row => ({
      index: row.variant_index,
      wireframe_url: row.wireframe_url,
      title: row.title || `Variant ${String.fromCharCode(64 + row.variant_index)}`,
      description: row.description || '',
    }));
  }

  return shareData;
}

/**
 * Record a view for analytics
 */
export async function recordShareView(
  shareId: string,
  variantIndex: number,
  userAgent?: string
): Promise<void> {
  if (!isSupabaseConfigured()) {
    return;
  }

  // Hash the IP for privacy (we'll do this on the edge function for real IP)
  // For now, just use a placeholder
  const ipHash = 'anonymous';

  // Use public client for anonymous access (no auth required)
  await supabasePublic.from('vibe_share_views').insert({
    share_id: shareId,
    variant_index: variantIndex,
    viewer_ip_hash: ipHash,
    user_agent: userAgent || navigator.userAgent,
  });
}

/**
 * Get all shares for a session
 */
export async function getSharesForSession(sessionId: string): Promise<ShareWithViews[]> {
  if (!isSupabaseConfigured()) {
    return [];
  }

  const { data, error } = await supabase
    .from('vibe_shares')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[SharingService] Error fetching shares:', error);
    return [];
  }

  const baseUrl = window.location.origin;

  return (data || []).map((share) => ({
    shareId: share.id,
    shareToken: share.share_token,
    shareUrl: `${baseUrl}/share/${share.share_token}`,
    shareType: share.share_type as ShareType,
    variantIndex: share.variant_index,
    expiresAt: share.expires_at,
    createdAt: share.created_at,
    viewCount: share.view_count,
    isActive: share.is_active,
    shareWireframes: share.share_wireframes || false,
  }));
}

/**
 * Deactivate a share link
 */
export async function deactivateShare(shareId: string): Promise<boolean> {
  if (!isSupabaseConfigured()) {
    return false;
  }

  const { error } = await supabase
    .from('vibe_shares')
    .update({ is_active: false })
    .eq('id', shareId);

  if (error) {
    console.error('[SharingService] Error deactivating share:', error);
    return false;
  }

  return true;
}

/**
 * Get view analytics for a share
 */
export async function getShareAnalytics(shareId: string): Promise<{
  totalViews: number;
  viewsByVariant: Record<number, number>;
  recentViews: Array<{ viewedAt: string; variantIndex: number }>;
}> {
  if (!isSupabaseConfigured()) {
    return { totalViews: 0, viewsByVariant: {}, recentViews: [] };
  }

  const { data, error } = await supabase
    .from('vibe_share_views')
    .select('*')
    .eq('share_id', shareId)
    .order('viewed_at', { ascending: false })
    .limit(100);

  if (error) {
    console.error('[SharingService] Error fetching analytics:', error);
    return { totalViews: 0, viewsByVariant: {}, recentViews: [] };
  }

  const views = data || [];
  const viewsByVariant: Record<number, number> = {};

  views.forEach((view) => {
    viewsByVariant[view.variant_index] = (viewsByVariant[view.variant_index] || 0) + 1;
  });

  return {
    totalViews: views.length,
    viewsByVariant,
    recentViews: views.slice(0, 10).map((v) => ({
      viewedAt: v.viewed_at,
      variantIndex: v.variant_index,
    })),
  };
}
