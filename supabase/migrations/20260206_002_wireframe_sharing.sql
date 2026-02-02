-- Migration: Add wireframe sharing support
-- Date: 2026-02-01

-- Add wireframe sharing flag to shares table
ALTER TABLE vibe_shares ADD COLUMN IF NOT EXISTS share_wireframes BOOLEAN DEFAULT false;

-- Add plan_id reference for wireframe-specific shares
ALTER TABLE vibe_shares ADD COLUMN IF NOT EXISTS plan_id UUID REFERENCES vibe_variant_plans(id) ON DELETE CASCADE;

-- Create index for efficient wireframe share lookups
CREATE INDEX IF NOT EXISTS idx_vibe_shares_wireframes ON vibe_shares(session_id, share_wireframes) WHERE share_wireframes = true;

-- Drop and recreate get_share_data function with new return type
DROP FUNCTION IF EXISTS get_share_data(TEXT);

CREATE OR REPLACE FUNCTION get_share_data(p_share_token TEXT)
RETURNS TABLE (
  share_id UUID,
  session_id UUID,
  share_type TEXT,
  variant_index INTEGER,
  share_wireframes BOOLEAN,
  html_url TEXT,
  wireframe_url TEXT,
  title TEXT,
  description TEXT,
  screen_name TEXT,
  thumbnail_url TEXT
) AS $$
DECLARE
  v_share RECORD;
  v_selected_variant INTEGER;
BEGIN
  -- Get share record
  SELECT * INTO v_share
  FROM vibe_shares s
  WHERE s.share_token = p_share_token
    AND s.is_active = true
    AND (s.expires_at IS NULL OR s.expires_at > NOW());
  
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Determine which variant to show
  IF v_share.share_type = 'random' THEN
    -- Select a random variant from those marked as selected
    SELECT vv.variant_index INTO v_selected_variant
    FROM vibe_variants vv
    WHERE vv.session_id = v_share.session_id
      AND vv.is_selected = true
      AND vv.status = 'complete'
    ORDER BY RANDOM()
    LIMIT 1;
  ELSE
    v_selected_variant := v_share.variant_index;
  END IF;

  -- Return share data with variant info
  IF v_share.share_wireframes THEN
    -- Return wireframe data
    RETURN QUERY
    SELECT 
      v_share.id AS share_id,
      v_share.session_id,
      v_share.share_type::TEXT,
      COALESCE(v_selected_variant, vp.variant_index) AS variant_index,
      v_share.share_wireframes,
      NULL::TEXT AS html_url,
      vp.wireframe_url,
      vp.title,
      vp.description,
      vs.name AS screen_name,
      vs.thumbnail_url
    FROM vibe_sessions vs
    LEFT JOIN vibe_variant_plans vp ON vp.session_id = vs.id
    WHERE vs.id = v_share.session_id
      AND (v_selected_variant IS NULL OR vp.variant_index = v_selected_variant)
    ORDER BY vp.variant_index;
  ELSE
    -- Return prototype data (existing behavior)
    RETURN QUERY
    SELECT 
      v_share.id AS share_id,
      v_share.session_id,
      v_share.share_type::TEXT,
      v_selected_variant AS variant_index,
      v_share.share_wireframes,
      vv.html_url,
      vp.wireframe_url,
      vp.title,
      vp.description,
      vs.name AS screen_name,
      vs.thumbnail_url
    FROM vibe_sessions vs
    LEFT JOIN vibe_variants vv ON vv.session_id = vs.id AND vv.variant_index = v_selected_variant
    LEFT JOIN vibe_variant_plans vp ON vp.session_id = vs.id AND vp.variant_index = v_selected_variant
    WHERE vs.id = v_share.session_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON COLUMN vibe_shares.share_wireframes IS 'When true, share link shows wireframes instead of final prototypes';
COMMENT ON COLUMN vibe_shares.plan_id IS 'Optional reference to specific plan for wireframe sharing';

-- Update create_share_link function to support wireframe sharing
CREATE OR REPLACE FUNCTION create_share_link(
  p_session_id UUID,
  p_share_type TEXT,
  p_variant_index INTEGER DEFAULT NULL,
  p_expires_in_days INTEGER DEFAULT NULL,
  p_share_wireframes BOOLEAN DEFAULT FALSE
)
RETURNS TABLE(share_id UUID, share_token TEXT) AS $$
DECLARE
  v_token TEXT;
  v_share_id UUID;
  v_expires_at TIMESTAMPTZ;
BEGIN
  -- Generate unique token
  LOOP
    v_token := generate_share_token();
    EXIT WHEN NOT EXISTS (SELECT 1 FROM vibe_shares WHERE vibe_shares.share_token = v_token);
  END LOOP;

  -- Calculate expiration
  IF p_expires_in_days IS NOT NULL THEN
    v_expires_at := now() + (p_expires_in_days || ' days')::interval;
  END IF;

  -- Insert share with wireframe flag
  INSERT INTO vibe_shares (session_id, user_id, share_type, variant_index, share_token, expires_at, share_wireframes)
  VALUES (p_session_id, auth.uid(), p_share_type, p_variant_index, v_token, v_expires_at, p_share_wireframes)
  RETURNING id INTO v_share_id;

  RETURN QUERY SELECT v_share_id, v_token;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
