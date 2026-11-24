import type { BentoDocumentState } from '@bento/contract';

export const MAX_UNDO_STEPS = 25;

export interface UndoHistory {
  past: BentoDocumentState[];
  future: BentoDocumentState[];
}

export function createEmptyUndoHistory(): UndoHistory {
  return { past: [], future: [] };
}

export function pushUndoSnapshot(
  history: UndoHistory,
  previousState: BentoDocumentState
): UndoHistory {
  const nextPast = [...history.past, previousState];
  const trimmed =
    nextPast.length > MAX_UNDO_STEPS
      ? nextPast.slice(nextPast.length - MAX_UNDO_STEPS)
      : nextPast;
  return { past: trimmed, future: [] };
}

export function popUndo(
  history: UndoHistory,
  currentState: BentoDocumentState
): { history: UndoHistory; state: BentoDocumentState } | null {
  if (history.past.length === 0) {
    return null;
  }
  const previous = history.past[history.past.length - 1]!;
  const nextPast = history.past.slice(0, -1);
  const nextFuture = [currentState, ...history.future].slice(0, MAX_UNDO_STEPS);
  return {
    history: { past: nextPast, future: nextFuture },
    state: previous,
  };
}

export function popRedo(
  history: UndoHistory,
  currentState: BentoDocumentState
): { history: UndoHistory; state: BentoDocumentState } | null {
  if (history.future.length === 0) {
    return null;
  }
  const next = history.future[0]!;
  const nextFuture = history.future.slice(1);
  const nextPast = [...history.past, currentState].slice(-MAX_UNDO_STEPS);
  return {
    history: { past: nextPast, future: nextFuture },
    state: next,
  };
}

export interface SeedHistory {
  seeds: number[];
  index: number;
}

export function createSeedHistory(initialSeed: number): SeedHistory {
  return { seeds: [initialSeed], index: 0 };
}

export function pushSeed(history: SeedHistory, seed: number): SeedHistory {
  if (history.seeds[history.index] === seed) {
    return history;
  }
  const truncated = history.seeds.slice(0, history.index + 1);
  truncated.push(seed);
  const trimmed = truncated.length > 50 ? truncated.slice(truncated.length - 50) : truncated;
  return { seeds: trimmed, index: trimmed.length - 1 };
}
