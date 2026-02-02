-- Migration: Fix feedback insights service errors
-- Adds wireframe_url to vibe_variants and creates missing RPC functions

-- Add wireframe_url column to vibe_variants (already exists on vibe_variant_plans)
ALTER TABLE vibe_variants
ADD COLUMN IF NOT EXISTS wireframe_url TEXT;

COMMENT ON COLUMN vibe_variants.wireframe_url IS 'Public URL of the visual wireframe for this variant';

-- Drop existing functions if they exist (to allow return type changes)
DROP FUNCTION IF EXISTS get_session_insights(uuid);
DROP FUNCTION IF EXISTS get_variant_insights(integer, uuid);
DROP FUNCTION IF EXISTS get_variant_insights(uuid);

-- Create get_session_insights function
CREATE OR REPLACE FUNCTION get_session_insights(p_session_id uuid)
RETURNS TABLE (
  session_id uuid,
  session_name text,
  prompt text,
  status text,
  created_at timestamptz,
  variant_count bigint,
  completed_variant_count bigint
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    vs.id AS session_id,
    vs.name AS session_name,
    vs.prompt,
    vs.status,
    vs.created_at,
    COUNT(vv.id) AS variant_count,
    COUNT(vv.id) FILTER (WHERE vv.status = 'complete') AS completed_variant_count
  FROM vibe_sessions vs
  LEFT JOIN vibe_variants vv ON vv.session_id = vs.id
  WHERE vs.id = p_session_id
  GROUP BY vs.id, vs.name, vs.prompt, vs.status, vs.created_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create get_variant_insights function
CREATE OR REPLACE FUNCTION get_variant_insights(p_variant_index integer, p_session_id uuid)
RETURNS TABLE (
  variant_id uuid,
  variant_index integer,
  plan_title text,
  plan_description text,
  html_url text,
  wireframe_url text,
  status text,
  created_at timestamptz
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    vv.id AS variant_id,
    vv.variant_index,
    vvp.title AS plan_title,
    vvp.description AS plan_description,
    vv.html_url,
    COALESCE(vv.wireframe_url, vvp.wireframe_url) AS wireframe_url,
    vv.status,
    vv.created_at
  FROM vibe_variants vv
  JOIN vibe_variant_plans vvp ON vvp.id = vv.plan_id
  WHERE vv.variant_index = p_variant_index
    AND vv.session_id = p_session_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_session_insights(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_variant_insights(integer, uuid) TO authenticated;
