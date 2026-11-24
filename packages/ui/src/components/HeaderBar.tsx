import type { HostCapabilities } from '@bento/contract';
import { Redo2, RefreshCw, Undo2 } from 'lucide-react';
import { MosaikaLogo } from './MosaikaLogo.js';

export interface HeaderBarProps {
  capabilities: HostCapabilities;
  activeCardCount?: number;
  canUndo: boolean;
  canRedo: boolean;
  isSyncing: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onSync: () => void;
}

export function HeaderBar({
  capabilities,
  activeCardCount,
  canUndo,
  canRedo,
  isSyncing,
  onUndo,
  onRedo,
  onSync,
}: HeaderBarProps) {
  const showUndoRedo = !capabilities.supportsNativeUndoGrouping;
  const showSync = !capabilities.supportsSelectionEvents;

  return (
    <header
      className="flex h-[38px] shrink-0 items-center justify-between border-b border-[var(--bento-border)] bg-[var(--bento-bg)] px-3"
      aria-label="Mosaika Header"
    >
      <div className="flex items-center gap-1.5">
        <span className="flex h-5 w-5 items-center justify-center rounded-[2px] bg-[var(--bento-fg)] text-[var(--bento-accent-fg)]">
          <MosaikaLogo className="h-3.5 w-3.5" />
        </span>
        <span
          data-testid="mosaika-wordmark"
          className="text-[13.5px] font-semibold tracking-[-0.015em] text-[var(--bento-fg)]"
        >
          Mosaika
        </span>
        <span className="rounded-[2px] border border-[var(--bento-border)] px-1.5 font-mono text-[9.5px] leading-[15px] uppercase tracking-[0.04em] tabular-nums text-[var(--bento-fg-muted)]">
          {activeCardCount !== undefined ? `${activeCardCount} cards` : 'Swiss Grid'}
        </span>
      </div>

      <div className="flex items-center gap-1">
        {showUndoRedo && (
          <div className="flex items-center" role="group" aria-label="In-pane history">
            <button
              type="button"
              onClick={onUndo}
              disabled={!canUndo}
              title="Undo (Ctrl+Z)"
              aria-label="Undo"
              data-testid="btn-undo"
              className="flex h-6 w-6 items-center justify-center rounded-l-[2px] border border-[var(--bento-border-strong)] bg-[var(--bento-bg)] text-[var(--bento-fg)] transition-colors hover:bg-[var(--bento-well)] disabled:cursor-not-allowed disabled:opacity-35"
            >
              <Undo2 className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={onRedo}
              disabled={!canRedo}
              title="Redo (Ctrl+Shift+Z)"
              aria-label="Redo"
              data-testid="btn-redo"
              className="flex h-6 w-6 items-center justify-center rounded-r-[2px] border border-l-0 border-[var(--bento-border-strong)] bg-[var(--bento-bg)] text-[var(--bento-fg)] transition-colors hover:bg-[var(--bento-well)] disabled:cursor-not-allowed disabled:opacity-35"
            >
              <Redo2 className="h-3 w-3" />
            </button>
          </div>
        )}

        {showSync && (
          <button
            type="button"
            onClick={onSync}
            disabled={isSyncing}
            title="Sync selection from active slide"
            aria-label="Sync selection"
            data-testid="btn-sync"
            className="flex h-6 items-center gap-1 rounded-[2px] border border-[var(--bento-border-strong)] bg-[var(--bento-bg)] px-2 text-[11px] font-medium text-[var(--bento-fg)] transition-colors hover:bg-[var(--bento-well)] disabled:opacity-50"
          >
            <RefreshCw className={`h-3 w-3 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>Sync</span>
          </button>
        )}
      </div>
    </header>
  );
}
