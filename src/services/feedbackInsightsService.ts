/**
 * Feedback Insights Service
 * Aggregates comment, view, and visitor data for the Insights dashboard
 */

import { supabase, isSupabaseConfigured } from './supabase';

// Types
export interface Viewer {
  email: string;
  name: string;
  totalDuration?: number;
  viewCount?: number;
  lastSeen?: string;
}

export interface ProjectInsight {
  id: string;
  sessionId: string;
  name: string;
  creatorEmail: string;
  variants: number;
  participants: number;
  comments: number;
  totalTimeSpent: string;
  totalViews: number;
  status: 'draft' | 'shared' | 'expired';
  createdAt: string;
  viewers?: Viewer[];
}

export interface VariantInsight {
  variantIndex: number;
  label: string;
  title: string;
  description: string;
  sessions: number;
  participants: number;
  comments: number;
  resolvedComments: number;
  totalTimeSpent: string;
  avgTimeSpent: number;
  viewCount: number;
  sentimentScore: number | null;
  keyThemes: string[];
  summary: string | null;
  isTopPerformer: boolean;
  viewers: Viewer[];
  wireframeUrl: string | null;
  htmlUrl: string | null; // URL to generated variant HTML for iframe preview
  screenshotUrl: string | null; // URL to variant screenshot image
}

export interface FeedbackComment {
  id: string;
  userName: string;
  userEmail: string;
  content: string;
  createdAt: string;
  resolved: boolean;
  positionX: number | null;
  positionY: number | null;
  variantIndex: number | null;
  replyCount: number;
}

export interface VariantDetailInsight extends Omit<VariantInsight, 'comments'> {
  comments: FeedbackComment[];
  commentCount: number;
  feedbackSummary: string;
  participantsFunnel: {
    label: string;
    count: number;
    percent: number;
  }[];
}

// Helper function to format duration
function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

/**
 * Get all projects with insights for the current user
 */
export async function getProjectInsights(): Promise<ProjectInsight[]> {
  if (!isSupabaseConfigured()) {
    return [];
  }

  try {
    // Use the new RPC function for all project insights
    const { data, error } = await supabase.rpc('get_all_project_insights');

    if (error) {
      console.error('[FeedbackInsightsService] RPC error, falling back to manual query:', error);
      return await getProjectInsightsFallback();
    }

    if (!data || data.length === 0) {
      return [];
    }

    // Transform RPC results to ProjectInsight format
    return data.map((row: {
      session_id: string;
      session_name: string;
      variant_count: number;
      total_views: number;
      unique_visitors: number;
      total_time_spent: number;
      total_comments: number;
      status: string;
      created_at: string;
    }) => ({
      id: row.session_id,
      sessionId: row.session_id,
      name: row.session_name || 'Untitled Project',
      creatorEmail: '', // Not returned by RPC
      variants: row.variant_count || 0,
      participants: row.unique_visitors || 0,
      comments: row.total_comments || 0,
      totalTimeSpent: formatDuration(row.total_time_spent || 0),
      totalViews: row.total_views || 0,
      status: row.status as 'draft' | 'shared' | 'expired',
      createdAt: row.created_at,
    }));
  } catch (err) {
    console.error('[FeedbackInsightsService] Error fetching project insights:', err);
    return [];
  }
}

/**
 * Fallback method for getting project insights when RPC is not available
 */
async function getProjectInsightsFallback(): Promise<ProjectInsight[]> {
  // Get all sessions with their shares
  const { data: sessions, error } = await supabase
    .from('vibe_sessions')
    .select(`
      id,
      name,
      user_id,
      created_at,
      status
    `)
    .order('created_at', { ascending: false });

  if (error || !sessions) {
    console.error('[FeedbackInsightsService] Error fetching sessions:', error);
    return [];
  }

  // For each session, get share and view data
  const projectInsights = await Promise.all(
    sessions.map(async (session): Promise<ProjectInsight | null> => {
      // Get shares for this session
      const { data: shares } = await supabase
        .from('vibe_shares')
        .select('id, view_count, is_active')
        .eq('session_id', session.id);

      if (!shares || shares.length === 0) {
        return null; // Skip sessions without shares
      }

      const shareIds = shares.map((s) => s.id);
      const totalViews = shares.reduce((sum, s) => sum + (s.view_count || 0), 0);

      // Get view data for time spent and unique visitors
      const { data: views } = await supabase
        .from('vibe_share_views')
        .select('viewer_email, viewer_name, session_duration')
        .in('share_id', shareIds);

      const uniqueViewers = new Set<string>();
      let totalTimeSpent = 0;

      (views || []).forEach((v) => {
        if (v.viewer_email) uniqueViewers.add(v.viewer_email);
        totalTimeSpent += v.session_duration || 0;
      });

      // Get comment counts
      const { data: comments } = await supabase
        .from('share_comments')
        .select('user_email')
        .in('share_id', shareIds);

      const uniqueCommenters = new Set<string>();
      (comments || []).forEach((c) => uniqueCommenters.add(c.user_email));

      // Get variant count
      const { count: variantCount } = await supabase
        .from('vibe_variants')
        .select('*', { count: 'exact', head: true })
        .eq('session_id', session.id);

      // Determine status
      const hasActiveShare = shares.some((s) => s.is_active);
      const status: 'draft' | 'shared' | 'expired' = hasActiveShare
        ? 'shared'
        : 'expired';

      return {
        id: session.id,
        sessionId: session.id,
        name: session.name || 'Untitled Project',
        creatorEmail: session.user_id,
        variants: variantCount || 0,
        participants: Math.max(uniqueViewers.size, uniqueCommenters.size),
        comments: comments?.length || 0,
        totalTimeSpent: formatDuration(totalTimeSpent),
        totalViews,
        status,
        createdAt: session.created_at,
      };
    })
  );

  // Filter out null entries (sessions without shares)
  return projectInsights.filter((p): p is ProjectInsight => p !== null);
}

/**
 * Get detailed insights for a specific session/project
 */
export async function getSessionInsight(sessionId: string): Promise<{
  project: ProjectInsight;
  viewers: Viewer[];
} | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  try {
    const { data, error } = await supabase.rpc('get_session_insights', {
      p_session_id: sessionId,
    });

    if (error || !data || data.length === 0) {
      console.error('[FeedbackInsightsService] Error fetching session insight:', error);
      return null;
    }

    const row = data[0];
    const viewers: Viewer[] = (row.viewers || []).map((v: { email: string; name: string; totalDuration?: number; viewCount?: number; lastSeen?: string }) => ({
      email: v.email,
      name: v.name,
      totalDuration: v.totalDuration || 0,
      viewCount: v.viewCount || 0,
      lastSeen: v.lastSeen,
    }));

    return {
      project: {
        id: row.session_id,
        sessionId: row.session_id,
        name: row.session_name || 'Untitled Project',
        creatorEmail: '',
        variants: row.variant_count || 0,
        participants: row.unique_visitors || 0,
        comments: row.total_comments || 0,
        totalTimeSpent: formatDuration(row.total_time_spent || 0),
        totalViews: row.total_views || 0,
        status: row.status as 'draft' | 'shared' | 'expired',
        createdAt: row.created_at,
        viewers,
      },
      viewers,
    };
  } catch (err) {
    console.error('[FeedbackInsightsService] Error fetching session insight:', err);
    return null;
  }
}

/**
 * Get variant insights for a specific session/project
 */
export async function getVariantInsights(sessionId: string): Promise<VariantInsight[]> {
  if (!isSupabaseConfigured()) {
    return [];
  }

  try {
    // Try using the RPC function first
    const { data, error } = await supabase.rpc('get_variant_insights', {
      p_session_id: sessionId,
    });

    if (error) {
      console.error('[FeedbackInsightsService] RPC error, falling back:', error);
      return await getVariantInsightsFallback(sessionId);
    }

    if (!data || data.length === 0) {
      return await getVariantInsightsFallback(sessionId);
    }

    // Transform RPC results
    const variantInsights: VariantInsight[] = data.map((row: {
      variant_index: number;
      variant_label: string;
      title: string;
      description: string;
      total_views: number;
      unique_visitors: number;
      total_time_spent: number;
      avg_session_duration: number;
      total_comments: number;
      resolved_comments: number;
      viewers: Viewer[];
    }) => ({
      variantIndex: row.variant_index,
      label: row.variant_label,
      title: row.title || row.variant_label,
      description: row.description || '',
      sessions: row.total_views || 0,
      participants: row.unique_visitors || 0,
      comments: row.total_comments || 0,
      resolvedComments: row.resolved_comments || 0,
      totalTimeSpent: formatDuration(row.total_time_spent || 0),
      avgTimeSpent: row.avg_session_duration || 0,
      viewCount: row.total_views || 0,
      sentimentScore: null,
      keyThemes: [],
      summary: null,
      isTopPerformer: false,
      viewers: (row.viewers || []).map((v: { email: string; name: string; duration?: number; viewedAt?: string }) => ({
        email: v.email,
        name: v.name,
        totalDuration: v.duration || 0,
        lastSeen: v.viewedAt,
      })),
      wireframeUrl: null, // RPC doesn't return this, will be fetched separately if needed
      htmlUrl: null, // RPC doesn't return this, will be fetched separately if needed
      screenshotUrl: null, // RPC doesn't return this, will be fetched separately if needed
    }));

    // Mark top performer
    if (variantInsights.length > 0) {
      const topPerformer = variantInsights.reduce((best, current) =>
        current.viewCount > best.viewCount ? current : best
      );
      const topIdx = variantInsights.findIndex((v) => v.variantIndex === topPerformer.variantIndex);
      if (topIdx >= 0) {
        variantInsights[topIdx].isTopPerformer = true;
      }
    }

    return variantInsights;
  } catch (err) {
    console.error('[FeedbackInsightsService] Error fetching variant insights:', err);
    return [];
  }
}

/**
 * Fallback method for getting variant insights
 */
async function getVariantInsightsFallback(sessionId: string): Promise<VariantInsight[]> {
  // Get variants with their plans and wireframe URLs (wireframe_url is on vibe_variant_plans)
  const { data: variants, error } = await supabase
    .from('vibe_variants')
    .select(`
      id,
      variant_index,
      session_id,
      html_url,
      screenshot_url,
      vibe_variant_plans (
        title,
        description,
        wireframe_url
      )
    `)
    .eq('session_id', sessionId)
    .order('variant_index');

  if (error || !variants) {
    console.error('[FeedbackInsightsService] Error fetching variants:', error);
    return [];
  }

  // Get shares for this session
  const { data: shares } = await supabase
    .from('vibe_shares')
    .select('id, variant_index, view_count')
    .eq('session_id', sessionId);

  const shareIds = shares?.map((s) => s.id) || [];

  // Get view data
  const { data: views } = shareIds.length > 0
    ? await supabase
        .from('vibe_share_views')
        .select('variant_index, viewer_email, viewer_name, session_duration')
        .in('share_id', shareIds)
    : { data: [] };

  // Get comments
  const { data: comments } = shareIds.length > 0
    ? await supabase
        .from('share_comments')
        .select('variant_index, user_email, resolved')
        .in('share_id', shareIds)
    : { data: [] };

  // Build variant insights
  const variantInsights: VariantInsight[] = (variants || []).map((variant) => {
    const variantWithPlan = variant as unknown as {
      vibe_variant_plans: { title: string; description: string; wireframe_url: string | null } | null;
      html_url: string | null;
      screenshot_url: string | null;
    };
    const plan = variantWithPlan.vibe_variant_plans;
    const wireframeUrl = plan?.wireframe_url || null;
    const htmlUrl = variantWithPlan.html_url || null;
    const screenshotUrl = variantWithPlan.screenshot_url || null;
    const variantIndex = variant.variant_index;
    const label = `Variant ${String.fromCharCode(64 + variantIndex)}`;

    // Get views for this variant
    const variantViews = views?.filter((v) => v.variant_index === variantIndex) || [];
    const viewCount = variantViews.length;
    const totalTimeSpent = variantViews.reduce((sum, v) => sum + (v.session_duration || 0), 0);
    const avgTimeSpent = viewCount > 0 ? Math.round(totalTimeSpent / viewCount) : 0;

    // Get unique viewers
    const viewers: Viewer[] = [];
    const seenEmails = new Set<string>();
    variantViews.forEach((v) => {
      if (v.viewer_email && !seenEmails.has(v.viewer_email)) {
        seenEmails.add(v.viewer_email);
        viewers.push({
          email: v.viewer_email,
          name: v.viewer_name || 'Anonymous',
          totalDuration: v.session_duration || 0,
        });
      }
    });

    // Get comments for this variant
    const variantComments = comments?.filter(
      (c) => c.variant_index === variantIndex || c.variant_index === null
    ) || [];
    const uniqueCommenters = new Set(variantComments.map((c) => c.user_email));
    const resolvedComments = variantComments.filter((c) => c.resolved).length;

    return {
      variantIndex,
      label,
      title: plan?.title || label,
      description: plan?.description || '',
      sessions: viewCount,
      participants: Math.max(seenEmails.size, uniqueCommenters.size),
      comments: variantComments.length,
      resolvedComments,
      totalTimeSpent: formatDuration(totalTimeSpent),
      avgTimeSpent,
      viewCount,
      sentimentScore: null,
      keyThemes: [],
      summary: null,
      isTopPerformer: false,
      viewers,
      wireframeUrl,
      htmlUrl,
      screenshotUrl,
    };
  });

  // Mark top performer
  if (variantInsights.length > 0) {
    const topPerformer = variantInsights.reduce((best, current) =>
      current.viewCount > best.viewCount ? current : best
    );
    const topIdx = variantInsights.findIndex((v) => v.variantIndex === topPerformer.variantIndex);
    if (topIdx >= 0) {
      variantInsights[topIdx].isTopPerformer = true;
    }
  }

  return variantInsights;
}

/**
 * Get detailed insights for a specific variant including all comments
 */
export async function getVariantDetailInsight(
  sessionId: string,
  variantIndex: number
): Promise<VariantDetailInsight | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  try {
    // Try RPC first
    const { data: rpcData, error: rpcError } = await supabase.rpc('get_variant_insights', {
      p_session_id: sessionId,
    });

    let variantInsight: VariantInsight | undefined;
    let comments: FeedbackComment[] = [];

    if (!rpcError && rpcData && rpcData.length > 0) {
      // Find the specific variant from RPC results
      const row = rpcData.find((r: { variant_index: number }) => r.variant_index === variantIndex);
      if (row) {
        // Fetch wireframe URL from vibe_variant_plans (where it's stored by wireframeService)
        let wireframeUrl: string | null = null;
        let htmlUrl: string | null = null;

        const { data: planData } = await supabase
          .from('vibe_variant_plans')
          .select('wireframe_url')
          .eq('session_id', sessionId)
          .eq('variant_index', variantIndex)
          .single();
        if (planData) {
          wireframeUrl = planData.wireframe_url;
        }

        // Fetch html_url and screenshot_url from vibe_variants
        const { data: variantData } = await supabase
          .from('vibe_variants')
          .select('html_url, screenshot_url')
          .eq('session_id', sessionId)
          .eq('variant_index', variantIndex)
          .single();
        if (variantData) {
          htmlUrl = variantData.html_url;
        }
        const screenshotUrl = variantData?.screenshot_url || null;

        variantInsight = {
          variantIndex: row.variant_index,
          label: row.variant_label,
          title: row.title || row.variant_label,
          description: row.description || '',
          sessions: row.total_views || 0,
          participants: row.unique_visitors || 0,
          comments: row.total_comments || 0,
          resolvedComments: row.resolved_comments || 0,
          totalTimeSpent: formatDuration(row.total_time_spent || 0),
          avgTimeSpent: row.avg_session_duration || 0,
          viewCount: row.total_views || 0,
          sentimentScore: null,
          keyThemes: [],
          summary: null,
          isTopPerformer: false,
          viewers: (row.viewers || []).map((v: { email: string; name: string; duration?: number }) => ({
            email: v.email,
            name: v.name,
            totalDuration: v.duration || 0,
          })),
          wireframeUrl,
          htmlUrl,
          screenshotUrl,
        };

        // Extract comments from RPC result
        comments = (row.comments || []).map((c: {
          id: string;
          userName: string;
          userEmail: string;
          content: string;
          createdAt: string;
          resolved: boolean;
          positionX: number | null;
          positionY: number | null;
        }) => ({
          id: c.id,
          userName: c.userName,
          userEmail: c.userEmail,
          content: c.content,
          createdAt: c.createdAt,
          resolved: c.resolved,
          positionX: c.positionX,
          positionY: c.positionY,
          variantIndex,
          replyCount: 0,
        }));
      }
    }

    // If RPC didn't work, use fallback
    if (!variantInsight) {
      const fallbackInsights = await getVariantInsightsFallback(sessionId);
      variantInsight = fallbackInsights.find((v) => v.variantIndex === variantIndex);

      if (!variantInsight) {
        return null;
      }
    }

    // Always fetch comments directly for reliability (RPC JSON parsing can be unreliable)
    const { data: shares } = await supabase
      .from('vibe_shares')
      .select('id')
      .eq('session_id', sessionId);

    const shareIds = shares?.map((s) => s.id) || [];
    console.log('[FeedbackInsights] Fetching comments for shares:', shareIds);

    if (shareIds.length > 0) {
      const { data: commentsData, error: commentsError } = await supabase
        .from('share_comments')
        .select('*')
        .in('share_id', shareIds)
        .is('parent_id', null)
        .order('created_at', { ascending: false });

      if (commentsError) {
        console.error('[FeedbackInsights] Error fetching comments:', commentsError);
      } else {
        console.log('[FeedbackInsights] Fetched comments:', commentsData?.length || 0);
        // Filter for this variant (or null which means applies to all)
        const filteredComments = (commentsData || []).filter(
          (c) => c.variant_index === variantIndex || c.variant_index === null
        );

        comments = filteredComments.map((c) => ({
          id: c.id,
          userName: c.user_name,
          userEmail: c.user_email,
          content: c.content,
          createdAt: c.created_at,
          resolved: c.resolved,
          positionX: c.position_x,
          positionY: c.position_y,
          variantIndex: c.variant_index,
          replyCount: 0,
        }));
      }
    }

    // Generate feedback summary
    const feedbackSummary = generateFeedbackSummary(comments);

    // Build participants funnel
    const participantsFunnel = [
      { label: 'Viewed', count: variantInsight.viewCount, percent: 100 },
      {
        label: 'Engaged (>10s)',
        count: Math.round(variantInsight.viewCount * 0.65),
        percent: 65,
      },
      {
        label: 'Commented',
        count: variantInsight.participants,
        percent: variantInsight.viewCount > 0
          ? Math.round((variantInsight.participants / variantInsight.viewCount) * 100)
          : 0,
      },
      {
        label: 'Resolved feedback',
        count: variantInsight.resolvedComments,
        percent: variantInsight.comments > 0
          ? Math.round((variantInsight.resolvedComments / variantInsight.comments) * 100)
          : 0,
      },
    ];

    return {
      ...variantInsight,
      comments,
      commentCount: comments.length,
      feedbackSummary,
      participantsFunnel,
    };
  } catch (err) {
    console.error('[FeedbackInsightsService] Error fetching variant detail:', err);
    return null;
  }
}

/**
 * Get feedback insights for a session (for the sharing service integration)
 */
export async function getSessionFeedbackInsights(sessionId: string): Promise<{
  totalComments: number;
  resolvedComments: number;
  uniqueParticipants: number;
  sentimentScore: number | null;
  summary: string | null;
}> {
  if (!isSupabaseConfigured()) {
    return {
      totalComments: 0,
      resolvedComments: 0,
      uniqueParticipants: 0,
      sentimentScore: null,
      summary: null,
    };
  }

  const { data, error } = await supabase.rpc('get_session_feedback_insights', {
    p_session_id: sessionId,
  });

  if (error || !data || data.length === 0) {
    return {
      totalComments: 0,
      resolvedComments: 0,
      uniqueParticipants: 0,
      sentimentScore: null,
      summary: null,
    };
  }

  // Aggregate across all shares
  const aggregated = data.reduce(
    (acc: {
      totalComments: number;
      resolvedComments: number;
      uniqueCommenters: Set<number>;
    }, row: {
      total_comments: number;
      resolved_comments: number;
      unique_commenters: number;
      sentiment_score: number | null;
      summary: string | null;
    }) => {
      acc.totalComments += row.total_comments;
      acc.resolvedComments += row.resolved_comments;
      acc.uniqueCommenters.add(row.unique_commenters);
      return acc;
    },
    { totalComments: 0, resolvedComments: 0, uniqueCommenters: new Set() }
  );

  const latestWithSummary = data.find((d: { summary: string | null }) => d.summary);

  return {
    totalComments: aggregated.totalComments,
    resolvedComments: aggregated.resolvedComments,
    uniqueParticipants: aggregated.uniqueCommenters.size,
    sentimentScore: latestWithSummary?.sentiment_score || null,
    summary: latestWithSummary?.summary || null,
  };
}

// Helper function to generate a basic feedback summary (placeholder for AI)
function generateFeedbackSummary(comments: FeedbackComment[]): string {
  if (comments.length === 0) {
    return 'No feedback received yet.';
  }

  const resolvedCount = comments.filter((c) => c.resolved).length;
  const pinCount = comments.filter((c) => c.positionX !== null).length;

  const parts = [
    `Received ${comments.length} comment${comments.length === 1 ? '' : 's'} from reviewers.`,
  ];

  if (resolvedCount > 0) {
    parts.push(`${resolvedCount} item${resolvedCount === 1 ? '' : 's'} resolved.`);
  }

  if (pinCount > 0) {
    parts.push(`${pinCount} pin-based comment${pinCount === 1 ? '' : 's'} on specific UI elements.`);
  }

  return parts.join(' ');
}

// AI Summary types
export interface FeedbackSummaryAI {
  summary: string;
  keyThemes: string[];
  actionItems: string[];
  sentimentScore: number;
}

/**
 * Generate an AI-powered summary of feedback comments
 */
export async function generateAISummary(
  sessionId: string,
  variantIndex: number,
  comments: FeedbackComment[],
  variantTitle?: string,
  variantDescription?: string
): Promise<FeedbackSummaryAI | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  if (comments.length === 0) {
    return null;
  }

  try {
    // Get auth session for the request
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      console.error('[FeedbackInsightsService] No auth session for AI summary');
      return null;
    }

    // Prepare comments for the edge function
    const preparedComments = comments.map((c) => ({
      content: c.content,
      userName: c.userName,
      resolved: c.resolved,
      isPinned: c.positionX !== null && c.positionY !== null,
    }));

    // Call the edge function
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/summarize-feedback`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          sessionId,
          variantIndex,
          comments: preparedComments,
          variantTitle,
          variantDescription,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      console.error('[FeedbackInsightsService] AI summary error:', error);
      return null;
    }

    const result = await response.json();

    if (!result.success) {
      console.error('[FeedbackInsightsService] AI summary failed:', result.error);
      return null;
    }

    return {
      summary: result.summary,
      keyThemes: result.keyThemes || [],
      actionItems: result.actionItems || [],
      sentimentScore: result.sentimentScore || 0,
    };
  } catch (err) {
    console.error('[FeedbackInsightsService] Error generating AI summary:', err);
    return null;
  }
}
