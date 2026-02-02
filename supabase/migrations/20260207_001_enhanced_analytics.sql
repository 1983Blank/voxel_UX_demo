-- Migration: Enhanced analytics with visitor info and session tracking
-- Date: 2026-02-07

-- ============================================================================
-- ENHANCE VIBE_SHARE_VIEWS TABLE
-- ============================================================================
-- Add columns for visitor identification and session tracking

ALTER TABLE vibe_share_views
  ADD COLUMN IF NOT EXISTS viewer_email TEXT,
  ADD COLUMN IF NOT EXISTS viewer_name TEXT,
  ADD COLUMN IF NOT EXISTS session_duration INTEGER DEFAULT 0,  -- Duration in seconds
  ADD COLUMN IF NOT EXISTS session_id TEXT;  -- Unique session identifier

-- Index for looking up viewers by email
CREATE INDEX IF NOT EXISTS idx_vibe_share_views_email ON vibe_share_views(viewer_email) WHERE viewer_email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vibe_share_views_session ON vibe_share_views(session_id) WHERE session_id IS NOT NULL;

-- ============================================================================
-- FUNCTION: Record enhanced view with session tracking
-- ============================================================================

CREATE OR REPLACE FUNCTION record_share_view_enhanced(
  p_share_id UUID,
  p_variant_index INTEGER,
  p_viewer_email TEXT DEFAULT NULL,
  p_viewer_name TEXT DEFAULT NULL,
  p_session_id TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_view_id UUID;
  v_ip_hash TEXT := 'anonymous';
BEGIN
  -- Insert the view record
  INSERT INTO vibe_share_views (
    share_id, variant_index, viewer_email, viewer_name,
    session_id, viewer_ip_hash, user_agent
  )
  VALUES (
    p_share_id, p_variant_index, p_viewer_email, p_viewer_name,
    p_session_id, v_ip_hash, p_user_agent
  )
  RETURNING id INTO v_view_id;

  -- Update the view count on the share
  UPDATE vibe_shares
  SET view_count = view_count + 1
  WHERE id = p_share_id;

  RETURN v_view_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- FUNCTION: Update session duration
-- ============================================================================

CREATE OR REPLACE FUNCTION update_view_session_duration(
  p_view_id UUID,
  p_duration INTEGER
)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE vibe_share_views
  SET session_duration = p_duration
  WHERE id = p_view_id;

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- FUNCTION: Get comprehensive share analytics
-- ============================================================================

CREATE OR REPLACE FUNCTION get_share_analytics_enhanced(p_share_id UUID)
RETURNS TABLE (
  total_views BIGINT,
  unique_visitors BIGINT,
  total_time_spent BIGINT,
  avg_session_duration INTEGER,
  viewers JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT AS total_views,
    COUNT(DISTINCT COALESCE(viewer_email, viewer_ip_hash))::BIGINT AS unique_visitors,
    COALESCE(SUM(session_duration), 0)::BIGINT AS total_time_spent,
    COALESCE(AVG(session_duration)::INTEGER, 0) AS avg_session_duration,
    COALESCE(
      jsonb_agg(
        DISTINCT jsonb_build_object(
          'email', viewer_email,
          'name', viewer_name,
          'viewCount', 1,
          'lastSeen', viewed_at
        )
      ) FILTER (WHERE viewer_email IS NOT NULL),
      '[]'::JSONB
    ) AS viewers
  FROM vibe_share_views
  WHERE share_id = p_share_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- FUNCTION: Get session insights with real data
-- ============================================================================

CREATE OR REPLACE FUNCTION get_session_insights(p_session_id UUID)
RETURNS TABLE (
  session_id UUID,
  session_name TEXT,
  total_shares BIGINT,
  total_views BIGINT,
  unique_visitors BIGINT,
  total_time_spent BIGINT,
  total_comments BIGINT,
  resolved_comments BIGINT,
  variant_count BIGINT,
  status TEXT,
  created_at TIMESTAMPTZ,
  viewers JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id AS session_id,
    s.name AS session_name,
    COUNT(DISTINCT vs.id)::BIGINT AS total_shares,
    COALESCE(SUM(vs.view_count), 0)::BIGINT AS total_views,
    (
      SELECT COUNT(DISTINCT COALESCE(v.viewer_email, v.viewer_ip_hash))
      FROM vibe_share_views v
      INNER JOIN vibe_shares sh ON sh.id = v.share_id
      WHERE sh.session_id = s.id
    )::BIGINT AS unique_visitors,
    (
      SELECT COALESCE(SUM(v.session_duration), 0)
      FROM vibe_share_views v
      INNER JOIN vibe_shares sh ON sh.id = v.share_id
      WHERE sh.session_id = s.id
    )::BIGINT AS total_time_spent,
    (
      SELECT COUNT(*)
      FROM share_comments c
      INNER JOIN vibe_shares sh ON sh.id = c.share_id
      WHERE sh.session_id = s.id
    )::BIGINT AS total_comments,
    (
      SELECT COUNT(*)
      FROM share_comments c
      INNER JOIN vibe_shares sh ON sh.id = c.share_id
      WHERE sh.session_id = s.id AND c.resolved = true
    )::BIGINT AS resolved_comments,
    (
      SELECT COUNT(DISTINCT vv.variant_index)
      FROM vibe_variants vv
      WHERE vv.session_id = s.id
    )::BIGINT AS variant_count,
    CASE
      WHEN EXISTS (SELECT 1 FROM vibe_shares WHERE session_id = s.id AND is_active = true) THEN 'shared'
      WHEN EXISTS (SELECT 1 FROM vibe_shares WHERE session_id = s.id) THEN 'expired'
      ELSE 'draft'
    END AS status,
    s.created_at,
    (
      SELECT COALESCE(
        jsonb_agg(
          DISTINCT jsonb_build_object(
            'email', v.viewer_email,
            'name', v.viewer_name,
            'totalDuration', (
              SELECT SUM(v2.session_duration)
              FROM vibe_share_views v2
              INNER JOIN vibe_shares sh2 ON sh2.id = v2.share_id
              WHERE sh2.session_id = s.id AND v2.viewer_email = v.viewer_email
            ),
            'viewCount', (
              SELECT COUNT(*)
              FROM vibe_share_views v2
              INNER JOIN vibe_shares sh2 ON sh2.id = v2.share_id
              WHERE sh2.session_id = s.id AND v2.viewer_email = v.viewer_email
            ),
            'lastSeen', (
              SELECT MAX(v2.viewed_at)
              FROM vibe_share_views v2
              INNER JOIN vibe_shares sh2 ON sh2.id = v2.share_id
              WHERE sh2.session_id = s.id AND v2.viewer_email = v.viewer_email
            )
          )
        ) FILTER (WHERE v.viewer_email IS NOT NULL),
        '[]'::JSONB
      )
      FROM vibe_share_views v
      INNER JOIN vibe_shares sh ON sh.id = v.share_id
      WHERE sh.session_id = s.id
    ) AS viewers
  FROM vibe_sessions s
  LEFT JOIN vibe_shares vs ON vs.session_id = s.id
  WHERE s.id = p_session_id
    AND s.user_id = auth.uid()
  GROUP BY s.id, s.name, s.created_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- FUNCTION: Get variant-level insights
-- ============================================================================

CREATE OR REPLACE FUNCTION get_variant_insights(p_session_id UUID)
RETURNS TABLE (
  variant_index INTEGER,
  variant_label TEXT,
  title TEXT,
  description TEXT,
  total_views BIGINT,
  unique_visitors BIGINT,
  total_time_spent BIGINT,
  avg_session_duration INTEGER,
  total_comments BIGINT,
  resolved_comments BIGINT,
  viewers JSONB,
  comments JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    vv.variant_index,
    'Variant ' || CHR(64 + vv.variant_index) AS variant_label,
    COALESCE(vvp.title, 'Variant ' || CHR(64 + vv.variant_index)) AS title,
    COALESCE(vvp.description, '') AS description,
    COALESCE((
      SELECT COUNT(*)
      FROM vibe_share_views v
      INNER JOIN vibe_shares vs ON vs.id = v.share_id
      WHERE vs.session_id = p_session_id AND v.variant_index = vv.variant_index
    ), 0)::BIGINT AS total_views,
    COALESCE((
      SELECT COUNT(DISTINCT COALESCE(v.viewer_email, v.viewer_ip_hash))
      FROM vibe_share_views v
      INNER JOIN vibe_shares vs ON vs.id = v.share_id
      WHERE vs.session_id = p_session_id AND v.variant_index = vv.variant_index
    ), 0)::BIGINT AS unique_visitors,
    COALESCE((
      SELECT SUM(v.session_duration)
      FROM vibe_share_views v
      INNER JOIN vibe_shares vs ON vs.id = v.share_id
      WHERE vs.session_id = p_session_id AND v.variant_index = vv.variant_index
    ), 0)::BIGINT AS total_time_spent,
    COALESCE((
      SELECT AVG(v.session_duration)::INTEGER
      FROM vibe_share_views v
      INNER JOIN vibe_shares vs ON vs.id = v.share_id
      WHERE vs.session_id = p_session_id AND v.variant_index = vv.variant_index
    ), 0) AS avg_session_duration,
    COALESCE((
      SELECT COUNT(*)
      FROM share_comments c
      INNER JOIN vibe_shares vs ON vs.id = c.share_id
      WHERE vs.session_id = p_session_id
        AND (c.variant_index = vv.variant_index OR c.variant_index IS NULL)
    ), 0)::BIGINT AS total_comments,
    COALESCE((
      SELECT COUNT(*)
      FROM share_comments c
      INNER JOIN vibe_shares vs ON vs.id = c.share_id
      WHERE vs.session_id = p_session_id
        AND (c.variant_index = vv.variant_index OR c.variant_index IS NULL)
        AND c.resolved = true
    ), 0)::BIGINT AS resolved_comments,
    COALESCE((
      SELECT jsonb_agg(
        DISTINCT jsonb_build_object(
          'email', v.viewer_email,
          'name', v.viewer_name,
          'duration', v.session_duration,
          'viewedAt', v.viewed_at
        )
      ) FILTER (WHERE v.viewer_email IS NOT NULL)
      FROM vibe_share_views v
      INNER JOIN vibe_shares vs ON vs.id = v.share_id
      WHERE vs.session_id = p_session_id AND v.variant_index = vv.variant_index
    ), '[]'::JSONB) AS viewers,
    COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', c.id,
          'userName', c.user_name,
          'userEmail', c.user_email,
          'content', c.content,
          'positionX', c.position_x,
          'positionY', c.position_y,
          'resolved', c.resolved,
          'createdAt', c.created_at
        ) ORDER BY c.created_at DESC
      )
      FROM share_comments c
      INNER JOIN vibe_shares vs ON vs.id = c.share_id
      WHERE vs.session_id = p_session_id
        AND (c.variant_index = vv.variant_index OR c.variant_index IS NULL)
        AND c.parent_id IS NULL
    ), '[]'::JSONB) AS comments
  FROM vibe_variants vv
  LEFT JOIN vibe_variant_plans vvp ON vvp.variant_id = vv.id
  WHERE vv.session_id = p_session_id
  ORDER BY vv.variant_index;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- FUNCTION: Get all project insights for account overview
-- ============================================================================

CREATE OR REPLACE FUNCTION get_all_project_insights()
RETURNS TABLE (
  session_id UUID,
  session_name TEXT,
  variant_count BIGINT,
  total_views BIGINT,
  unique_visitors BIGINT,
  total_time_spent BIGINT,
  total_comments BIGINT,
  status TEXT,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id AS session_id,
    s.name AS session_name,
    (SELECT COUNT(DISTINCT vv.variant_index) FROM vibe_variants vv WHERE vv.session_id = s.id)::BIGINT AS variant_count,
    COALESCE(SUM(vs.view_count), 0)::BIGINT AS total_views,
    (
      SELECT COUNT(DISTINCT COALESCE(v.viewer_email, v.viewer_ip_hash))
      FROM vibe_share_views v
      INNER JOIN vibe_shares sh ON sh.id = v.share_id
      WHERE sh.session_id = s.id
    )::BIGINT AS unique_visitors,
    (
      SELECT COALESCE(SUM(v.session_duration), 0)
      FROM vibe_share_views v
      INNER JOIN vibe_shares sh ON sh.id = v.share_id
      WHERE sh.session_id = s.id
    )::BIGINT AS total_time_spent,
    (
      SELECT COUNT(*)
      FROM share_comments c
      INNER JOIN vibe_shares sh ON sh.id = c.share_id
      WHERE sh.session_id = s.id
    )::BIGINT AS total_comments,
    CASE
      WHEN EXISTS (SELECT 1 FROM vibe_shares WHERE session_id = s.id AND is_active = true) THEN 'shared'
      WHEN EXISTS (SELECT 1 FROM vibe_shares WHERE session_id = s.id) THEN 'expired'
      ELSE 'draft'
    END AS status,
    s.created_at
  FROM vibe_sessions s
  LEFT JOIN vibe_shares vs ON vs.session_id = s.id
  WHERE s.user_id = auth.uid()
  GROUP BY s.id, s.name, s.created_at
  HAVING EXISTS (SELECT 1 FROM vibe_shares WHERE session_id = s.id)  -- Only show sessions with shares
  ORDER BY s.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON COLUMN vibe_share_views.viewer_email IS 'Email of the viewer (collected during feedback)';
COMMENT ON COLUMN vibe_share_views.viewer_name IS 'Display name of the viewer';
COMMENT ON COLUMN vibe_share_views.session_duration IS 'Time spent viewing in seconds';
COMMENT ON COLUMN vibe_share_views.session_id IS 'Unique session identifier for tracking';
