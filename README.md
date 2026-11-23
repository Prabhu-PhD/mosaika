# Project Bento

A bounded, non-destructive Bento Grid layout engine for Microsoft PowerPoint built with a shared TypeScript core and platform host adapters (Windows VSTO + WebView2, Office.js, and optional macOS `.dmg`).

## Architecture Overview

- **`packages/contract`** (`@bento/contract`) â€” Shared `IBentoHost` interface, capability flags, `Shape.Tags` schema, and error codes.
- **`packages/core`** (`@bento/core`) â€” Pure TypeScript BSP tree engine, Mulberry32 deterministic randomizer, locked-cell subtree freeze, gap-healing reflow, uniform corner-radius math, and style tokens (zero DOM/Office deps).
- **`packages/ui`** (`@bento/ui`) â€” Single `320px` vertical React + Tailwind task pane UI gated strictly on `HostCapabilities`.
- **`packages/browser-harness`** â€” Interactive 16:9 SVG PowerPoint simulator + Capability Switcher (`VSTO` / `Office.js 1.10` / `Office.js 1.4`) for Phase 0 QA.
- **`hosts/`** â€” Platform adapters (untouched until Phase 1+):
  - `hosts/windows-vsto` (Phase 1 â€” `.NET Framework 4.8` + WebView2)
  - `hosts/office-js` (Phase 2 â€” Cross-platform M365 Web/Mac/Win)
  - `hosts/mac-dmg` (Phase 3 â€” Optional macOS `WKWebView` + `.ppam`/AppleScript bridge)

## Quickstart (Phase 0 Setup)

1. **Verify Toolchain:**
   ```bash
   node -v   # >= 20.0.0 (Node 20 LTS+)
   pnpm -v   # >= 9.0.0
   ```
2. **Initialize Git Baseline:**
   ```bash
   git init
   git add .
   git commit -m "docs: initialize Project Bento foundation spec and workspace skeleton"
   ```
3. **Launch in Google Antigravity:**
   - Open this folder in Antigravity.
   - Switch to **Planning Mode**.
   - Paste the prompt from `docs/PHASE0_KICKOFF_PROMPT.md`.

## Planned Workspace Scripts

Once Antigravity scaffolds the Phase 0 packages:
- `pnpm test` â€” Run all Vitest unit and property-based geometry tests
- `pnpm test:core` â€” Run `@bento/core` invariant tests only
- `pnpm typecheck` â€” Strict TypeScript check across all packages
- `pnpm build` â€” Build all workspace packages
- `pnpm dev:harness` â€” Launch the Phase 0 browser visual harness
