# Phase 0 Kickoff Prompt & Audit Checklist

Copy and paste the prompt block below into **Google Antigravity (Planning Mode)** after opening the repository.

---

## Copy-Paste Prompt for Antigravity

```text
Read `docs/PRD.md` and `docs/ANTIGRAVITY_RULES.md` completely before creating any files.

We are executing **Phase 0 ONLY** (`@bento/contract`, `@bento/core`, `@bento/ui`, and `packages/browser-harness`). Do NOT scaffold or modify anything inside `hosts/` during this phase.

Work in three strict milestones and pause after creating your Implementation Plan artifact so I can approve it before you write code:

### Milestone 0A â€” Contract & Pure Math Engine
1. Verify and configure the `pnpm` workspace, `tsconfig.base.json` (`strict: true`, `noUncheckedIndexedAccess: true`), and package configs for `packages/contract` and `packages/core`.
2. Implement `@bento/contract` with `IBentoHost`, `HostCapabilities`, `SelectionContext`, `CellRenderSpec`, `LayoutDiffPayload`, `StyleApplyPayload`, `MultiSlideItem`, `BentoErrorCode`, and canonical `Shape.Tags` constants exactly as specified in `docs/PRD.md`.
3. Implement `@bento/core` (`prng.ts`, `geometry.ts`, `bsp.ts`, `diff.ts`, `styles.ts`, `index.ts`) with ZERO React, DOM, or Office imports and ZERO `Math.random()` usage.
4. Write and run Vitest suites (`invariants.test.ts`, `locks-reflow.test.ts`, `styles.test.ts`) testing 1,000 seeds across 5 aspect ratios (`16:9` full, half-slide tall, wide banner, square, tiny `160x120pt`). Do NOT proceed to Milestone 0B until 100% of `@bento/core` tests pass.

### Milestone 0B â€” Shared 320px UI & Interactive Browser Harness
1. Build `@bento/ui` strictly as a `320px`-wide vertical task pane (React 19 + Tailwind CSS 4) gated exclusively on `HostCapabilities`:
   - Header bar with capability-gated Undo/Redo and Sync buttons
   - Entry state (Selected shape dimensions + Create Bento + Auto-Fit Slide)
   - Interactive proportional SVG minimap with tile click toolbar (Lock, Hero, Image, Split V, Split H, Delete) and Shift+Click sibling Merge
   - Core sliders (Boxes, Gutter, Radius, Hero Bias) with tabular numeric readouts
   - Randomize + Seed Back/Forward + editable Seed Code (`B5-48219`) + Reflow Gaps button
   - Collapsible drawers: Styles & Hierarchy (all 6 archetypes + Uniform/Hero Accent/Tonal Ramp + Sync from Selected Card), Multi-Slide Generator (Exploration vs. Deck Builder + Auto-Morph toggle), Deck Cleanup (Re-Sort Reading Order + Finalize/Detach)
   - 25-step in-pane Undo/Redo history stack and non-blocking Toast/Error banners
2. Build `packages/browser-harness` pairing `@bento/ui` on the right (`320px` rail) with an interactive 16:9 (`960 x 540 pt`) SVG Slide Canvas on the left:
   - Draw a bounding rectangle on the slide canvas, type editable text inside generated bento cards, select/delete cards directly on the canvas, view the off-slide stash area (`x = 984pt`), and switch between generated multi-slide thumbnails.
   - Include a top Capability Simulator toggle: **VSTO** | **Office.js 1.10** | **Office.js 1.4 Legacy**.

### Milestone 0C â€” Verification
1. Run full workspace typecheck (`pnpm typecheck`), build (`pnpm build`), and Vitest suite (`pnpm test`).
2. Launch `browser-harness` in the browser tool and verify end-to-end: draw bounding box, create bento, scrub all 4 sliders, type text into 2 cards, lock 1 box and randomize, delete 2 boxes and reflow, shrink count to verify off-slide text stashing, cycle all 6 style presets, switch all 3 capability modes, and generate 4 multi-slide variations.
```

---

## 4-Point Plan Audit (Check Before Approving Antigravity's Plan)

1. **Zero `Math.random()` in `@bento/core`:** Confirm every random decision uses `mulberry32`.
2. **Remainder Subtraction on Splits:** Confirm `w2 = round2(availW - w1)` and `h2 = round2(availH - h1)` to guarantee zero edge drift.
3. **Stable `slotId` Remapping:** Confirm re-rolling (`Randomize`) keeps existing `slotId`s bound to surviving cards so text doesn't vanish or jump off-slide.
4. **Capability-Gated UI Only:** Confirm Undo/Redo, Corner Radius disable state, Sync button, and Shadow/Scrim visibility read strictly from `capabilities.*` booleansâ€”never `platform === 'vsto'`.

---

## Manual Exit Gate (Before Moving to Phase 1 VSTO)

Test these 4 scenarios yourself in the browser harness:
- [ ] **Extreme Containers:** Draw a tall sidebar (`220 x 460 pt`) and a wide strip (`880 x 140 pt`). Confirm Min-Size Guard and Hero Bias prevent skinny slivers.
- [ ] **Content Safety:** Type text into Box 5 and Box 6, reduce **Boxes** to `4`, and confirm those two cards move cleanly to the off-slide stash area (`x = 984pt`) without losing text.
- [ ] **Multi-Delete Reflow:** Delete two non-adjacent cards directly on the SVG canvas, click **Reflow Gaps**, and verify 100% bounding area recovery with uniform corner curves.
- [ ] **Legacy Capability Fallback:** Toggle the harness simulator to **Office.js 1.4 Legacy** and confirm Corner Radius disables with a tooltip, Undo/Redo appears in the header, and Elevated Cards falls back to crisp borders with zero console errors.
