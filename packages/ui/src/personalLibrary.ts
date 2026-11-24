import type { BentoDocumentState, SavedBentoBlueprint } from '@bento/contract';
import { createSavedBlueprint } from '@bento/core';

const PERSONAL_LIBRARY_KEY = 'mosaika_saved_blueprints_v1';
const MAX_SAVED_BLUEPRINTS = 24;

export function loadSavedBlueprints(): SavedBentoBlueprint[] {
  try {
    if (typeof globalThis.localStorage === 'undefined') return [];
    const raw = globalThis.localStorage.getItem(PERSONAL_LIBRARY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is SavedBentoBlueprint =>
        Boolean(item) &&
        typeof item === 'object' &&
        typeof (item as SavedBentoBlueprint).id === 'string' &&
        typeof (item as SavedBentoBlueprint).name === 'string' &&
        Boolean((item as SavedBentoBlueprint).docSnapshot?.tree)
    );
  } catch {
    return [];
  }
}

export function persistSavedBlueprints(blueprints: readonly SavedBentoBlueprint[]): void {
  try {
    if (typeof globalThis.localStorage === 'undefined') return;
    globalThis.localStorage.setItem(
      PERSONAL_LIBRARY_KEY,
      JSON.stringify(blueprints.slice(0, MAX_SAVED_BLUEPRINTS))
    );
  } catch {
    // Ignore storage quota or blocked storage environments
  }
}

export function saveBlueprintToLibrary(
  existing: readonly SavedBentoBlueprint[],
  name: string,
  doc: BentoDocumentState
): { blueprint: SavedBentoBlueprint; nextList: SavedBentoBlueprint[] } {
  const id = `usr_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e4).toString(36)}`;
  const blueprint = createSavedBlueprint(name, doc, id, new Date().toISOString());
  const nextList = [blueprint, ...existing].slice(0, MAX_SAVED_BLUEPRINTS);
  persistSavedBlueprints(nextList);
  return { blueprint, nextList };
}

export function deleteBlueprintFromLibrary(
  existing: readonly SavedBentoBlueprint[],
  id: string
): SavedBentoBlueprint[] {
  const nextList = existing.filter((bp) => bp.id !== id);
  persistSavedBlueprints(nextList);
  return nextList;
}
