-- Migration: Fix get_share_data function - screens table has 'thumbnail' not 'thumbnail_url'
-- Date: 2026-02-04
-- Fixes: column sc.thumbnail_url does not exist error

-- Drop and recreate with correct column name
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
    SELECT vp.variant_index INTO v_selected_variant
    FROM vibe_variant_plans vp
    JOIN vibe_variants vv ON vv.session_id = vp.session_id AND vv.variant_index = vp.variant_index
    WHERE vp.session_id = v_share.session_id
      AND vp.is_selected = true
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
      sc.thumbnail AS thumbnail_url  -- screens table has 'thumbnail' not 'thumbnail_url'
    FROM vibe_sessions vs
    LEFT JOIN screens sc ON sc.id = vs.screen_id
    LEFT JOIN vibe_variant_plans vp ON vp.session_id = vs.id
    WHERE vs.id = v_share.session_id
      AND (v_selected_variant IS NULL OR vp.variant_index = v_selected_variant)
    ORDER BY vp.variant_index;
  ELSE
    -- Return prototype data
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
      COALESCE(vv.thumbnail_url, sc.thumbnail) AS thumbnail_url  -- Try variant thumbnail first, then screen
    FROM vibe_sessions vs
    LEFT JOIN screens sc ON sc.id = vs.screen_id
    LEFT JOIN vibe_variants vv ON vv.session_id = vs.id AND vv.variant_index = v_selected_variant
    LEFT JOIN vibe_variant_plans vp ON vp.session_id = vs.id AND vp.variant_index = v_selected_variant
    WHERE vs.id = v_share.session_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Re-grant execute permissions
GRANT EXECUTE ON FUNCTION get_share_data(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION get_share_data(TEXT) TO authenticated;
