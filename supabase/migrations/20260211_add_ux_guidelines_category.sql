-- Migration: Add ux_guidelines category to context_files
-- This allows users to upload product demo videos for UX guidelines extraction

-- ============================================
-- UPDATE CATEGORY CHECK CONSTRAINT
-- ============================================

-- Drop the existing check constraint
ALTER TABLE context_files DROP CONSTRAINT IF EXISTS context_files_category_check;

-- Add updated check constraint with ux_guidelines
ALTER TABLE context_files ADD CONSTRAINT context_files_category_check
  CHECK (category IN ('goals', 'kpis', 'backlog', 'knowledge', 'ux_guidelines'));
