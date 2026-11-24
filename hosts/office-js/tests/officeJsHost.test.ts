import { describe, expect, it } from 'vitest';
import { BENTO_OFFSLIDE_OFFSET_PT, BENTO_TAGS } from '@bento/contract';
import {
  buildCellRenderSpecs,
  computeLayoutDiff,
  computeStylePayload,
  createIntentBentoDocument,
  generateMultiSlideItems,
  hydrateStateFromJson,
  regenerateWithLocks,
} from '@bento/core';
import { OfficeJsBentoHost } from '../src/OfficeJsBentoHost.js';
import type {
  OfficeRequestContext,
  OfficeRuntimeAdapter,
  OfficeShape,
  OfficeSlide,
  OfficeTagItem,
} from '../src/officeRuntime.js';

interface MockOfficeShape extends OfficeShape {
  shapeType: string;
  deleted: boolean;
  adjustmentZero: number | null;
  zOrderCalls: string[];
  tagStore: Map<string, string>;
}

interface MockOfficeSlide extends OfficeSlide {
  shapeList: MockOfficeShape[];
  createdFrom?: { slideMasterId?: string; layoutId?: string };
}

function createMockOfficeEnvironment(options: {
  has110: boolean;
  slideWidth?: number;
  slideHeight?: number;
  theme?: 'light' | 'dark';
}) {
  let shapeSeq = 1;
  let slideSeq = 1;
  const slides: MockOfficeSlide[] = [];
  let selectedShapeIds: string[] = [];

  function makeShape(
    type: string,
    opts?: { left?: number; top?: number; width?: number; height?: number }
  ): MockOfficeShape {
    const tagStore = new Map<string, string>();
    const shape: MockOfficeShape = {
      id: `sh_${shapeSeq++}`,
      name: 'Shape',
      shapeType: type,
      left: opts?.left ?? 0,
      top: opts?.top ?? 0,
      width: opts?.width ?? 100,
      height: opts?.height ?? 100,
      deleted: false,
      adjustmentZero: null,
      zOrderCalls: [],
      tagStore,
      tags: {
        get items(): OfficeTagItem[] {
          return Array.from(tagStore.entries()).map(([key, value]) => ({ key, value }));
        },
        load() {
          return this;
        },
        add(key: string, value: string) {
          // Simulate PowerPoint tag key normalization
          tagStore.set(key.toUpperCase(), value);
        },
        delete(key: string) {
          tagStore.delete(key.toUpperCase());
        },
      },
      fill: {
        type: 'Solid',
        foregroundColor: '#F4F5F7',
        transparency: 0,
        load() {
          return this;
        },
        clear() {
          this.type = 'NoFill';
          this.foregroundColor = undefined;
        },
        setSolidColor(color: string) {
          this.type = 'Solid';
          this.foregroundColor = color;
        },
      },
      lineFormat: {
        visible: false,
        color: '#111827',
        weight: 0.75,
        transparency: 0,
        dashStyle: 'Solid',
        load() {
          return this;
        },
      },
      textFrame: {
        textRange: {
          text: '',
          font: {
            color: '#111827',
            load() {
              return this;
            },
          },
          load() {
            return this;
          },
        },
        leftMargin: 0,
        rightMargin: 0,
        topMargin: 0,
        bottomMargin: 0,
        wordWrap: true,
        verticalAlignment: 'Top',
        load() {
          return this;
        },
      },
      adjustments: {
        set(index: number, value: number) {
          if (index === 0) shape.adjustmentZero = value;
        },
      },
      load() {
        return this;
      },
      delete() {
        this.deleted = true;
      },
      setZOrder(position) {
        this.zOrderCalls.push(position);
      },
    };
    return shape;
  }

  function makeSlide(createdFrom?: { slideMasterId?: string; layoutId?: string }): MockOfficeSlide {
    const shapeList: MockOfficeShape[] = [];
    const slide: MockOfficeSlide = {
      id: `slide_${slideSeq++}`,
      shapeList,
      createdFrom,
      slideMaster: {
        id: createdFrom?.slideMasterId ?? 'master_corporate_01',
        load() {
          return this;
        },
      },
      layout: {
        id: createdFrom?.layoutId ?? 'layout_title_and_content',
        load() {
          return this;
        },
      },
      shapes: {
        get items(): OfficeShape[] {
          return shapeList.filter((s) => !s.deleted);
        },
        load() {
          return this;
        },
        addGeometricShape(type, opts) {
          const sh = makeShape(type, opts);
          shapeList.push(sh);
          return sh;
        },
      },
      load() {
        return this;
      },
    };
    slides.push(slide);
    return slide;
  }

  const firstSlide = makeSlide();

  const runtime: OfficeRuntimeAdapter = {
    isRequirementSetSupported(name: string, version: string): boolean {
      if (name !== 'PowerPointApi') return false;
      if (version === '1.10') return options.has110;
      return true;
    },
    getOfficeTheme() {
      return options.theme ?? 'light';
    },
    async run<T>(callback: (context: OfficeRequestContext) => Promise<T>): Promise<T> {
      const context: OfficeRequestContext = {
        presentation: {
          pageSetup: {
            slideWidth: options.slideWidth ?? 960,
            slideHeight: options.slideHeight ?? 540,
            load() {
              return this;
            },
          },
          slides: {
            get items() {
              return slides;
            },
            load() {
              return this;
            },
            add(addOpts) {
              return makeSlide(addOpts);
            },
          },
          getSelectedSlides() {
            return {
              items: [slides[0]!],
              load() {
                return this;
              },
              add: () => makeSlide(),
            };
          },
          getSelectedShapes() {
            const active = slides[0]!;
            return {
              get items() {
                return active.shapeList.filter(
                  (s) => !s.deleted && selectedShapeIds.includes(s.id)
                );
              },
              load() {
                return this;
              },
              addGeometricShape: active.shapes.addGeometricShape,
            };
          },
        },
        async sync() {
          // No-op in mock
        },
      };
      return callback(context);
    },
  };

  return {
    runtime,
    slides,
    firstSlide,
    setSelectedShapeIds(ids: string[]) {
      selectedShapeIds = ids;
    },
    makeShape,
  };
}

describe('@bento/office-js OfficeJsBentoHost', () => {
  it('detects PowerPointApi 1.10 vs 1.4 capabilities and slide bounds fallback accurately', async () => {
    const env110 = createMockOfficeEnvironment({
      has110: true,
      slideWidth: 720,
      slideHeight: 540,
    });
    const host110 = new OfficeJsBentoHost(env110.runtime);
    const caps110 = await host110.getCapabilities();
    expect(caps110.platform).toBe('officejs');
    expect(caps110.supportsCornerRadius).toBe(true);
    expect(caps110.supportsLiveThemeBinding).toBe(true);
    expect(caps110.supportsNativeUndoGrouping).toBe(false);
    expect(caps110.supportsCustomGeometry).toBe(false);

    const ctx110 = await host110.getSelectionContext();
    expect(ctx110.slideBounds).toEqual({ left: 0, top: 0, width: 720, height: 540 });

    const env14 = createMockOfficeEnvironment({
      has110: false,
      slideWidth: 720,
      slideHeight: 540,
    });
    const host14 = new OfficeJsBentoHost(env14.runtime);
    const caps14 = await host14.getCapabilities();
    expect(caps14.supportsCornerRadius).toBe(false);
    expect(caps14.supportsLiveThemeBinding).toBe(false);

    // PRD Section 7.3: fallback to 960x540 when PowerPointApi 1.10 is unavailable
    const ctx14 = await host14.getSelectionContext();
    expect(ctx14.slideBounds).toEqual({ left: 0, top: 0, width: 960, height: 540 });
  });

  it('always creates RoundRectangle with 0-based adjustments.set(0, a) and stashes non-empty retired cards off-slide', async () => {
    const env = createMockOfficeEnvironment({ has110: true });
    const host = new OfficeJsBentoHost(env.runtime);

    // Create initial 5-card layout
    const created = createIntentBentoDocument(
      { left: 48, top: 108, width: 864, height: 390 },
      'executive-brief',
      { count: 5, radiusPt: 12, seed: 48219 }
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const diff1 = computeLayoutDiff(null, created.value, new Set(), {
      commitUndoEntry: true,
      supportsCustomGeometry: false,
    });
    await host.applyLayoutDiff(diff1);

    const liveShapes = env.firstSlide.shapeList.filter((s) => !s.deleted);
    expect(liveShapes).toHaveLength(5);
    for (const sh of liveShapes) {
      expect(sh.shapeType).toBe('RoundRectangle');
      expect(sh.adjustmentZero).not.toBeNull();
      expect(sh.adjustmentZero!).toBeGreaterThan(0);
      expect(sh.adjustmentZero!).toBeLessThanOrEqual(0.5);
    }

    // Type user text into slot_05, leave slot_04 empty, then shrink count 5 -> 3
    const slot05Shape = liveShapes.find((s) => s.tagStore.get(BENTO_TAGS.SLOT_ID) === 'slot_05')!;
    slot05Shape.textFrame!.textRange.text = 'Q4 Board Notes';

    const shrunk = regenerateWithLocks(created.value, { count: 3 });
    expect(shrunk.ok).toBe(true);
    if (!shrunk.ok) return;

    const diff2 = computeLayoutDiff(
      created.value,
      shrunk.value,
      new Set(['slot_01', 'slot_02', 'slot_03', 'slot_04', 'slot_05']),
      { commitUndoEntry: true, supportsCustomGeometry: false }
    );
    const { stashedCount } = await host.applyLayoutDiff(diff2);

    expect(stashedCount).toBe(1);
    // slot_05 was preserved off-slide at x = slideWidth + 24 with all BENTO_* tags stripped
    expect(slot05Shape.deleted).toBe(false);
    expect(slot05Shape.left).toBe(960 + BENTO_OFFSLIDE_OFFSET_PT);
    expect(slot05Shape.textFrame!.textRange.text).toBe('Q4 Board Notes');
    expect(slot05Shape.tagStore.has(BENTO_TAGS.ID)).toBe(false);
    expect(slot05Shape.tagStore.has(BENTO_TAGS.STATE)).toBe(false);

    // Empty slot_04 was cleanly deleted
    const slot04Shape = liveShapes.find((s) => s.tagStore.get(BENTO_TAGS.SLOT_ID) === 'slot_04')!;
    expect(slot04Shape.deleted).toBe(true);
  });

  it('supports seamless VSTO -> Office.js -> VSTO deck portability via identical Shape.Tags', async () => {
    const env = createMockOfficeEnvironment({ has110: true });
    const host = new OfficeJsBentoHost(env.runtime);

    // Simulate a slide originally created on Windows VSTO (even using a Puzzle intent!)
    const vstoDoc = createIntentBentoDocument(
      { left: 48, top: 108, width: 864, height: 390 },
      'puzzle',
      { count: 4, seed: 10002 }
    );
    expect(vstoDoc.ok).toBe(true);
    if (!vstoDoc.ok) return;

    const vstoSpecs = buildCellRenderSpecs(vstoDoc.value, { supportsCustomGeometry: true });
    for (const spec of vstoSpecs) {
      const sh = env.firstSlide.shapes.addGeometricShape('RoundRectangle', spec.rect);
      sh.name = spec.shapeName;
      for (const [k, v] of Object.entries(spec.tags)) {
        sh.tags.add(k, v);
      }
      if (spec.slotId === 'slot_01') {
        sh.textFrame!.textRange.text = 'Created in Windows VSTO';
      }
    }

    // Select one VSTO shape in Office.js (Mac / Web)
    env.setSelectedShapeIds([env.firstSlide.shapeList[0]!.id]);

    const sel = await host.getSelectionContext();
    expect(sel.activeBentoId).toBe(vstoDoc.value.bentoId);
    expect(sel.hydratedStateJson).toBeDefined();
    expect(sel.hasDuplicateSlotConflict).toBe(false);

    const hydrated = hydrateStateFromJson(sel.hydratedStateJson!);
    expect(hydrated).not.toBeNull();
    expect(hydrated!.bentoId).toBe(vstoDoc.value.bentoId);

    // Edit in Office.js (switch to Executive Brief) & commit back to slide
    const edited = regenerateWithLocks(hydrated!, { intent: 'executive-brief', count: 4 });
    expect(edited.ok).toBe(true);
    if (!edited.ok) return;

    const diff = computeLayoutDiff(hydrated!, edited.value, new Set(sel.survivingSlotIds), {
      commitUndoEntry: true,
      supportsCustomGeometry: false,
    });
    await host.applyLayoutDiff(diff);

    // Verify user text survived AND updated tags can be hydrated back cleanly by VSTO
    const slot01 = env.firstSlide.shapeList.find(
      (s) => !s.deleted && s.tagStore.get(BENTO_TAGS.SLOT_ID) === 'slot_01'
    )!;
    expect(slot01.textFrame!.textRange.text).toBe('Created in Windows VSTO');
    const roundTripped = hydrateStateFromJson(slot01.tagStore.get(BENTO_TAGS.STATE)!);
    expect(roundTripped?.params.intent).toBe('executive-brief');
    expect(roundTripped?.revision).toBe(edited.value.revision);
  });

  it('generates multi-slide variations matching active slideMasterId & layoutId and supports style, reorder, and detach', async () => {
    const env = createMockOfficeEnvironment({ has110: true });
    const host = new OfficeJsBentoHost(env.runtime);

    const doc = createIntentBentoDocument(
      { left: 48, top: 108, width: 864, height: 390 },
      'kpi-dashboard',
      { count: 5, seed: 48219 }
    );
    expect(doc.ok).toBe(true);
    if (!doc.ok) return;

    const diff = computeLayoutDiff(null, doc.value, new Set(), {
      commitUndoEntry: true,
      supportsCustomGeometry: false,
    });
    await host.applyLayoutDiff(diff);

    // Apply style & verify image fill is preserved
    const slot01 = env.firstSlide.shapeList[0]!;
    slot01.fill.type = 'Image';
    const stylePayload = computeStylePayload(doc.value, {
      supportsShadows: false,
      commitUndoEntry: true,
    });
    await host.applyStyle(doc.value.bentoId, stylePayload);
    expect(slot01.fill.type).toBe('Image');

    // Generate 3 multi-slide variations
    const items = generateMultiSlideItems(doc.value, {
      mode: 'deck-builder',
      slideCount: 3,
      morphNamingEnabled: true,
      supportsAutoMorph: false,
      styleOptions: { supportsShadows: false },
    });
    const { createdSlideCount } = await host.generateMultiSlides(items);
    expect(createdSlideCount).toBe(3);
    expect(env.slides).toHaveLength(4);
    expect(env.slides[1]!.createdFrom).toEqual({
      slideMasterId: 'master_corporate_01',
      layoutId: 'layout_title_and_content',
    });
    expect(env.slides[1]!.shapeList[0]!.name.startsWith('!!bento_')).toBe(true);

    // Reorder reading order & detach
    await host.reorderReadingOrder(doc.value.bentoId, ['slot_01', 'slot_02']);
    expect(slot01.zOrderCalls).toEqual(['BringToFront']);

    await host.detachBento(doc.value.bentoId);
    for (const sh of env.firstSlide.shapeList) {
      expect(sh.tagStore.size).toBe(0);
    }
  });
});
