# Product Requirements Document: Project Bento

**Document Version:** 2.0 (Locked Foundation Specification)  
**Target Host Application:** Microsoft PowerPoint (Windows Desktop, macOS Desktop, PowerPoint on the Web)  
**Architecture Model:** Shared TypeScript Engine & UI + Platform Host Adapters (Windows VSTO, Office.js, macOS `.dmg` Companion)  
**Build Workflow:** Systems architecture via Gemini; autonomous implementation and verification via Google Antigravity

---

## 0. Locked Foundational Decisions

Every section of this specification obeys these 10 locked architectural decisions. Do not deviate from them without explicit approval.

| # | Decision Area | Locked Choice | Rationale |
| :--- | :--- | :--- | :--- |
| **1** | **Anchor & State Persistence** | **Anchorless Mirrored State:** Read placeholder bounds, delete placeholder cleanly (inside the Undo entry), and mirror compact `BENTO_STATE` JSON (including `anchorRect` + monotonic `revision`) across every cell's `Shape.Tags`. | Eliminates ghost shapes in the Selection Pane, avoids `Shape.visible` gaps on Office.js builds under `PowerPointApi 1.10`, and keeps grids live even after copy/paste or deleting `slot_01`. |
| **2** | **Tech Stack & Tooling** | **`pnpm` workspaces + TypeScript 5.6+ (strict) + Vite 6 + React 19 + Tailwind CSS 4 + Vitest 2**; VSTO strictly on **`.NET Framework 4.8` + WebView2**. | VSTO requires `.NET Framework 4.8` (cannot run on `.NET 8`). React + Tailwind builds a crisp `320px` task pane cleanly; Vitest enables instant headless property testing. |
| **3** | **Locked Cells + Randomize/Count** | **Subtree-Freeze BSP Re-Partitioning:** Any split node with a locked descendant freezes its axis and ratio; only unlocked sibling subtrees re-randomize or change box count. | Preserves 100% pure BSP invariants (exact perimeter fit, zero overlaps, clean Delete-to-Reflow) while guaranteeing locked cells shift by `0.00pt`. |
| **4** | **Gutter & Perimeter Math** | **Recursive Inset Subtraction** (`avail = total - g`, `child2 = avail - child1`) with `0.01pt` precision (`round2`). | Keeps outer edges flush to `anchorRect`, internal gaps strictly `g` points, and eliminates cumulative floating-point drift on right/bottom edges. |
| **5** | **`0pt` Corner Radius Shape Type** | **Always `RoundedRectangle`** (`msoShapeRoundedRectangle` / `roundRectangle`), setting corner adjustment to `0.0` when `radiusPt === 0`. | Sliding radius between `0pt` and `32pt` mutates in-place without destroying/recreating shapes or risking user text loss. |
| **6** | **Merge Behavior** | **Direct BSP Siblings Only** (MVP); UI enables **Merge** only when exactly 2 sibling cells are selected and displays a clear tooltip otherwise. | Prevents destructive tree corruption while covering primary manual layout edits; arbitrary adjacent-rectangle rotation is deferred to V2. |
| **7** | **Multi-Slide Source Behavior** | **VSTO:** Duplicates active slide (`Slide.Duplicate()`) and clears only existing bento cells. **Office.js:** Inserts slides matching active `slideMasterId` + `layoutId` (`PowerPointApi 1.3`). | Preserves corporate deck chrome (titles, logos, footers, slide numbers) instead of inserting sterile blank slides. |
| **8** | **Task Pane Form Factor** | **Strict `320px` Vertical Rail** (`min-width: 280px`, `max-width: 420px`, zero horizontal scroll), adaptive Light/Dark tokens, collapsible secondary drawers. | Matches PowerPoint's native side task pane width across Windows, Mac, and Web without cramped or clipped controls. |
| **9** | **Content Deletion Safety** | **Off-Slide Stash (`slideWidth + 24pt`):** Shrinking Count never deletes shapes containing non-whitespace text or images; empty shapes delete silently. | Guarantees zero accidental copy loss during live slider exploration. |
| **10** | **Office.js Live Drag UX** | **60fps Minimap Preview + `150ms` Debounced Commit** (flushed on `pointerup`) + 25-step in-pane Undo/Redo stack. | Prevents Office.js `context.sync()` queue pileups while giving instant visual feedback inside the task pane. |

---

## 1. Product Overview & Architectural Mandate

**Project Bento** is a non-destructive, geometry-accurate bento grid layout engine for Microsoft PowerPoint. A user selects any bounding shape on a slide, invokes the add-in, and manipulates responsive sliders (box count, gutter, corner radius, hero bias, seed randomization, and surface styles) to generate **100% native, editable PowerPoint shapes** fitted exactly to that bounding area. Deleting any box on the slide and clicking **Reflow** mathematically heals the empty space without disturbing unaffected cells.

### Strict Three-Layer Architecture
1. **`@bento/core`** â€” Pure TypeScript math, BSP layout tree, deterministic PRNG, diff engine, and style tokens. **Zero DOM, React, Office.js, or Windows COM imports.**
2. **`@bento/contract`** â€” Shared TypeScript interfaces (`IBentoHost`, `HostCapabilities`, JSON-RPC bridge envelope, `Shape.Tags` schema, error codes).
3. **`@bento/ui`** â€” Single React/Tailwind task pane bundle (`320px` rail) consumed identically by:
   * **`packages/browser-harness`** (Phase 0 â€” SVG slide simulator + MockHost for visual & automated QA)
   * **`hosts/windows-vsto`** (Phase 1 â€” `.NET Framework 4.8` VSTO Add-in + WebView2 Custom Task Pane + COM Adapter)
   * **`hosts/office-js`** (Phase 2 â€” Cross-platform Office.js Add-in targeting `PowerPointApi 1.4` baseline and `1.10` enhancements)
   * **`hosts/mac-dmg`** (Phase 3 â€” Optional macOS floating `WKWebView` + `.ppam`/AppleScript bridge)

---

## 2. Locked Technical Stack & Runtime Requirements

| Layer | Technology | Version / Constraint |
| :--- | :--- | :--- |
| **Monorepo / Package Manager** | `pnpm` workspaces | Node `20 LTS`+, `pnpm 9+` |
| **Language** | TypeScript | `5.6+`, `"strict": true`, `"noUncheckedIndexedAccess": true` |
| **Bundler** | Vite | `6.x` (local asset output for WebView2 & static HTTPS for Office.js) |
| **UI Framework** | React + Tailwind CSS | React `19.x`, Tailwind `4.x` (custom accessible sliders & SVG minimap) |
| **Test Runner** | Vitest | `2.x` + property-based invariant test harness |
| **Windows VSTO Host** | C# / VSTO / WebView2 | **`.NET Framework 4.8`** (mandatory for VSTO), `Microsoft.Office.Interop.PowerPoint`, `Microsoft.Web.WebView2.WinForms`, `Newtonsoft.Json` |
| **Office.js Host** | Office Add-in JS API | `@microsoft/office-js`, baseline `PowerPointApi 1.3` (Tags, Layout) & `1.4` (Shapes, TextFrame), progressive enhancement `PowerPointApi 1.10` (`Shape.adjustments`, `Presentation.pageSetup`, `Slide.themeColorScheme`) |

---

## 3. Mathematical Specification & Core Algorithms (`@bento/core`)

### 3.1 Canonical Coordinate System & Geometric Invariants
* All coordinates and dimensions are strictly in **points (`pt`)**, top-left origin `(0, 0)`.
* Helper: `round2(n: number): number = Math.round(n * 100) / 100`.
* **Geometric Invariants (must hold for every generated or mutated layout):**
  1. **Zero Overlap:** For all distinct leaf pairs `(A, B)`, intersection area equals `0`.
  2. **Exact Perimeter Fit:** Union bounding box of all leaves equals `anchorRect` within `0.02pt` tolerance.
  3. **Exact Internal Gutter:** Every adjacent pair of cells separated by an internal split has an edge-to-edge gap equal to `gutterPt` within `0.02pt`.
  4. **Minimum Dimension Floor:** Every leaf satisfies `width >= minW` and `height >= minH` (unless `anchorRect` itself is smaller than `minW` or `minH`, in which case `count` clamps to `1` and emits `CONTAINER_TOO_SMALL`).
  5. **Valid Corner Adjustment:** Every leaf satisfies `0 <= cornerAdjustment <= 0.5`.

### 3.2 Exact BSP Tree Data Schema

```typescript
export type SplitAxis = 'vertical' | 'horizontal'; // vertical = left|right; horizontal = top/bottom
export type CellRole = 'standard' | 'hero' | 'image';

export interface RectPt {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface BspSplitNode {
  kind: 'split';
  nodeId: string;
  axis: SplitAxis;
  ratio: number;           // Fraction of available space (total - gutter) given to child A, in (0, 1)
  first: BspNode;          // Left (vertical) or Top (horizontal)
  second: BspNode;         // Right (vertical) or Bottom (horizontal)
}

export interface BspLeafNode {
  kind: 'leaf';
  nodeId: string;
  slotId: string;          // Stable shape mapping ID, e.g. "slot_01"
  role: CellRole;
  locked: boolean;
  customStyleOverride?: boolean;
}

export type BspNode = BspSplitNode | BspLeafNode;

export type StylePresetId =
  | 'soft-modern'
  | 'swiss-editorial'
  | 'elevated-cards'
  | 'dark-surface'
  | 'tonal-flat'
  | 'wireframe';

export type HierarchyMode = 'uniform' | 'hero-accent' | 'tonal-ramp';

export interface BentoParams {
  count: number;           // Integer, [2..maxCount], default 5
  gutterPt: number;        // Number, [0..36], step 1, default 10
  radiusPt: number;        // Number, [0..32], step 1, default 12
  heroBias: number;        // Number, [0..1], step 0.05, default 0.5
  seed: number;            // Unsigned 32-bit integer [1..999999]
  stylePreset: StylePresetId;
  hierarchyMode: HierarchyMode;
  morphEnabled: boolean;   // Default false (true when generating multi-slide with morph)
}

export interface BentoDocumentState {
  schemaVersion: '1.0';
  bentoId: string;         // e.g. "bnt_7k2m9x"
  revision: number;        // Monotonic integer incremented on every mutation
  anchorRect: RectPt;
  params: BentoParams;
  tree: BspNode;
  nextSlotSeq: number;     // Monotonic counter for assigning unique slotIds
}
```

### 3.3 Deterministic PRNG & Seed Code Grammar
* Use **Mulberry32** exclusively (`Math.random()` is strictly forbidden in `@bento/core`):

```typescript
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

* **Seed Code Format:** `B{count}-{seed}` (e.g., `B5-48219`). Regex: `/^B(\d{1,2})-(\d{1,6})$/i`.
* Typing or pasting a valid seed code immediately parses `count` and `seed` and deterministically regenerates the tree for the active `anchorRect` and `heroBias`.

### 3.4 Recursive Gutter & Rect Resolution Algorithm
Given a `BspNode`, bounding `rect: RectPt`, and `gutterPt: number`:
* If `node.kind === 'leaf'`, emit `{ leaf: node, rect }`.
* If `node.kind === 'split'`:
  * **Vertical (`first` = left, `second` = right):**
    * `availW = Math.max(0, rect.width - gutterPt)`
    * `w1 = round2(availW * node.ratio)`
    * `w2 = round2(availW - w1)` (exact remainder subtraction prevents edge drift)
    * `rectFirst = { left: rect.left, top: rect.top, width: w1, height: rect.height }`
    * `rectSecond = { left: round2(rect.left + w1 + gutterPt), top: rect.top, width: w2, height: rect.height }`
  * **Horizontal (`first` = top, `second` = bottom):**
    * `availH = Math.max(0, rect.height - gutterPt)`
    * `h1 = round2(availH * node.ratio)`
    * `h2 = round2(availH - h1)`
    * `rectFirst = { left: rect.left, top: rect.top, width: rect.width, height: h1 }`
    * `rectSecond = { left: rect.left, top: round2(rect.top + h1 + gutterPt), width: rect.width, height: h2 }`

### 3.5 Minimum Cell Guard & Dynamic Max Count
* Define minimum cell dimensions per container:
  * `minW = Math.max(48, Math.min(96, round2(anchorRect.width * 0.12)))`
  * `minH = Math.max(48, Math.min(96, round2(anchorRect.height * 0.12)))`
* A rectangle `(W, H)` can split **vertically** iff `W - gutterPt >= 2 * minW`, and **horizontally** iff `H - gutterPt >= 2 * minH`.
* For any valid split along axis length `L` with minimum side `minS`:
  * `rMin = minS / (L - gutterPt)`
  * `rMax = 1 - rMin`
  * All sampled ratios MUST be clamped strictly inside `[rMin, rMax]`.
* **Dynamic Max Count (`computeMaxCount`):**
  * `maxCols = Math.max(1, Math.floor((anchorRect.width + gutterPt) / (minW + gutterPt)))`
  * `maxRows = Math.max(1, Math.floor((anchorRect.height + gutterPt) / (minH + gutterPt)))`
  * `maxCount = Math.min(16, maxCols * maxRows)` (hard upper cap of `16` boxes for slide legibility).

### 3.6 Tree Generation & Hero Bias (`0.0` to `1.0`)
1. Initialize single root leaf covering `anchorRect`.
2. **Hero Anchor Step** (when `count >= 3` and `heroBias > 0.15`):
   * Pick axis favoring the container's longer side (for widescreen `W / H >= 1.2`, vertical split probability = `0.75`; for tall `H / W >= 1.2`, horizontal split probability = `0.75`).
   * Compute hero ratio `rHero`: interpolate from `[0.45, 0.55]` at low bias up to `[0.42, 0.58]` at `heroBias = 1.0`, clamped to `[rMin, rMax]`.
   * Flip a seeded coin to put the Hero on `first` (left/top, `65%` probability) or `second` (right/bottom, `35%`).
   * Mark the hero leaf `role: 'hero'`. Exempt it from further splits whenever `heroBias >= 0.5` (below `0.5`, allow splitting only if no other splittable leaf exists).
3. **Iterative Subdivision** until `leafCount === targetCount` or no splittable leaf remains:
   * Score every splittable, unlocked leaf:
     * At `heroBias = 0`: deterministically pick the leaf with the **largest area** (jitter `Â±5%`) and split along its **longest valid axis** with ratio in `[0.42, 0.58]`.
     * As `heroBias` increases toward `1.0`: allow asymmetric ratios in `[0.30, 0.70]` (clamped to `[rMin, rMax]`) and weight selection toward `area^1.5` so remaining tiles cluster cleanly beside the hero without creating slivers.
   * **Stable `slotId` Remapping:** When re-rolling an existing bento, preserve existing `slotId`s cleanly (`slot_01` maps to Hero if present, then remaining surviving `slotId`s in top-to-bottom, left-to-right reading order) so typed text never vanishes or jumps off-slide on Randomize.

### 3.7 Locked-Cell Preservation Algorithm (Subtree Freeze)
When the user triggers **Randomize** or drags **Count** while one or more leaves have `locked: true`:
1. Compute `hasLockedDescendant(node)` bottom-up for every node in the current tree.
2. If **every** leaf is locked: abort mutation and return error code `ALL_CELLS_LOCKED`.
3. Walk the tree top-down:
   * If `node.kind === 'split'` and **neither** child has a locked descendant: this entire subtree is unlockedâ€”re-partition it freely using the current seed and target leaf quota for that subtree.
   * If `node.kind === 'split'` and **exactly one** child has locked descendants: **freeze** `node.axis` and `node.ratio` (guaranteeing `0.00pt` shift for the locked subtree) and assign all leaf count deltas and randomization strictly to the unlocked sibling subtree.
   * If **both** children have locked descendants: freeze `node.axis` and `node.ratio`, and recurse into both children, distributing leaf count changes proportionally to unlocked leaf capacity on each side.

### 3.8 Delete-and-Reflow (Gap Healing) Algorithm
Input: Current `BspNode` tree + `survivingSlotIds: Set<string>` read from the active slide.
1. Define recursive `pruneMissing(node): BspNode | null`:
   * If `node.kind === 'leaf'`: return `survivingSlotIds.has(node.slotId) ? node : null`.
   * If `node.kind === 'split'`:
     * `newFirst = pruneMissing(node.first)`
     * `newSecond = pruneMissing(node.second)`
     * If both `null`: return `null` (entire bento deleted).
     * If `newFirst === null`: return `newSecond` (expands `second` cleanly into `node`'s full parent rect).
     * If `newSecond === null`: return `newFirst` (expands `first` cleanly into `node`'s full parent rect).
     * Otherwise return `{ ...node, first: newFirst, second: newSecond }`.
2. Update `params.count` to match surviving leaf count and increment `revision`.
3. Run layout resolution & diffâ€”every surviving cell outside the healed subtree stays untouched; sibling cells expand flush into the empty space with exact `gutterPt` and recalculated `cornerAdjustment`.

### 3.9 Direct Split & Merge Rules
* **Split H / Split V (`splitLeaf(tree, slotId, axis)`):**
  * Verify leaf's resolved rect meets `minW`/`minH` for the chosen axis; if not, return `CONTAINER_TOO_SMALL`.
  * Replace leaf with `BspSplitNode` (`ratio: 0.5`), placing original leaf (preserving its `slotId`, text, and role) as `first` and a new leaf (`nextSlotSeq++`) as `second`.
* **Merge (`mergeLeaves(tree, slotIdA, slotIdB)`):**
  * Locate parent `P` whose direct children are leaf `A` and leaf `B`.
  * If `A` and `B` are not direct BSP siblings: return `NON_SIBLING_MERGE` (UI disables Merge when non-siblings are selected, with tooltip: *"Only adjacent paired boxes can be merged"*).
  * Replace `P` with leaf `A` (preserving `A`'s `slotId` and content) and retire `B` via the safe off-slide stash rule.

### 3.10 Mathematically Uniform Corner Radius Formula
All bento cells are created as `RoundedRectangle` shapesâ€”even when `radiusPt === 0`.
For any cell with dimensions `(W_cell, H_cell)`:

```text
a = round4(min(0.5, max(0, radiusPt / min(W_cell, H_cell))))
```

* **VSTO & Mac VBA:** `shape.Adjustments[1] = (float)a;` (1-based index).
* **Office.js (`PowerPointApi 1.10`+):** `shape.adjustments.set(0, a);` (0-based index).
* **Office.js (under `1.10`):** Capability flag `supportsCornerRadius === false`; adapter skips adjustment call and UI disables the Corner Radius slider with an informational badge.

### 3.11 Reading Order & Auto-Morph Naming
* Sort resolved leaves deterministically:
  1. `role === 'hero'` first (if any),
  2. Then ascending `Math.round(rect.top / 12)` (row band tolerance of `12pt`),
  3. Then ascending `rect.left`.
* Assign `zOrderIndex` (`0..N-1`) in this exact order so Tab/Selection Pane reading order matches visual hierarchy.
* When `morphEnabled === true`, set PowerPoint shape `Name` to `!!bento_01`, `!!bento_02`, ..., `!!bento_{NN}` following this exact sorted order. When `morphEnabled === false`, set `Name` to `Bento Card {NN}`.

### 3.12 Non-Destructive Layout Diff & Safe Stashing
`computeLayoutDiff(prevState, nextState, existingSlideSlots)` outputs:
* **`update`**: Cells whose `slotId` exists on the slideâ€”mutate geometry, corner radius, z-order, and tags in-place without touching `TextRange.Text` or user formatting.
* **`create`**: New `slotId`sâ€”create `RoundedRectangle`, apply active style preset + text padding, write tags.
* **`retireSlotIds`**: Cells removed by Count reduction or Merge:
  * Host inspects `shape.TextFrame.TextRange.Text.trim().length` (and whether shape has an image fill):
  * If empty: delete shape cleanly.
  * If non-empty: strip its `BENTO_*` tags, move it neatly to `(slideWidth + 24, 36 + stashIndex * 110)` (scaled to max `200pt` wide if oversized), and return `stashedCount` so UI shows a non-blocking toast: *"Moved N card(s) with content off-slide so nothing was lost."*

---

## 4. State Persistence & Cross-Host Portability

### Anchorless Mirrored `Shape.Tags` Schema
Every live Bento cell stores identical uppercase keys in PowerPoint's native `Shape.Tags` collection (supported on VSTO, Mac VBA, and `PowerPointApi 1.3`+):

| Tag Key | Example Value | Notes |
| :--- | :--- | :--- |
| `BENTO_SCHEMA` | `"1.0"` | Schema version for forward migrations |
| `BENTO_ID` | `"bnt_7k2m9x"` | Shared group identifier across all cells in one bento |
| `BENTO_SLOT_ID` | `"slot_01"` | Unique leaf identifier within `BENTO_ID` |
| `BENTO_REV` | `"14"` | Monotonic integer string for conflict resolution |
| `BENTO_STATE` | `"{...minified JSON...}"` | Full `BentoDocumentState` (under `2 KB` for up to 16 cells) |

**Hydration Rules (when selecting any Bento cell):**
1. Read `BENTO_ID` from the selected shape.
2. Scan all shapes on the active slide matching that `BENTO_ID`.
3. Select the `BENTO_STATE` tag with the highest `BENTO_REV` integer.
4. Compare surviving `BENTO_SLOT_ID`s on the slide against leaves in `state.tree`:
   * If all leaves are present: hydrate sliders & minimap cleanly.
   * If leaves are missing: highlight missing cells in the minimap with a dashed warning badge and enable the pulsing **"Reflow Gaps"** button.
5. **Copy-Paste Collision Guard:** If two shapes on the same slide share the same `BENTO_ID` and `BENTO_SLOT_ID`, set `hasDuplicateSlotConflict = true` and show a clear recovery warning rather than corrupting both grids.

---

## 5. Style Token System & Typography Specification

### 5.1 WCAG 2.1 Auto-Contrast Formula
For any solid fill hex `#RRGGBB`, normalize channels `R, G, B` in `[0, 1]`:
* `c_lin = (c <= 0.04045) ? (c / 12.92) : ((c + 0.055) / 1.055) ^ 2.4`
* `L = 0.2126 * R_lin + 0.7152 * G_lin + 0.0722 * B_lin`
* If `L > 0.179`, set default text color to **Dark Ink** (`#111827` / `msoThemeColorText1`).
* Otherwise, set default text color to **Light Ink** (`#FFFFFF` / `msoThemeColorBackground1`).

### 5.2 Engineered Surface Archetypes (Exact COM & Hex Tokens)

| Preset ID | Default Radius | Fill (VSTO `msoThemeColor` + `TintAndShade`) | Fill Fallback (Office.js Hex) | Border Weight / Color / Transparency | Shadow (`VSTO`/`Mac` only) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`soft-modern`** | `16pt` | `Background1` (`-0.04` light / `+0.08` dark) | `#F4F5F7` | `0.75pt` / `Text1` / `0.88` transparency | None |
| **`swiss-editorial`** | `2pt` | `Background1` (`0.0`) | `#FFFFFF` | `1.0pt` / `Text1` / `0.78` transparency | None |
| **`elevated-cards`** | `14pt` | `Background1` (`0.0`) | `#FFFFFF` | `0.5pt` / `Text1` / `0.92` (Office.js fallback: `0.75pt`, `#E2E8F0`) | `Blur: 18pt`, `OffsetX: 0`, `OffsetY: 6pt`, `Transparency: 0.90`, `Color: #0F172A` |
| **`dark-surface`** | `14pt` | `Text1` (`+0.06`, clamped dark) | `#18181B` | `1.0pt` / `#FFFFFF` / `0.86` transparency | None |
| **`tonal-flat`** | `12pt` | `Accent1` (`+0.85` base) | `#EEF2FF` | No Line (`Visible = false`) | None |
| **`wireframe`** | `8pt` | No Fill (`Visible = false`) | Transparent | `1.0pt` dashed / `#64748B` / `0.35` transparency | None |

### 5.3 Hierarchy Modes
* **`uniform`**: All cells receive identical base preset styling.
* **`hero-accent`**: Leaf marked `role === 'hero'` receives `Accent1` (`TintAndShade = 0.0`, fallback `#2563EB`), zero border (unless wireframe), and auto-contrasted text color. All non-hero cells use the base preset.
* **`tonal-ramp`**: Non-hero cells cycle gently across three adjacent neutral/accent `TintAndShade` steps (`-0.02`, `-0.06`, `-0.10` on light themes; `+0.04`, `+0.09`, `+0.14` on dark themes).

### 5.4 Default TextFrame Styling (Applied on Cell Creation Only)
Never overwrite user-customized fonts during layout slider drags. On `create` only:
* `marginLeft = 16`, `marginRight = 16`, `marginTop = 14`, `marginBottom = 14` (points)
* Vertical anchor: `Top` (`msoAnchorTop` / `PowerPoint.ShapeTextVerticalAlignment.top`)
* Horizontal alignment: `Left`
* Word wrap: `true`; Auto-size: `None` (prevents PowerPoint from expanding box heights and breaking the grid)

### 5.5 Eyedropper ("Sync from Selected Box") & Image Slot
* **Sync from Selected Box:** Reads Fill (type, color, transparency), Line (visible, weight, color, transparency), and TextFrame margins from the single selected bento cell and propagates them to all other `role === 'standard'` cells in that `BENTO_ID` (leaving `hero` and `image` cells intact).
* **Image Slot Mode:**
  * On **VSTO / Mac**: Sets `role: 'image'`, enables `Fill.UserPicture(path)` with aspect-preserving crop-to-fill math, and optionally toggles a bottom linear gradient scrim (`0%` to `65%` `#000000` from `55%` to `100%` height) for white bottom-aligned captions.
  * On **Office.js**: Sets `role: 'image'`, applies `shape.fill.setImage(base64)` via task pane file picker, and hides the gradient scrim toggle via `supportsImageCropScrim === false`.

---

## 6. UI / UX & Task Pane Specification (`@bento/ui`)

### 6.1 Layout Constraints
* Designed strictly for a **`320px` wide vertical task pane** (`min-width: 280px`, `max-width: 420px`, zero horizontal scrollbars).
* Minimalist, high-contrast neutral UI (crisp `1px` hairlines, tabular numerals for all pt/seed readouts, Light/Dark mode support).

### 6.2 Section Hierarchy (Top to Bottom)
1. **Header Bar (`40px`):** Brand wordmark + compact Undo / Redo buttons (shown when `!capabilities.supportsNativeUndoGrouping`) + **Sync** icon button (shown when `!capabilities.supportsSelectionEvents`).
2. **Entry State (when no Bento is active):**
   * Primary CTA: **"Create Bento in Selected Shape"** (displays live dimensions of selected shape, e.g., `640 Ã— 380 pt`).
   * Secondary CTA: **"Auto-Fit Slide Content Area"** (computes safe margins below slide title zone).
3. **Interactive Minimap (`160px` max height):**
   * Proportional SVG replica of the active `anchorRect` and all leaf cells, rendering corner radii, gutters, Hero accent fill, lock icons, image icons, and red-dashed missing-cell indicators.
   * Clicking any tile selects it in the minimap and opens a compact inline pill toolbar directly beneath the map: **`Lock`** | **`Hero`** | **`Image`** | **`Split V`** | **`Split H`** | **`Delete`**.
   * `Shift+Click` two sibling tiles enables **`Merge`**.
4. **Core Sliders (Always Visible):**
   * **Boxes:** `2` to `maxCount` (step `1`, default `5`)
   * **Gutter:** `0pt` to `36pt` (step `1`, default `10pt`)
   * **Radius:** `0pt` to `32pt` (step `1`, default `12pt`; disabled with tooltip if `!supportsCornerRadius`)
   * **Hero Bias:** `0%` to `100%` (step `5%`, default `50%`)
5. **Primary Action Row (Always Visible):**
   * **`Randomize`** button + Seed Back/Forward arrows + editable monospace Seed Code pill (`B5-48219`).
   * **`Reflow Gaps`** button (prominently highlighted whenever missing cells are detected on the slide).
6. **Collapsible Drawers (Collapsed by default):**
   * **Styles & Hierarchy:** 2Ã—3 visual swatch grid of the 6 presets + `Uniform / Hero Accent / Tonal Ramp` segmented control + **"Sync Style from Selected Card"** button.
   * **Multi-Slide Generator:** Mode toggle (**Exploration** vs. **Deck Builder**), Slide Count (`2`â€“`12`, default `4`), **Auto-Morph Naming (`!!`)** toggle, and **"Generate Slides"** CTA.
   * **Deck Cleanup:** **"Re-Sort Reading Order"** and **"Finalize / Detach Grid"** (strips `BENTO_*` tags before client delivery).

### 6.3 Standardized Error Codes & Recovery UX

| Error Code | Trigger | User-Facing Banner Message |
| :--- | :--- | :--- |
| `NO_SHAPE_SELECTED` | Create clicked with empty selection | *"Select a bounding shape on the slide, or use Auto-Fit Slide."* |
| `MULTI_SHAPE_SELECTED` | Create clicked with 2+ non-bento shapes | *"Select a single bounding shape to define the Bento area."* |
| `CONTAINER_TOO_SMALL` | Bounds or cell too narrow for `minW`/`minH` | *"Selected area is too small for this box count or split."* |
| `ALL_CELLS_LOCKED` | Randomize or Count change while all boxes locked | *"Unlock at least one card before randomizing or changing box count."* |
| `NON_SIBLING_MERGE` | Merge attempted on non-sibling cells | *"Only adjacent paired boxes can be merged."* |
| `DUPLICATE_SLOT_CONFLICT` | User copy-pasted grid onto same slide | *"Duplicate Bento cards detected on this slide. Select one grid or detach."* |
| `API_UNSUPPORTED` | Host lacks required API level | *"This PowerPoint version does not support [feature]. Core layout remains active."* |

---

## 7. Host Adapter & Bridge Protocol (`@bento/contract`)

### 7.1 `IBentoHost` Interface

```typescript
export interface HostCapabilities {
  platform: 'browser-harness' | 'vsto' | 'officejs' | 'mac-dmg';
  supportsCornerRadius: boolean;
  supportsNativeUndoGrouping: boolean;
  supportsLiveThemeBinding: boolean;
  supportsShadows: boolean;
  supportsAutoMorph: boolean;
  supportsSelectionEvents: boolean;
  supportsImageCropScrim: boolean;
  supportsSlideDuplication: boolean;
}

export interface SelectionContext {
  slideId: string;
  slideBounds: RectPt;                 // e.g. 960 x 540 pt for 16:9 widescreen
  selectedShapeCount: number;
  selectedShapeBounds?: RectPt;        // Populated if 1 non-bento shape selected
  activeBentoId?: string;
  hydratedStateJson?: string;          // Highest BENTO_REV state on slide
  survivingSlotIds: string[];          // All live slotIds for activeBentoId
  selectedSlotIds: string[];           // Currently selected bento cells
  hasDuplicateSlotConflict: boolean;
}

export interface CellRenderSpec {
  slotId: string;
  rect: RectPt;
  cornerAdjustment: number;            // [0..0.5]
  shapeName: string;                   // "!!bento_01" or "Bento Card 01"
  role: CellRole;
  locked: boolean;
  zOrderIndex: number;
  tags: Record<string, string>;        // BENTO_SCHEMA, BENTO_ID, BENTO_SLOT_ID, BENTO_REV, BENTO_STATE
}

export interface LayoutDiffPayload {
  bentoId: string;
  deletePlaceholderSelection: boolean; // True only on initial creation
  create: CellRenderSpec[];
  update: CellRenderSpec[];
  retireSlotIds: string[];
  commitUndoEntry: boolean;            // True on pointer-up; false during live VSTO drag
}

export interface CellStyleSpec {
  slotId: string;
  fillHex: string | null;              // null = transparent / no fill
  themeFillSlot?: 'Background1' | 'Text1' | 'Accent1';
  themeTintAndShade?: number;
  borderColorHex: string | null;
  borderWeightPt: number;
  borderTransparency: number;          // 0..1
  borderDashed: boolean;
  textColorHex: string;
  shadow?: {
    blurPt: number;
    offsetXPt: number;
    offsetYPt: number;
    transparency: number;
    colorHex: string;
  } | null;
}

export interface StyleApplyPayload {
  presetId: StylePresetId;
  hierarchyMode: HierarchyMode;
  cells: CellStyleSpec[];
  commitUndoEntry: boolean;
}

export interface MultiSlideItem {
  bentoId: string;
  cells: CellRenderSpec[];
  stylePayload: StyleApplyPayload;
  applyMorphTransition: boolean;
}

export interface IBentoHost {
  getCapabilities(): Promise<HostCapabilities>;
  getSelectionContext(): Promise<SelectionContext>;
  applyLayoutDiff(diff: LayoutDiffPayload): Promise<{ stashedCount: number }>;
  applyStyle(bentoId: string, payload: StyleApplyPayload): Promise<void>;
  syncStyleFromSelected(bentoId: string): Promise<void>;
  setImageSlot(bentoId: string, slotId: string, imageBase64: string, addScrim: boolean): Promise<void>;
  generateMultiSlides(items: MultiSlideItem[]): Promise<{ createdSlideCount: number }>;
  reorderReadingOrder(bentoId: string, orderedSlotIds: string[]): Promise<void>;
  detachBento(bentoId: string): Promise<void>;
  onSelectionChanged?(handler: () => void): () => void;
}
```

### 7.2 Windows VSTO + WebView2 Bridge Specification (Phase 1)
* **Runtime:** `.NET Framework 4.8`, VSTO PowerPoint Add-in, docked `CustomTaskPane` (`Width = 340` DIPs) hosting `Microsoft.Web.WebView2.WinForms.WebView2`.
* **Mandatory UserDataFolder:** Initialize `CoreWebView2Environment.CreateAsync(null, Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "ProjectBento", "WebView2"))`.
* **Local Asset Serving:** Map the compiled `@bento/ui` dist directory via `CoreWebView2.SetVirtualHostNameToFolderMapping("bento.local", distPath, CoreWebView2HostResourceAccessKind.Allow)`.
* **JSON-RPC 2.0 Envelope:**
  * Request (JS -> C#): `{ "id": "req_42", "method": "applyLayoutDiff", "params": { ... } }`
  * Response (C# -> JS): `{ "id": "req_42", "result": { "stashedCount": 0 } }` or `{ "id": "req_42", "error": { "code": "...", "message": "..." } }`
  * Event (C# -> JS): `{ "event": "selectionChanged" }` fired from `Application.WindowSelectionChange` (debounced `80ms` on UI thread).
* **COM Threading & Undo Discipline:** Execute all PowerPoint COM mutations on the main STA UI thread. Call `Application.StartNewUndoEntry()` immediately before committing any pointer-up mutation batch.

### 7.3 Office.js Adapter Specification (Phase 2)
* **Capability Detection at Boot:**
  ```typescript
  const has110 = Office.context.requirements.isSetSupported('PowerPointApi', '1.10');
  ```
* **Slide Bounds Fallback:** Read `context.presentation.pageSetup.slideWidth/slideHeight` when `has110` is `true`; default to `960 x 540 pt` when `false`.
* **Slider Throttling:** Update `@bento/ui` minimap at 60fps during drag; debounce `applyLayoutDiff` by `150ms` (flush immediately on `pointerup`) through a single-flight async queue.
* **Multi-Slide Creation:** Match active slide's `slideMasterId` + `layoutId` (`PowerPointApi 1.3`) via `context.presentation.slides.add(...)`.

### 7.4 macOS `.dmg` Companion Adapter Specification (Phase 3 â€” Deferred Until Post-Phase 2)
* Lightweight Swift `WKWebView` floating palette hosting `@bento/ui`, paired with a signed/notarized `.dmg` installing a `.ppam` ribbon launcher and `.scpt` AppleScript bridge.

---

## 8. Monorepo Directory Structure

```text
project-bento/
â”œâ”€â”€ docs/
â”‚   â”œâ”€â”€ PRD.md                        # Implementation Specification v2.0
â”‚   â”œâ”€â”€ ANTIGRAVITY_RULES.md          # Hard engineering guardrails
â”‚   â””â”€â”€ PHASE0_KICKOFF_PROMPT.md      # Phase 0 execution prompt & audit checklist
â”œâ”€â”€ packages/
â”‚   â”œâ”€â”€ contract/                     # @bento/contract (types, RPC protocol, error codes)
â”‚   â”œâ”€â”€ core/                         # @bento/core (pure TS math, BSP, diff, styles + Vitest)
â”‚   â”œâ”€â”€ ui/                           # @bento/ui (320px React + Tailwind task pane)
â”‚   â””â”€â”€ browser-harness/              # Phase 0 QA app: 16:9 SVG Slide + MockHost + Host Switcher
â”œâ”€â”€ hosts/
â”‚   â”œâ”€â”€ windows-vsto/                 # Phase 1: .NET 4.8 VSTO + WebView2 + COM Adapter
â”‚   â”œâ”€â”€ office-js/                    # Phase 2: Office.js manifest + PowerPointApi Adapter
â”‚   â””â”€â”€ mac-dmg/                      # Phase 3: Swift WKWebView + .ppam/.scpt
â”œâ”€â”€ package.json
â”œâ”€â”€ pnpm-workspace.yaml
â””â”€â”€ tsconfig.base.json
```

---

## 9. Phased Execution & Automated Verification Plan

### Phase 0: Foundation Core, UI & Browser Visual Harness
* **Scope:** `@bento/contract`, `@bento/core`, `@bento/ui`, and `packages/browser-harness`.
* **Harness Capability Switcher:** Toggle `MockBentoHost` live between **Simulate VSTO**, **Simulate Office.js (1.10)**, and **Simulate Office.js (1.4 Legacy)**.
* **Automated Exit Gate:**
  * `invariants.test.ts`: **1,000 seeds x 5 aspect ratios** (`16:9` full, half-slide tall, wide banner, square, tiny `160x120pt`) across `count = 2..12`, `gutter = 0..32`, `heroBias = 0, 0.5, 1.0`. Assert zero overlap, exact perimeter fit (`<= 0.02pt`), exact internal gutters (`<= 0.02pt`), `minW`/`minH` respected, and `0 <= cornerAdjustment <= 0.5`.
  * `locks-reflow.test.ts`: Assert locked leaves stay pixel-identical (`0.00pt` delta) through 50 randomizations and Count mutations; assert deleting 1, 2, or 3 arbitrary leaves and calling `reflow` restores 100% container coverage; assert `split` followed by `merge` restores exact parent bounds.
  * `styles.test.ts`: Assert WCAG relative luminance contrast flipping and valid token mapping for all 6 presets and 3 hierarchy modes.
  * **Browser Visual QA:** Draw bounding shape on 16:9 SVG canvas -> Create Bento -> scrub all 4 sliders -> type text into 2 boxes -> lock 1 box -> randomize -> delete 2 boxes -> Reflow -> shrink count to verify off-slide text stashing -> cycle all 6 styles -> switch capability modes -> preview 4 multi-slide variations.

### Phase 1: Flagship Desktop Host (`hosts/windows-vsto`)
* `.NET Framework 4.8` VSTO add-in + WebView2 Custom Task Pane + COM Adapter.

### Phase 2: Cross-Platform Host (`hosts/office-js`)
* Office.js manifest + `OfficeJsBentoHost.ts` + cross-platform verification (Windows M365, Mac, Web) + VSTO-to-Office.js deck portability test.

### Phase 3: V2 Upgrades & Optional macOS `.dmg`
* "Bento-fy" existing content, staggered entrance animations, team JSON seed libraries, and optional signed/notarized macOS `.dmg` companion bridge.
