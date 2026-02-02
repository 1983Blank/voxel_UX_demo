-- Migration: Add extracted_components and design_tokens tables
-- These store the component library and design system data for prompt assembly

-- ============================================
-- EXTRACTED COMPONENTS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS extracted_components (
  -- Identification
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,

  -- Source tracking
  screen_id UUID REFERENCES screens(id) ON DELETE SET NULL,
  source_screen_name TEXT,
  extraction_session_id UUID,

  -- Component data
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN (
    'button', 'input', 'card', 'navigation', 'header', 'footer',
    'modal', 'list', 'table', 'image', 'icon', 'badge', 'alert',
    'form', 'dropdown', 'tabs', 'menu', 'sidebar', 'search',
    'avatar', 'tooltip', 'progress', 'skeleton', 'divider', 'other'
  )),
  description TEXT,
  tags TEXT[] DEFAULT '{}',

  -- Component markup
  html TEXT NOT NULL,
  css TEXT,

  -- Metadata
  variants JSONB DEFAULT '[]',
  props JSONB DEFAULT '{}',
  occurrences INTEGER DEFAULT 1,

  -- Approval workflow
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'needs-fix')),
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Tracking
  generated_by TEXT DEFAULT 'llm' CHECK (generated_by IN ('llm', 'dom-parser', 'manual')),
  generation_model TEXT,
  generation_provider TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_extracted_components_user_id ON extracted_components(user_id);
CREATE INDEX IF NOT EXISTS idx_extracted_components_screen_id ON extracted_components(screen_id);
CREATE INDEX IF NOT EXISTS idx_extracted_components_status ON extracted_components(status);
CREATE INDEX IF NOT EXISTS idx_extracted_components_category ON extracted_components(category);
CREATE INDEX IF NOT EXISTS idx_extracted_components_created ON extracted_components(user_id, created_at DESC);

-- RLS
ALTER TABLE extracted_components ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own components" ON extracted_components
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own components" ON extracted_components
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own components" ON extracted_components
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own components" ON extracted_components
  FOR DELETE USING (auth.uid() = user_id);

-- Trigger
CREATE TRIGGER update_extracted_components_updated_at
  BEFORE UPDATE ON extracted_components
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ============================================
-- DESIGN TOKENS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS design_tokens (
  -- Identification
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,

  -- Token definition
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN (
    'color', 'typography', 'spacing', 'sizing', 'border-radius',
    'shadow', 'animation', 'opacity', 'z-index', 'breakpoint', 'other'
  )),
  subcategory TEXT,

  -- Token value
  value TEXT NOT NULL,
  value_type TEXT CHECK (value_type IN ('color', 'dimension', 'duration', 'font-family', 'font-weight', 'number', 'string')),

  -- Display/documentation
  description TEXT,
  css_variable TEXT,
  usage_count INTEGER DEFAULT 1,

  -- Source tracking
  source_screens UUID[] DEFAULT '{}',
  source_screen_names TEXT[] DEFAULT '{}',
  extraction_session_id UUID,

  -- Approval workflow
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'deprecated')),
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Metadata
  generated_by TEXT DEFAULT 'extracted' CHECK (generated_by IN ('extracted', 'manual', 'imported')),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_design_tokens_user_id ON design_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_design_tokens_category ON design_tokens(category);
CREATE INDEX IF NOT EXISTS idx_design_tokens_status ON design_tokens(status);
CREATE INDEX IF NOT EXISTS idx_design_tokens_created ON design_tokens(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_design_tokens_name ON design_tokens(user_id, name);

-- RLS
ALTER TABLE design_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own tokens" ON design_tokens
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own tokens" ON design_tokens
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own tokens" ON design_tokens
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own tokens" ON design_tokens
  FOR DELETE USING (auth.uid() = user_id);

-- Trigger
CREATE TRIGGER update_design_tokens_updated_at
  BEFORE UPDATE ON design_tokens
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ============================================
-- DESIGN TOKEN SETS (for grouping tokens)
-- ============================================

CREATE TABLE IF NOT EXISTS design_token_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,

  name TEXT NOT NULL,
  description TEXT,

  -- Source tracking
  source_screens UUID[] DEFAULT '{}',
  extraction_session_id UUID,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE design_token_sets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own token sets" ON design_token_sets
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own token sets" ON design_token_sets
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own token sets" ON design_token_sets
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own token sets" ON design_token_sets
  FOR DELETE USING (auth.uid() = user_id);

-- Trigger
CREATE TRIGGER update_design_token_sets_updated_at
  BEFORE UPDATE ON design_token_sets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
