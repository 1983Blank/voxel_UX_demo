-- Migration: Fix get_share_data function permissions for anonymous access
-- Date: 2026-02-04
-- Fixes: Share links not working due to missing GRANT for anon role

-- Grant execute permission to anonymous users for public share viewing
GRANT EXECUTE ON FUNCTION get_share_data(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION get_share_data(TEXT) TO authenticated;

-- Also grant on the create_share_link function for authenticated users
GRANT EXECUTE ON FUNCTION create_share_link(UUID, TEXT, INTEGER, INTEGER, BOOLEAN) TO authenticated;
