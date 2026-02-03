-- Migration: Server-Persistent Generation with Streaming Preview
-- Enables server-side orchestration of generation with Realtime streaming updates

-- ============================================
-- GENERATION SESSIONS TABLE
-- Tracks overall generation jobs (one per generation request)
-- ============================================
CREATE TABLE IF NOT EXISTS generation_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  vibe_session_id UUID REFERENCES vibe_sessions(id) ON DELETE CASCADE NOT NULL,

  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'paused', 'completed', 'failed')),

  -- Context for resume (stored once at start)
  generation_context JSONB NOT NULL,

  -- Progress tracking
  current_variant_index INTEGER,
  total_variants INTEGER NOT NULL DEFAULT 4,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,

  -- For self-invoke continuation (edge function timeout handling)
  continuation_token TEXT,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_gen_sessions_user ON generation_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_gen_sessions_vibe ON generation_sessions(vibe_session_id);
CREATE INDEX IF NOT EXISTS idx_gen_sessions_status ON generation_sessions(status);

-- Enable RLS
ALTER TABLE generation_sessions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users view own generation sessions"
  ON generation_sessions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own generation sessions"
  ON generation_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own generation sessions"
  ON generation_sessions FOR UPDATE
  USING (auth.uid() = user_id);

-- Service role can update any session (for edge functions)
CREATE POLICY "Service role updates sessions"
  ON generation_sessions FOR UPDATE
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Updated_at trigger
CREATE TRIGGER generation_sessions_updated_at
  BEFORE UPDATE ON generation_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- GENERATION VARIANTS TABLE
-- Per-variant progress tracking (one per variant in a session)
-- ============================================
CREATE TABLE IF NOT EXISTS generation_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  generation_session_id UUID REFERENCES generation_sessions(id) ON DELETE CASCADE NOT NULL,
  variant_index INTEGER NOT NULL CHECK (variant_index >= 1 AND variant_index <= 4),

  phase TEXT NOT NULL DEFAULT 'queued'
    CHECK (phase IN ('queued', 'script', 'files', 'assembly', 'complete', 'failed')),
  current_step TEXT,
  completed_steps INTEGER DEFAULT 0,
  total_steps INTEGER,

  -- Implementation script result (from generate-implementation-script)
  implementation_script JSONB,

  -- Final VirtualFS snapshot (all files assembled)
  virtual_fs JSONB,

  -- Preview URL for streaming preview
  preview_url TEXT,

  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  -- Each session has exactly 4 variants (1-4)
  UNIQUE(generation_session_id, variant_index)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_gen_variants_session ON generation_variants(generation_session_id);
CREATE INDEX IF NOT EXISTS idx_gen_variants_phase ON generation_variants(phase);

-- Enable RLS
ALTER TABLE generation_variants ENABLE ROW LEVEL SECURITY;

-- RLS Policies (based on parent session ownership)
CREATE POLICY "Users view own generation variants"
  ON generation_variants FOR SELECT
  USING (
    generation_session_id IN (
      SELECT id FROM generation_sessions WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users insert own generation variants"
  ON generation_variants FOR INSERT
  WITH CHECK (
    generation_session_id IN (
      SELECT id FROM generation_sessions WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users update own generation variants"
  ON generation_variants FOR UPDATE
  USING (
    generation_session_id IN (
      SELECT id FROM generation_sessions WHERE user_id = auth.uid()
    )
  );

-- Service role can manage all variants (for edge functions)
CREATE POLICY "Service role manages variants"
  ON generation_variants FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Updated_at trigger
CREATE TRIGGER generation_variants_updated_at
  BEFORE UPDATE ON generation_variants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- GENERATION STEPS TABLE
-- Per-file/step progress for granular Realtime updates
-- ============================================
CREATE TABLE IF NOT EXISTS generation_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id UUID REFERENCES generation_variants(id) ON DELETE CASCADE NOT NULL,
  step_key TEXT NOT NULL,
  step_label TEXT NOT NULL,

  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'completed', 'failed')),

  -- Generated file content (if this step produces a file)
  file_path TEXT,
  file_content TEXT,
  file_type TEXT,

  -- Timing
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  error_message TEXT,

  created_at TIMESTAMPTZ DEFAULT now(),

  -- Each variant has unique step keys
  UNIQUE(variant_id, step_key)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_gen_steps_variant ON generation_steps(variant_id);
CREATE INDEX IF NOT EXISTS idx_gen_steps_status ON generation_steps(status);

-- Enable RLS
ALTER TABLE generation_steps ENABLE ROW LEVEL SECURITY;

-- RLS Policies (based on grandparent session ownership)
CREATE POLICY "Users view own generation steps"
  ON generation_steps FOR SELECT
  USING (
    variant_id IN (
      SELECT gv.id FROM generation_variants gv
      JOIN generation_sessions gs ON gv.generation_session_id = gs.id
      WHERE gs.user_id = auth.uid()
    )
  );

CREATE POLICY "Users insert own generation steps"
  ON generation_steps FOR INSERT
  WITH CHECK (
    variant_id IN (
      SELECT gv.id FROM generation_variants gv
      JOIN generation_sessions gs ON gv.generation_session_id = gs.id
      WHERE gs.user_id = auth.uid()
    )
  );

CREATE POLICY "Users update own generation steps"
  ON generation_steps FOR UPDATE
  USING (
    variant_id IN (
      SELECT gv.id FROM generation_variants gv
      JOIN generation_sessions gs ON gv.generation_session_id = gs.id
      WHERE gs.user_id = auth.uid()
    )
  );

-- Service role can manage all steps (for edge functions)
CREATE POLICY "Service role manages steps"
  ON generation_steps FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- ============================================
-- ENABLE REALTIME
-- Allows clients to subscribe to changes via postgres_changes
-- ============================================
ALTER PUBLICATION supabase_realtime ADD TABLE generation_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE generation_variants;
ALTER PUBLICATION supabase_realtime ADD TABLE generation_steps;

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Get active generation session for a vibe session
CREATE OR REPLACE FUNCTION get_active_generation(p_vibe_session_id UUID)
RETURNS TABLE (
  session_id UUID,
  status TEXT,
  current_variant_index INTEGER,
  total_variants INTEGER,
  started_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    gs.id AS session_id,
    gs.status,
    gs.current_variant_index,
    gs.total_variants,
    gs.started_at
  FROM generation_sessions gs
  WHERE gs.vibe_session_id = p_vibe_session_id
    AND gs.status IN ('pending', 'running', 'paused')
  ORDER BY gs.created_at DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get full generation progress with all variants and steps
CREATE OR REPLACE FUNCTION get_generation_progress(p_session_id UUID)
RETURNS JSON AS $$
DECLARE
  v_result JSON;
BEGIN
  SELECT json_build_object(
    'session', row_to_json(gs),
    'variants', (
      SELECT COALESCE(json_agg(
        json_build_object(
          'id', gv.id,
          'variant_index', gv.variant_index,
          'phase', gv.phase,
          'current_step', gv.current_step,
          'completed_steps', gv.completed_steps,
          'total_steps', gv.total_steps,
          'preview_url', gv.preview_url,
          'error_message', gv.error_message,
          'steps', (
            SELECT COALESCE(json_agg(
              json_build_object(
                'id', s.id,
                'step_key', s.step_key,
                'step_label', s.step_label,
                'status', s.status,
                'file_path', s.file_path,
                'file_type', s.file_type,
                'duration_ms', s.duration_ms,
                'error_message', s.error_message
              ) ORDER BY s.created_at
            ), '[]'::JSON)
            FROM generation_steps s
            WHERE s.variant_id = gv.id
          )
        ) ORDER BY gv.variant_index
      ), '[]'::JSON)
      FROM generation_variants gv
      WHERE gv.generation_session_id = gs.id
    )
  ) INTO v_result
  FROM generation_sessions gs
  WHERE gs.id = p_session_id;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Mark a step as completed and update variant progress
CREATE OR REPLACE FUNCTION complete_generation_step(
  p_step_id UUID,
  p_file_path TEXT DEFAULT NULL,
  p_file_content TEXT DEFAULT NULL,
  p_file_type TEXT DEFAULT NULL,
  p_duration_ms INTEGER DEFAULT NULL,
  p_error_message TEXT DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
  v_variant_id UUID;
  v_completed_count INTEGER;
  v_total_count INTEGER;
BEGIN
  -- Update the step
  UPDATE generation_steps
  SET
    status = CASE WHEN p_error_message IS NULL THEN 'completed' ELSE 'failed' END,
    file_path = COALESCE(p_file_path, file_path),
    file_content = COALESCE(p_file_content, file_content),
    file_type = COALESCE(p_file_type, file_type),
    completed_at = now(),
    duration_ms = p_duration_ms,
    error_message = p_error_message
  WHERE id = p_step_id
  RETURNING variant_id INTO v_variant_id;

  -- Count completed steps
  SELECT
    COUNT(*) FILTER (WHERE status = 'completed'),
    COUNT(*)
  INTO v_completed_count, v_total_count
  FROM generation_steps
  WHERE variant_id = v_variant_id;

  -- Update variant progress
  UPDATE generation_variants
  SET
    completed_steps = v_completed_count,
    total_steps = v_total_count
  WHERE id = v_variant_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_active_generation(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_generation_progress(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION complete_generation_step(UUID, TEXT, TEXT, TEXT, INTEGER, TEXT) TO service_role;
