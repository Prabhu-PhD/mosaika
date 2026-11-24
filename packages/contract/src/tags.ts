export const BENTO_SCHEMA_VERSION = '1.0' as const;

export const BENTO_TAGS = {
  SCHEMA: 'BENTO_SCHEMA',
  ID: 'BENTO_ID',
  SLOT_ID: 'BENTO_SLOT_ID',
  REV: 'BENTO_REV',
  STATE: 'BENTO_STATE',
} as const;

export type BentoTagKey = (typeof BENTO_TAGS)[keyof typeof BENTO_TAGS];

export const BENTO_TAG_KEYS: readonly BentoTagKey[] = [
  BENTO_TAGS.SCHEMA,
  BENTO_TAGS.ID,
  BENTO_TAGS.SLOT_ID,
  BENTO_TAGS.REV,
  BENTO_TAGS.STATE,
] as const;

export const BENTO_OFFSLIDE_OFFSET_PT = 24;
export const BENTO_STASH_TOP_START_PT = 36;
export const BENTO_STASH_ROW_STEP_PT = 110;
export const BENTO_STASH_MAX_WIDTH_PT = 200;
