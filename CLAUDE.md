# Voxel - AI Prototyping Tool

## Overview

Voxel is a desktop-first AI prototyping tool for product teams. It enables teams to capture web UIs, extract components, generate prototypes using AI, and collaborate on designs.

## Tech Stack

- **Framework**: React 19 with TypeScript
- **Build Tool**: Vite
- **UI Library**: MUI (Material-UI) v5 - desktop-first
- **Icons**: Phosphor Icons + MUI Icons
- **Styling**: Tailwind CSS + Emotion
- **Routing**: React Router v7
- **State Management**: Zustand
- **Server State**: TanStack Query (React Query)
- **Forms**: React Hook Form + Zod validation
- **Code Editor**: Monaco Editor
- **Backend**: Supabase (Auth, Database, Storage, Edge Functions)
- **HTTP Client**: Axios

## Project Structure

```
src/
├── components/          # Reusable UI components
├── layouts/             # Layout components
│   ├── AppLayout.tsx    # Main app layout with sidebar
│   └── AuthLayout.tsx   # Login/signup layout
├── pages/               # Page components (route-level)
│   ├── Screens.tsx      # Browse/manage captured HTML screens
│   ├── Components.tsx   # View extracted components
│   ├── Editor.tsx       # WYSIWYG + AI prompt editor
│   ├── Variants.tsx     # A/B/C/D variant comparison
│   ├── Context.tsx      # Product context upload
│   └── Analytics.tsx    # Engagement dashboard
├── services/            # API services
├── types/               # TypeScript types
│   └── models.ts        # Domain models (CapturedScreen, Variant, etc.)
├── store/               # Zustand stores
│   ├── authStore.ts     # Authentication state
│   └── screensStore.ts  # Captured screens state
├── hooks/               # Custom React hooks
├── utils/               # Helper functions
└── mock-captures/       # Captured HTML files from SingleFile
    └── screens/         # HTML screen captures
```

## Routes

| Path | Component | Description |
|------|-----------|-------------|
| `/screens` | Screens | Browse/manage captured HTML screens |
| `/components` | Components | View extracted components library |
| `/editor/:screenId` | Editor | WYSIWYG + AI prompt editor |
| `/variants/:screenId` | Variants | Compare A/B/C/D variants |
| `/context` | Context | Upload product context (text/PDF/video) |
| `/analytics` | Analytics | Track engagement and feedback |

## MVP Features

1. **Screens Page** - Browse/manage captured HTML screens with thumbnails
2. **Component Library** - View extracted components from screens
3. **Vibe Prototype** - AI prompt + WYSIWYG editor to modify screens
4. **Multi-Variant Output** - Create and compare A/B/C/D variants
5. **Product Context** - Upload text/PDF/video as context for AI
6. **Multiplayer & Commenting** - Collaborate on published prototypes
7. **Analytics Dashboard** - Track variant engagement

## Coding Conventions

### TypeScript
- Use strict mode
- Define types in `src/types/` for reusability
- Prefer interfaces for object types

### Components
- Use function components with TypeScript
- Export as named exports
- Use MUI components as foundation
- Use Phosphor icons for consistency

### Styling
- **Desktop-first** application (NOT mobile-first)
- Use MUI's sx prop for component styling
- Use Tailwind CSS for utility classes
- Theme customization via MUI ThemeProvider and Zustand themeStore

### State Management
- **Local state**: `useState` for component-specific state
- **Global state**: Zustand stores in `src/store/`
- **Server state**: TanStack Query for API data

## Import Aliases

```typescript
import { Button } from '@/components/ui';
import { useScreensStore } from '@/store/screensStore';
import type { CapturedScreen } from '@/types';
```

## Running the Project

```bash
npm run dev     # Start dev server (port 3000)
npm run build   # Build for production
npm run lint    # Run ESLint
```

## Mock Data

Captured screens are stored in `src/mock-captures/screens/` as HTML files from the SingleFile browser extension. The screensStore loads these as mock data.

## Supabase Auth - CRITICAL Guidelines

**DO NOT modify the following without careful consideration:**

### Auth Configuration (`src/services/supabase.ts`)
- **Keep `detectSessionInUrl: true`** - This is required for OAuth callbacks to work
- **Do NOT change the default `storageKey`** - Changing it invalidates all existing sessions
- **Do NOT change `flowType`** - The default implicit flow is configured in Supabase dashboard

### Auth Initialization (`src/store/authStore.ts`)
- **Use `onAuthStateChange` as the primary auth source** - It handles the `INITIAL_SESSION` event reliably
- **Do NOT call `supabase.auth.getSession()` or `supabase.auth.getUser()` directly during initialization** - This races with `detectSessionInUrl` and causes `AbortError`
- **The auth listener should only be set up once** - Use a flag to prevent duplicate listeners
- **Do NOT make async Supabase calls inside `onAuthStateChange` callback** - The auth lock is still held; use `setTimeout` to delay profile fetches
- **`initialize()` returns a Promise** - It resolves after the first auth state is determined, so App.tsx can await it

### Getting User in Components/Stores
- **Use `useAuthStore.getState().supabaseUser`** instead of calling `supabase.auth.getUser()` directly
- **If you must call auth methods, use `getAuthUserSafe()`** from supabase.ts which deduplicates concurrent calls
- **Run data fetching operations sequentially**, not in parallel, when they all need auth

### Common Pitfalls That Break Auth
1. ❌ Calling `supabase.auth.getUser()` from multiple components simultaneously
2. ❌ Changing Supabase client config options (storageKey, flowType, detectSessionInUrl)
3. ❌ Calling `getSession()` before `onAuthStateChange` listener is set up
4. ✅ Use `onAuthStateChange` and wait for `INITIAL_SESSION` or `SIGNED_IN` events
5. ✅ Get user from `useAuthStore` instead of calling Supabase auth directly

## Supabase Database Migrations - CRITICAL Guidelines

### Writing Idempotent Migrations
Migrations may be partially applied or re-run. Always use defensive patterns:

```sql
-- Tables: Use IF NOT EXISTS
CREATE TABLE IF NOT EXISTS my_table (...);

-- Indexes: Use IF NOT EXISTS
CREATE INDEX IF NOT EXISTS idx_name ON my_table(column);

-- Policies: Always DROP before CREATE (no IF NOT EXISTS for policies)
DROP POLICY IF EXISTS "Policy name" ON my_table;
CREATE POLICY "Policy name" ON my_table FOR SELECT USING (...);

-- Triggers: Always DROP before CREATE
DROP TRIGGER IF EXISTS trigger_name ON my_table;
CREATE TRIGGER trigger_name ...;

-- Functions: Use CREATE OR REPLACE
CREATE OR REPLACE FUNCTION my_function(...) ...;

-- Realtime publications: Wrap in exception handler
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE my_table;
EXCEPTION WHEN duplicate_object THEN
  NULL; -- Already in publication, ignore
END $$;

-- Columns: Use IF NOT EXISTS
ALTER TABLE my_table ADD COLUMN IF NOT EXISTS new_column TYPE;
```

### RPC Function Permissions for Public Access
If a function needs to be called by anonymous users (like share link viewing):

```sql
-- SECURITY DEFINER bypasses RLS but still needs EXECUTE grant
CREATE OR REPLACE FUNCTION get_share_data(p_token TEXT)
RETURNS ... AS $$ ... $$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to both anon and authenticated roles
GRANT EXECUTE ON FUNCTION get_share_data(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION get_share_data(TEXT) TO authenticated;
```

### Deploying Migrations
```bash
# Check pending migrations
npx supabase db push --dry-run

# Apply migrations
npx supabase db push

# Deploy edge functions (after migration changes)
npx supabase functions deploy function-name --no-verify-jwt
```

### Common Pitfalls That Break Migrations
1. ❌ `CREATE POLICY` without `DROP POLICY IF EXISTS` first
2. ❌ `CREATE TRIGGER` without `DROP TRIGGER IF EXISTS` first
3. ❌ `ALTER PUBLICATION ... ADD TABLE` without exception handling
4. ❌ Forgetting `GRANT EXECUTE` for functions called by anonymous users
5. ❌ Changing function parameter names without updating client code
6. ✅ Always test migrations with `--dry-run` first
7. ✅ Check client code parameter names match function parameter names

## Development Workflow Rules

### 1. Plan Before Coding
**Before writing any code, describe the approach and wait for approval.**

- For non-trivial changes, explain WHAT will change, WHERE (which files), and WHY this approach
- Ask clarifying questions if requirements are ambiguous - don't assume
- This is especially critical for:
  - Database schema changes (migrations can't be easily undone)
  - Auth-related code (see Auth guidelines above)
  - Edge function changes (deployed to production immediately)
  - Changes touching shared services or types

**Example of good planning:**
```
To fix the share link thumbnail issue, I'll:
1. Check what columns actually exist in vibe_variants table
2. Update get_share_data function to use correct column name
3. Create a new migration (not modify existing ones)
4. Update base migration for future deployments

Should I proceed?
```

### 2. Keep Changes Small
**If a task requires changes to more than 3 files, stop and break it into smaller tasks first.**

- Large changes are harder to review, test, and debug
- If something breaks, smaller changes make it easier to identify the cause
- Each task should have a single, clear purpose
- Commit after each logical unit of work

**How to break down large tasks:**
1. Identify the dependencies between changes
2. Find the smallest change that provides value or unblocks other work
3. Implement and verify each piece before moving on

### 3. Anticipate Failure Points
**After writing code, list what could break and suggest tests to cover it.**

For every change, consider:
- **Database changes**: What if the column doesn't exist? What if types don't match?
- **API changes**: What if the endpoint returns an error? What about auth failures?
- **UI changes**: What if data is loading? Empty? Malformed?
- **Edge functions**: What if the external API (Anthropic, OpenAI) is overloaded?

**Example post-implementation checklist:**
```
Changes made: Updated get_share_data to use screenshot_url

What could break:
- Old deployments might still reference thumbnail_url
- Variants without screenshot_url will return null
- Share links created before this migration

Suggested tests:
- Test share link with variant that has screenshot_url
- Test share link with variant that has no screenshot (should fallback to screen.thumbnail)
- Test share link with expired token
```

### 4. Test-Driven Bug Fixing
**When there's a bug, start by writing a test that reproduces it, then fix it until the test passes.**

This approach:
- Proves you understand the bug before attempting to fix it
- Prevents the same bug from reappearing (regression)
- Documents the expected behavior

**Bug fix workflow:**
1. Reproduce the bug manually, note the exact steps
2. Write a test that fails in the same way
3. Fix the code until the test passes
4. Verify the manual reproduction no longer occurs
5. Commit both the test and the fix together

### 5. Learn From Corrections
**Every time a correction is made, add a new rule to this file so it never happens again.**

When something goes wrong:
1. Understand the root cause (not just the symptom)
2. Document it in the appropriate section of this file
3. Include both the ❌ pitfall and ✅ correct approach

**Recent additions from corrections:**
- Column name mismatches: Always verify actual schema before referencing columns in SQL
- Migration idempotency: Use DROP IF EXISTS patterns (see Migration guidelines)
- Function permissions: GRANT EXECUTE to anon for public-facing RPC functions

---

## Schema Reference - Common Column Name Gotchas

These column names have caused bugs due to inconsistent naming:

| Table | Column | NOT This |
|-------|--------|----------|
| `screens` | `thumbnail` | ~~thumbnail_url~~ |
| `vibe_variants` | `screenshot_url` | ~~thumbnail_url~~ |
| `vibe_sessions` | (no thumbnail) | ~~thumbnail_url~~ - join with `screens` |

**Always verify column names** by checking the migration files or running:
```sql
SELECT column_name FROM information_schema.columns WHERE table_name = 'table_name';
```
