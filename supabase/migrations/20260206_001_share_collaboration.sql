-- Migration: Add collaboration features (comments & collaborators) for shared prototypes
-- Date: 2026-02-06

-- ============================================================================
-- COLLABORATORS TABLE
-- ============================================================================
-- Tracks who has access to shared prototypes and their roles

CREATE TABLE IF NOT EXISTS share_collaborators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  share_id UUID NOT NULL REFERENCES vibe_shares(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,  -- NULL for pending email invites
  email TEXT NOT NULL,
  display_name TEXT,
  role TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'commenter', 'viewer')),
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  invited_at TIMESTAMPTZ DEFAULT now(),
  accepted_at TIMESTAMPTZ,  -- NULL until user accepts invite
  last_seen_at TIMESTAMPTZ,
  UNIQUE(share_id, email)
);

-- Indexes for collaborator lookups
CREATE INDEX IF NOT EXISTS idx_share_collaborators_share ON share_collaborators(share_id);
CREATE INDEX IF NOT EXISTS idx_share_collaborators_user ON share_collaborators(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_share_collaborators_email ON share_collaborators(email);

-- RLS for collaborators
ALTER TABLE share_collaborators ENABLE ROW LEVEL SECURITY;

-- Share owners can manage collaborators
CREATE POLICY "Share owners can manage collaborators"
  ON share_collaborators
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM vibe_shares
      WHERE vibe_shares.id = share_collaborators.share_id
      AND vibe_shares.user_id = auth.uid()
    )
  );

-- Users can view collaborators for shares they have access to
CREATE POLICY "Collaborators can view other collaborators"
  ON share_collaborators
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM share_collaborators sc
      WHERE sc.share_id = share_collaborators.share_id
      AND sc.user_id = auth.uid()
    )
  );

-- ============================================================================
-- COMMENTS TABLE
-- ============================================================================
-- Stores comments on shared prototypes with threading and positioning support

CREATE TABLE IF NOT EXISTS share_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  share_id UUID NOT NULL REFERENCES vibe_shares(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email TEXT NOT NULL,
  user_name TEXT NOT NULL,
  content TEXT NOT NULL,
  -- Position for pin-based comments (nullable for general comments)
  position_x FLOAT,
  position_y FLOAT,
  -- Which variant this comment is on (for specific variant shares)
  variant_index INTEGER,
  -- Threading support
  parent_id UUID REFERENCES share_comments(id) ON DELETE CASCADE,
  -- Resolution tracking
  resolved BOOLEAN DEFAULT false,
  resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for comment lookups
CREATE INDEX IF NOT EXISTS idx_share_comments_share ON share_comments(share_id);
CREATE INDEX IF NOT EXISTS idx_share_comments_parent ON share_comments(parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_share_comments_user ON share_comments(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_share_comments_resolved ON share_comments(share_id, resolved);
CREATE INDEX IF NOT EXISTS idx_share_comments_created ON share_comments(share_id, created_at DESC);

-- RLS for comments
ALTER TABLE share_comments ENABLE ROW LEVEL SECURITY;

-- Anyone can view comments on active shares
CREATE POLICY "Anyone can view comments on active shares"
  ON share_comments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM vibe_shares
      WHERE vibe_shares.id = share_comments.share_id
      AND vibe_shares.is_active = true
      AND (vibe_shares.expires_at IS NULL OR vibe_shares.expires_at > now())
    )
  );

-- Anyone can insert comments on active shares (anonymous or authenticated)
CREATE POLICY "Anyone can add comments on active shares"
  ON share_comments
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM vibe_shares
      WHERE vibe_shares.id = share_comments.share_id
      AND vibe_shares.is_active = true
      AND (vibe_shares.expires_at IS NULL OR vibe_shares.expires_at > now())
    )
  );

-- Users can update their own comments
CREATE POLICY "Users can update own comments"
  ON share_comments
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Users can delete their own comments, share owners can delete any
CREATE POLICY "Users can delete own comments or share owners can delete any"
  ON share_comments
  FOR DELETE
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM vibe_shares
      WHERE vibe_shares.id = share_comments.share_id
      AND vibe_shares.user_id = auth.uid()
    )
  );

-- ============================================================================
-- FEEDBACK INSIGHTS TABLE
-- ============================================================================
-- Aggregated feedback metrics for the Insights page

CREATE TABLE IF NOT EXISTS share_feedback_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  share_id UUID NOT NULL REFERENCES vibe_shares(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES vibe_sessions(id) ON DELETE CASCADE,
  variant_index INTEGER,
  -- Metrics
  total_comments INTEGER DEFAULT 0,
  resolved_comments INTEGER DEFAULT 0,
  unique_commenters INTEGER DEFAULT 0,
  -- AI-computed insights (populated by edge function)
  sentiment_score FLOAT,  -- -1 (negative) to 1 (positive)
  key_themes JSONB DEFAULT '[]'::JSONB,  -- Array of extracted themes
  summary TEXT,  -- AI-generated summary of feedback
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(share_id, variant_index)
);

-- Index for insights lookups
CREATE INDEX IF NOT EXISTS idx_share_feedback_insights_session ON share_feedback_insights(session_id);
CREATE INDEX IF NOT EXISTS idx_share_feedback_insights_share ON share_feedback_insights(share_id);

-- RLS for insights
ALTER TABLE share_feedback_insights ENABLE ROW LEVEL SECURITY;

-- Share owners can view and manage insights
CREATE POLICY "Share owners can manage insights"
  ON share_feedback_insights
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM vibe_shares
      WHERE vibe_shares.id = share_feedback_insights.share_id
      AND vibe_shares.user_id = auth.uid()
    )
  );

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Function to add a comment (handles both authenticated and anonymous users)
CREATE OR REPLACE FUNCTION add_share_comment(
  p_share_token TEXT,
  p_content TEXT,
  p_user_email TEXT,
  p_user_name TEXT,
  p_position_x FLOAT DEFAULT NULL,
  p_position_y FLOAT DEFAULT NULL,
  p_variant_index INTEGER DEFAULT NULL,
  p_parent_id UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_share_id UUID;
  v_comment_id UUID;
  v_user_id UUID;
BEGIN
  -- Get share ID from token
  SELECT id INTO v_share_id
  FROM vibe_shares
  WHERE share_token = p_share_token
    AND is_active = true
    AND (expires_at IS NULL OR expires_at > now());

  IF v_share_id IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired share link';
  END IF;

  -- Get user ID if authenticated
  v_user_id := auth.uid();

  -- Insert comment
  INSERT INTO share_comments (
    share_id, user_id, user_email, user_name, content,
    position_x, position_y, variant_index, parent_id
  )
  VALUES (
    v_share_id, v_user_id, p_user_email, p_user_name, p_content,
    p_position_x, p_position_y, p_variant_index, p_parent_id
  )
  RETURNING id INTO v_comment_id;

  -- Update insights aggregation
  INSERT INTO share_feedback_insights (share_id, session_id, variant_index, total_comments, unique_commenters)
  SELECT
    v_share_id,
    vs.session_id,
    p_variant_index,
    1,
    1
  FROM vibe_shares vs
  WHERE vs.id = v_share_id
  ON CONFLICT (share_id, variant_index)
  DO UPDATE SET
    total_comments = share_feedback_insights.total_comments + 1,
    unique_commenters = (
      SELECT COUNT(DISTINCT user_email)
      FROM share_comments
      WHERE share_id = v_share_id
      AND (variant_index = p_variant_index OR (variant_index IS NULL AND p_variant_index IS NULL))
    ),
    updated_at = now();

  RETURN v_comment_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to resolve/unresolve a comment
CREATE OR REPLACE FUNCTION toggle_comment_resolved(
  p_comment_id UUID,
  p_resolved BOOLEAN
)
RETURNS BOOLEAN AS $$
DECLARE
  v_share_id UUID;
  v_variant_index INTEGER;
BEGIN
  -- Get comment info and verify ownership/access
  SELECT share_id, variant_index INTO v_share_id, v_variant_index
  FROM share_comments
  WHERE id = p_comment_id
    AND (
      user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM vibe_shares
        WHERE vibe_shares.id = share_comments.share_id
        AND vibe_shares.user_id = auth.uid()
      )
    );

  IF v_share_id IS NULL THEN
    RAISE EXCEPTION 'Comment not found or access denied';
  END IF;

  -- Update comment
  UPDATE share_comments
  SET
    resolved = p_resolved,
    resolved_by = CASE WHEN p_resolved THEN auth.uid() ELSE NULL END,
    resolved_at = CASE WHEN p_resolved THEN now() ELSE NULL END,
    updated_at = now()
  WHERE id = p_comment_id;

  -- Update insights
  UPDATE share_feedback_insights
  SET
    resolved_comments = (
      SELECT COUNT(*) FROM share_comments
      WHERE share_id = v_share_id
      AND resolved = true
      AND (variant_index = v_variant_index OR (variant_index IS NULL AND v_variant_index IS NULL))
    ),
    updated_at = now()
  WHERE share_id = v_share_id
    AND (variant_index = v_variant_index OR (variant_index IS NULL AND v_variant_index IS NULL));

  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get comments for a share
CREATE OR REPLACE FUNCTION get_share_comments(p_share_token TEXT)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  user_email TEXT,
  user_name TEXT,
  content TEXT,
  position_x FLOAT,
  position_y FLOAT,
  variant_index INTEGER,
  parent_id UUID,
  resolved BOOLEAN,
  resolved_by UUID,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  reply_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    sc.id,
    sc.user_id,
    sc.user_email,
    sc.user_name,
    sc.content,
    sc.position_x,
    sc.position_y,
    sc.variant_index,
    sc.parent_id,
    sc.resolved,
    sc.resolved_by,
    sc.resolved_at,
    sc.created_at,
    sc.updated_at,
    (SELECT COUNT(*) FROM share_comments replies WHERE replies.parent_id = sc.id) AS reply_count
  FROM share_comments sc
  INNER JOIN vibe_shares vs ON vs.id = sc.share_id
  WHERE vs.share_token = p_share_token
    AND vs.is_active = true
    AND (vs.expires_at IS NULL OR vs.expires_at > now())
  ORDER BY sc.created_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to invite a collaborator
CREATE OR REPLACE FUNCTION invite_collaborator(
  p_share_token TEXT,
  p_email TEXT,
  p_display_name TEXT DEFAULT NULL,
  p_role TEXT DEFAULT 'commenter'
)
RETURNS UUID AS $$
DECLARE
  v_share_id UUID;
  v_user_id UUID;
  v_collaborator_id UUID;
BEGIN
  -- Verify caller owns the share
  SELECT id INTO v_share_id
  FROM vibe_shares
  WHERE share_token = p_share_token
    AND user_id = auth.uid();

  IF v_share_id IS NULL THEN
    RAISE EXCEPTION 'Share not found or access denied';
  END IF;

  -- Check if user exists
  SELECT id INTO v_user_id
  FROM auth.users
  WHERE email = p_email;

  -- Insert or update collaborator
  INSERT INTO share_collaborators (share_id, user_id, email, display_name, role, invited_by)
  VALUES (v_share_id, v_user_id, p_email, p_display_name, p_role, auth.uid())
  ON CONFLICT (share_id, email)
  DO UPDATE SET
    role = p_role,
    display_name = COALESCE(p_display_name, share_collaborators.display_name)
  RETURNING id INTO v_collaborator_id;

  RETURN v_collaborator_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get feedback insights for a session (for Insights page)
CREATE OR REPLACE FUNCTION get_session_feedback_insights(p_session_id UUID)
RETURNS TABLE (
  share_id UUID,
  share_token TEXT,
  variant_index INTEGER,
  total_comments INTEGER,
  resolved_comments INTEGER,
  unique_commenters INTEGER,
  sentiment_score FLOAT,
  key_themes JSONB,
  summary TEXT,
  view_count INTEGER,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    vs.id AS share_id,
    vs.share_token,
    sfi.variant_index,
    COALESCE(sfi.total_comments, 0) AS total_comments,
    COALESCE(sfi.resolved_comments, 0) AS resolved_comments,
    COALESCE(sfi.unique_commenters, 0) AS unique_commenters,
    sfi.sentiment_score,
    COALESCE(sfi.key_themes, '[]'::JSONB) AS key_themes,
    sfi.summary,
    vs.view_count,
    vs.created_at
  FROM vibe_shares vs
  LEFT JOIN share_feedback_insights sfi ON sfi.share_id = vs.id
  WHERE vs.session_id = p_session_id
    AND vs.user_id = auth.uid()
    AND vs.is_active = true
  ORDER BY vs.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Update updated_at on comment changes
CREATE OR REPLACE FUNCTION update_comment_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_share_comments_updated
  BEFORE UPDATE ON share_comments
  FOR EACH ROW
  EXECUTE FUNCTION update_comment_timestamp();

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE share_collaborators IS 'Tracks users who have access to shared prototypes';
COMMENT ON TABLE share_comments IS 'Comments on shared prototypes with threading and positioning';
COMMENT ON TABLE share_feedback_insights IS 'Aggregated feedback metrics for the Insights dashboard';
COMMENT ON COLUMN share_comments.position_x IS 'X coordinate (0-100%) for pin-based comments';
COMMENT ON COLUMN share_comments.position_y IS 'Y coordinate (0-100%) for pin-based comments';
COMMENT ON COLUMN share_feedback_insights.sentiment_score IS 'AI-computed sentiment from -1 (negative) to 1 (positive)';
