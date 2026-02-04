# Agentic Flow UX Consistency Refactor

## Overview

Refactor the prototyping pipeline to ensure consistent UX across all stages, fix variant count propagation, and remove incorrectly implemented session history.

---

## Issues to Address

| # | Issue | Action |
|---|-------|--------|
| 1 | Session History implemented wrong | Remove code, plan version history later |
| 2 | Planning mode shows 2x2 grid incorrectly | Fix to use gallery view |
| 3 | Wireframe stage missing variant names | Add agent-generated titles |
| 4 | Wireframe stage not using gallery view | Make consistent with other stages |
| 5 | Variant count ignored after wireframing | Fix propagation through all stages |
| 6 | Post view toggle doesn't work on prototypes | Fix toggle functionality |

---

## View Philosophy

**CRITICAL: No 2x2 grid layout anywhere in the app.**

| Variant Count | View |
|---------------|------|
| 1 variant | Full screen |
| 2+ variants | Gallery view |
| Any variant focused | Full screen (with nav to others) |

Gallery view = responsive grid that shows all variants with equal prominence, scrollable if needed.

---

## Root Cause Analysis

### Variant Count Bug (Issue #5)

**Current (Broken) Flow:**
```
Planning Stage
├─ User selects variants pre defined button like inline answer inthe chat → selectedVariants = [1, 3]
├─ Stored in Zustand: useVibeStore.selectedVariants

Wireframing Stage
├─ generateVisualWireframes() receives selectedVariants ✅
├─ Only generates wireframes for [1, 3] ✅

Prototyping Stage
├─ Uses DIFFERENT state: generationMode + selectedVariantToGenerate
├─ handleBuildHighFidelity() IGNORES selectedVariants ❌
└─ Result: All 4 variants built even if user only selected 2
```

**Two disconnected selection systems:**
1. `selectedVariants` (Zustand store) - only used for wireframing
2. `generationMode` + `selectedVariantToGenerate` (local state) - only used for prototyping

**Solution:** Use `selectedVariants` from vibeStore as single source of truth throughout all stages.

---

## Implementation Plan

### Phase 1: Remove Session History Code

**File:** `src/pages/VibePrototyping.tsx`

**Remove these sections:**

1. **State declarations** (~lines 1533-1536):
   ```typescript
   // DELETE:
   const [sessionHistory, setSessionHistory] = useState<...>([]);
   const [sessionHistoryOpen, setSessionHistoryOpen] = useState(false);
   const [isDuplicatingSession, setIsDuplicatingSession] = useState(false);
   ```

2. **Handler function** (~lines 3594-3620):
   ```typescript
   // DELETE entire function:
   const handleDuplicateSession = async (sourceSessionId: string) => { ... }
   ```

3. **Session fetch in init effect** (~line 2131-2132):
   ```typescript
   // DELETE:
   const history = await getVibeSessionsForScreen(screenId);
   setSessionHistory(history);
   ```

4. **History button in toolbar** (~lines 5092-5108):
   ```typescript
   // DELETE the IconButton with ClockCounterClockwise icon
   ```

5. **Session History Drawer component** (~lines 6150-6296):
   ```typescript
   // DELETE entire Drawer component
   ```

6. **Import cleanup:**
   ```typescript
   // Remove from imports:
   import { getVibeSessionsForScreen } from '../services/variantPlanService';
   ```

---

### Phase 2: Fix Variant Count Propagation

**File:** `src/pages/VibePrototyping.tsx`

**Step 1: Remove redundant local state**
```typescript
// DELETE these lines:
const [generationMode, setGenerationMode] = useState<'single' | 'all'>('all');
const [selectedVariantToGenerate, setSelectedVariantToGenerate] = useState<number>(1);
```

**Step 2: Update handleBuildHighFidelity**
```typescript
// BEFORE (broken):
const plansToGenerate = generationMode === 'single'
  ? plan.plans.filter(p => p.variant_index === selectedVariantToGenerate)
  : plan.plans;

// AFTER (fixed):
const plansToGenerate = plan.plans.filter(p =>
  selectedVariants.includes(p.variant_index)
);
```

**Step 3: Remove generation mode toggle UI**
The toggle between "Single" and "All 4" should be removed since variant selection happens in planning stage.

---

### Phase 3: Add Variant Names to Wireframe Stage

**File:** `src/pages/VibePrototyping.tsx`

Currently wireframe cards show generic labels. Update to show plan titles:

```typescript
// In wireframe stage rendering, update CanvasVariantCard props:
<CanvasVariantCard
  label={plan.title}                              // e.g., "Modal Form Approach"
  sublabel={getVibeVariantLabel(plan.variant_index)}  // e.g., "Variant A"
  // ... other props
/>
```

**Update CanvasVariantCard interface** (~line 920):
```typescript
interface CanvasVariantCardProps {
  label: string;
  sublabel?: string;  // NEW: Secondary label for approach name
  // ... existing props
}
```

**Update CanvasVariantCard rendering** to display sublabel below main label.

---

### Phase 4: Consistent Gallery View Across Stages

**File:** `src/pages/VibePrototyping.tsx`

**Replace all 2x2 grid logic with:**

```typescript
// Helper to determine layout
const getLayoutForVariantCount = (count: number) => {
  if (count === 1) return 'fullscreen';
  return 'gallery';
};

// Grid styling based on layout
const getGridStyles = (layout: 'fullscreen' | 'gallery') => {
  if (layout === 'fullscreen') {
    return { width: '100%', height: '100%' };
  }
  // Gallery: responsive grid, all variants visible
  return {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
    gap: 2,
    p: 2,
    overflow: 'auto',
  };
};
```

**Apply to all stages:**
- `plan_ready` - while planning, the screen we start the feature from should be presented
- `wireframing` / `wireframe_ready` - Wireframe previews in gallery
- `generating` / `complete` - Prototype previews in gallery

**Focused view:**
When user clicks a variant to focus:
- That variant expands to full screen
- Small thumbnails on side for switching
- "Back to Gallery" button visible

---

### Phase 5: Fix Post View Toggle

**File:** `src/pages/VibePrototyping.tsx`

**Issue:** Toggle between wireframe/prototype view may not be connected properly.

**Verify these connections:**

1. Toggle updates state:
```typescript
<ToggleButtonGroup
  value={viewMode}
  onChange={(_, newMode) => newMode && setViewMode(newMode)}
>
```

2. viewMode passed to all CanvasVariantCard instances:
```typescript
<CanvasVariantCard
  viewMode={viewMode}  // Must be present
  // ...
/>
```

3. CanvasVariantCard uses viewMode to determine what to display:
```typescript
// Inside CanvasVariantCard:
{viewMode === 'wireframe' ? (
  // Show wireframe preview
) : (
  // Show prototype preview
)}
```

---

## Files Summary

| File | Changes |
|------|---------|
| `src/pages/VibePrototyping.tsx` | Remove session history, fix variant propagation, add sublabels, gallery consistency, fix toggle |
| `src/store/vibeStore.ts` | No changes needed |

---

## Verification Checklist

After implementation, verify:

- [ ] **Variant Count Propagation**
  - [ ] Select 2 variants in planning stage
  - [ ] Only 2 wireframes generated
  - [ ] Only 2 prototypes generated
  - [ ] Gallery shows only selected variants

- [ ] **View Consistency**
  - [ ] 1 variant = full screen at every stage
  - [ ] 2+ variants = gallery view at every stage
  - [ ] No 2x2 grid anywhere

- [ ] **Variant Names**
  - [ ] Wireframe cards show plan title
  - [ ] Sublabel shows "Variant A/B/C/D"

- [ ] **View Toggle**
  - [ ] Toggle switches between wireframe/prototype
  - [ ] Works in gallery view
  - [ ] Works in focused view

- [ ] **Session History Removed**
  - [ ] No History button in toolbar
  - [ ] No session drawer
  - [ ] App functions normally

---

## Not In Scope

- **Version History feature** - Separate task, will use existing `vibe_iterations` table
- **Canvas/WebGL wireframes** - Future enhancement
- **Sub-thread iteration** - Already implemented in previous session

---

## Questions / Decisions Needed

1. **Gallery scroll behavior**: Should gallery scroll vertically or use pagination? - scroll
2. **Variant card minimum size**: What's the minimum card size before gallery becomes scrollable? - shoudl be determined progrematically based on viewport size
3. **Focus transition**: Should focusing a variant be animated? - yes, subtle animation

---

## Approval

Once you've reviewed and edited this plan as needed, let me know and I'll begin implementation.
