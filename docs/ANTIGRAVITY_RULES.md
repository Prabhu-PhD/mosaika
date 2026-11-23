# Antigravity Engineering Guardrails â€” Project Bento

These rules are **non-negotiable invariants** for every agent session in this repository. Violating any rule fails review and must be corrected immediately.

---

## Rule 1 â€” Strict Layer Isolation (`@bento/core`)
* **DO:** Keep `packages/core` 100% pure, deterministic TypeScript. It may only import from `@bento/contract`.
* **DO NOT:** Import `react`, `react-dom`, `window`, `document`, `Office`, or any COM/platform API inside `packages/core`.
* **DO NOT:** Use `Math.random()` or `Date.now()` inside layout, split, merge, or style algorithms. Every random decision must pull exclusively from `mulberry32(seed)`.

## Rule 2 â€” Invariants Before UI or Hosts
* **DO:** Implement and pass 100% of `@bento/core` Vitest suites (`invariants.test.ts`, `locks-reflow.test.ts`, `styles.test.ts`) across 1,000 seeds and 5 container aspect ratios **before** creating any files in `packages/ui`, `packages/browser-harness`, or `hosts/`.
* **DO:** Compute split remainders via subtraction (`w2 = round2(availW - w1)`, `h2 = round2(availH - h1)`) rather than `round2(avail * (1 - ratio))` so zero floating-point drift accumulates on outer right/bottom edges.

## Rule 3 â€” Capability-Gated UI (`@bento/ui`)
* **DO:** Gate every conditional button, slider disable state, Undo/Redo visibility, Sync button, and style fallback strictly on `HostCapabilities` boolean properties returned by `IBentoHost.getCapabilities()`.
* **DO NOT:** Check `navigator.userAgent`, `process.platform`, or `capabilities.platform === 'vsto'` to branch feature behavior inside `@bento/ui`.

## Rule 4 â€” Non-Destructive Content Guarantee
* **DO:** Preserve existing `slotId`s cleanly across `Randomize`, `Gutter`, `Radius`, `Hero Bias`, and `Reflow` mutations so user text inside cards stays intact.
* **DO:** When `Count` decreases or two cells `Merge`, inspect retired shapes for non-whitespace text or image fills. Delete only empty shapes; move non-empty shapes cleanly off-slide (`left = slideWidth + 24pt`) and strip their `BENTO_*` tags.
* **DO NOT:** Silently destroy a PowerPoint shape containing user text or imagery.

## Rule 5 â€” Always `RoundedRectangle`
* **DO:** Create every bento cell as a `RoundedRectangle` (`msoShapeRoundedRectangle` / `roundRectangle`), setting its normalized corner adjustment to `0.0` whenever `radiusPt === 0`.
* **DO NOT:** Swap shape geometry types between Rectangle and RoundedRectangle on slider movement.
* **DO:** Respect host indexing differences: `1`-based (`Adjustments[1]`) in VSTO/VBA, `0`-based (`adjustments.set(0, a)`) in Office.js `PowerPointApi 1.10`.

## Rule 6 â€” Single-Flight Async Execution & Atomic Undo
* **DO:** Serialize all async `IBentoHost` mutations (`applyLayoutDiff`, `applyStyle`, etc.) through a single-flight queue/lock so rapid slider drags never commit out of order.
* **DO:** In Office.js, update the in-pane minimap at 60fps during slider drag and debounce host `context.sync()` commits (`150ms`, flushing immediately on `pointerup`).
* **DO:** In VSTO, execute COM mutations strictly on the main STA UI thread and wrap pointer-up commits in `Application.StartNewUndoEntry()`.

## Rule 7 â€” Strict Phase Boundaries & .NET 4.8 Discipline
* **DO NOT:** Scaffold or touch anything inside `hosts/` during Phase 0.
* **DO:** When entering Phase 1 (`hosts/windows-vsto`), target **`.NET Framework 4.8`** exclusively (never `.NET 6/8/9`) and initialize WebView2 with an explicit `UserDataFolder` under `%LOCALAPPDATA%\ProjectBento\WebView2`.
* **DO:** Keep `@bento/ui` strictly within a `320px` vertical rail (`min-width: 280px`, `max-width: 420px`, zero horizontal scrollbars).
