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
