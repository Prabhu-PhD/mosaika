export type BentoErrorCode =
  | 'NO_SHAPE_SELECTED'
  | 'MULTI_SHAPE_SELECTED'
  | 'CONTAINER_TOO_SMALL'
  | 'ALL_CELLS_LOCKED'
  | 'NON_SIBLING_MERGE'
  | 'DUPLICATE_SLOT_CONFLICT'
  | 'API_UNSUPPORTED';

export const BENTO_ERROR_MESSAGES: Record<BentoErrorCode, string> = {
  NO_SHAPE_SELECTED: 'Select a bounding shape on the slide, or use Auto-Fit Slide.',
  MULTI_SHAPE_SELECTED: 'Select a single bounding shape to define the Bento area.',
  CONTAINER_TOO_SMALL: 'Selected area is too small for this box count or split.',
  ALL_CELLS_LOCKED: 'Unlock at least one card before randomizing or changing box count.',
  NON_SIBLING_MERGE: 'Only adjacent paired boxes can be merged.',
  DUPLICATE_SLOT_CONFLICT: 'Duplicate Bento cards detected on this slide. Select one grid or detach.',
  API_UNSUPPORTED: 'This PowerPoint version does not support this feature. Core layout remains active.',
};

export function formatBentoErrorMessage(code: BentoErrorCode, featureName?: string): string {
  if (code === 'API_UNSUPPORTED' && featureName) {
    return `This PowerPoint version does not support ${featureName}. Core layout remains active.`;
  }
  return BENTO_ERROR_MESSAGES[code];
}

export class BentoError extends Error {
  public readonly code: BentoErrorCode;

  constructor(code: BentoErrorCode, message?: string) {
    super(message ?? BENTO_ERROR_MESSAGES[code]);
    this.name = 'BentoError';
    this.code = code;
  }
}

export type BentoResult<T> =
  | { ok: true; value: T; warning?: BentoErrorCode }
  | { ok: false; errorCode: BentoErrorCode; message: string };
