import { describe, expect, it } from 'vitest';
import {
  buildCellRenderSpecs,
  buildEntranceAnimationSpec,
  createIntentBentoDocument,
} from '@bento/core';
import {
  decodeSharePayload,
  encodeSharePayload,
  exportToHtmlTailwind,
  exportToSvg,
} from '../src/exporters.js';
import { exportToPptxBytes } from '../src/pptxExporter.js';
import { parseNotesToBentoPlan, SAMPLE_NOTE_PROMPTS } from '../src/notesToBento.js';
import { computeArtboardContentRect } from '../src/presets.js';
import { STUDIO_SHOWCASES } from '../src/showcases.js';
import { WebStudioHost } from '../src/studioHost.js';
import {
  buildSquirclePath,
  extractDominantBrandColorFromRgba,
} from '../src/visualCraft.js';
import {
  buildQrMatrix,
  computeSparklineGeometry,
  parseChartBlock,
} from '../src/widgets.js';

describe('Mosaika Web Studio — exporters & live reflow', () => {
  it('exports valid pure-vector SVG with wrapped <tspan>, XML escaping, and zero <foreignObject>', () => {
    const host = new WebStudioHost({ skipDefaultSeed: false });
    const firstCard = host.getSnapshot().cards[0]!;
    host.updateCardText(firstCard.id, 'Q4 Growth & Metrics <2026>\nRevenue > "Target" & $10M ARR');

    const svg = exportToSvg(host.getSnapshot());

    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg.endsWith('</svg>')).toBe(true);
    expect(svg).not.toContain('<foreignObject');
    expect(svg).toContain('width="1440" height="900" viewBox="0 0 1440 900"');
    expect(svg).toContain('<tspan');
    expect(svg).toContain('Q4 Growth &amp; Metrics &lt;2026&gt;');
    expect(svg).toContain('Revenue &gt; &quot;Target&quot; &amp; $10M ARR');
  });

  it('exports custom <path> geometry for sculpted/puzzle L-wrap and circular layouts', () => {
    const host = new WebStudioHost({ skipDefaultSeed: true });
    const rect = computeArtboardContentRect(1080, 1080, 44);
    const puzzleDoc = createIntentBentoDocument(rect, 'puzzle', {
      count: 5,
      gutterPt: 14,
      radiusPt: 16,
      seed: 101,
    });
    expect(puzzleDoc.ok).toBe(true);
    if (!puzzleDoc.ok) return;

    host.hydrateFromSharePayload({
      w: 1080,
      h: 1080,
      pad: 44,
      bg: '#FFFFFF',
      accent: '#2563EB',
      state: puzzleDoc.value,
      texts: { slot_01: 'Interlocking Puzzle' },
    });

    const specs = buildCellRenderSpecs(puzzleDoc.value, { supportsCustomGeometry: true });
    expect(specs.some((s) => Boolean(s.svgPath))).toBe(true);

    const svg = exportToSvg(host.getSnapshot());
    expect(svg).toContain('<path d="');
    expect(svg).toContain('Interlocking Puzzle');
  });

  it('exports responsive HTML + Tailwind markup with aspect-ratio and percentage positioning', () => {
    const host = new WebStudioHost({ skipDefaultSeed: false });
    const card = host.getSnapshot().cards[0]!;
    host.updateCardText(card.id, 'Launch <Hero> & Copy\nSecond line "ready"');

    const html = exportToHtmlTailwind(host.getSnapshot());

    expect(html).toContain('aspect-ratio: 1440 / 900;');
    expect(html).toContain('max-width: 1440px;');
    expect(html).toContain('left:');
    expect(html).toContain('width:');
    expect(html).toContain('Launch &lt;Hero&gt; &amp; Copy');
    expect(html).toContain('Second line &quot;ready&quot;');
  });

  it('round-trips ShareableStudioPayload via UTF-8 safe base64url encoding', () => {
    const host = new WebStudioHost({ skipDefaultSeed: false });
    const card = host.getSnapshot().cards[0]!;
    host.updateCardText(card.id, 'Mosaika — Zürich Grid ✨ 100%');
    host.setBrandAccent('#2563EB');

    const payload = host.toSharePayload();
    expect(payload).not.toBeNull();
    if (!payload) return;

    const encoded = encodeSharePayload(payload);
    expect(encoded).not.toMatch(/[+/=]/);

    const decoded = decodeSharePayload(`#mosaika=${encoded}`);
    expect(decoded).not.toBeNull();
    expect(decoded?.w).toBe(1440);
    expect(decoded?.h).toBe(900);
    expect(decoded?.accent).toBe('#2563EB');
    expect(decoded?.texts[card.slotId]).toBe('Mosaika — Zürich Grid ✨ 100%');
    expect(decoded?.state.bentoId).toBe(payload.state.bentoId);

    expect(decodeSharePayload('not-valid-base64!!!')).toBeNull();
  });

  it('caches getSnapshot() referentially for React useSyncExternalStore stability', () => {
    const host = new WebStudioHost({ skipDefaultSeed: false });
    const s1 = host.getSnapshot();
    const s2 = host.getSnapshot();
    expect(s1).toBe(s2);

    host.setBrandAccent('#2563EB');
    const s3 = host.getSnapshot();
    expect(s3).not.toBe(s1);
    expect(host.getSnapshot()).toBe(s3);
  });

  it('reflows live across canvas sizes while preserving card copy and Brand Accent WCAG contrast', () => {
    const host = new WebStudioHost({ skipDefaultSeed: false });
    const hero = host.getSnapshot().cards.find((c) => c.role === 'hero')!;
    host.updateCardText(hero.id, 'Persistent Hero Headline');

    // Switch to bright amber accent -> dark ink or crisp contrast
    host.setBrandAccent('#2563EB');
    const cobaltHero = host.getSnapshot().cards.find((c) => c.role === 'hero')!;
    expect(cobaltHero.style.fillHex).toBe('#2563EB');
    expect(cobaltHero.style.textColorHex).toBe('#FFFFFF');

    // Reflow 1440x900 -> Instagram Square 1080x1080
    host.selectPreset('ig-square');
    const sq = host.getSnapshot();
    expect(sq.canvasWidth).toBe(1080);
    expect(sq.canvasHeight).toBe(1080);
    expect(sq.cards.find((c) => c.slotId === hero.slotId)?.text).toBe('Persistent Hero Headline');
    for (const c of sq.cards) {
      expect(c.rect.left).toBeGreaterThanOrEqual(43.9);
      expect(c.rect.left + c.rect.width).toBeLessThanOrEqual(1080 - 43.9);
      expect(c.rect.top + c.rect.height).toBeLessThanOrEqual(1080 - 43.9);
    }

    // Reflow -> A4 Portrait 794x1123
    host.selectPreset('a4-portrait');
    const a4 = host.getSnapshot();
    expect(a4.canvasWidth).toBe(794);
    expect(a4.canvasHeight).toBe(1123);
    expect(a4.cards.find((c) => c.slotId === hero.slotId)?.text).toBe('Persistent Hero Headline');
    for (const c of a4.cards) {
      expect(c.rect.left + c.rect.width).toBeLessThanOrEqual(794 - 43.9);
      expect(c.rect.top + c.rect.height).toBeLessThanOrEqual(1123 - 43.9);
    }
  });

  it('applies staggered entrance animations and emits CSS @keyframes in HTML+Tailwind export', async () => {
    const host = new WebStudioHost({ skipDefaultSeed: false });
    const doc = host.getSnapshot().activeDoc!;
    const spec = buildEntranceAnimationSpec(doc, 'rise-stagger');

    await host.applyEntranceAnimations(doc.bentoId, spec);
    const snap = host.getSnapshot();
    expect(snap.activeAnimation?.preset).toBe('rise-stagger');
    expect(snap.animationRunId).toBe(1);

    const html = exportToHtmlTailwind(snap);
    expect(html).toContain('@keyframes mosaika-enter');
    expect(html).toContain('translateY(24px)');
    expect(html).toContain('animation: mosaika-enter 0.5s');
  });

  it('exports valid native PowerPoint (.pptx) ZIP archives across landscape and square presets', async () => {
    const host = new WebStudioHost({ skipDefaultSeed: false });
    const bytes = await exportToPptxBytes(host.getSnapshot());

    // OOXML .pptx is a ZIP archive starting with PK\x03\x04
    expect(bytes.byteLength).toBeGreaterThan(8_000);
    expect(bytes[0]).toBe(0x50); // 'P'
    expect(bytes[1]).toBe(0x4b); // 'K'
    expect(bytes[2]).toBe(0x03);
    expect(bytes[3]).toBe(0x04);

    // Check archive central directory / entry names include PowerPoint slide1.xml
    const ascii = new TextDecoder('latin1').decode(bytes);
    expect(ascii).toContain('ppt/slides/slide1.xml');
    expect(ascii).toContain('[Content_Types].xml');

    // Also verify square Instagram 1080x1080 preset exports cleanly
    host.selectPreset('ig-square');
    const sqBytes = await exportToPptxBytes(host.getSnapshot());
    expect(sqBytes.byteLength).toBeGreaterThan(8_000);
    expect(sqBytes[0]).toBe(0x50);
    expect(sqBytes[1]).toBe(0x4b);
  });

  it('renders KPI blocks, Checklists, and Mesh/Sheen gradients in SVG, HTML, and share payloads', () => {
    const host = new WebStudioHost({ skipDefaultSeed: false });
    const cards = host.getSnapshot().cards;
    host.setCardSurfaceTreatment(cards[0]!.id, 'mesh');
    host.setCardBlockType(cards[1]!.id, 'kpi');
    host.setCardBlockType(cards[2]!.id, 'checklist');

    const snap = host.getSnapshot();
    const svg = exportToSvg(snap);
    expect(svg).toContain('<linearGradient id="grad-');
    expect(svg).toContain('<radialGradient id="mesh-');
    expect(svg).toContain('✓  ');

    const html = exportToHtmlTailwind(snap);
    expect(html).toContain('radial-gradient(');
    expect(html).toContain('tabular-nums');
    expect(html).toContain('<ul class="mt-2');

    const encoded = encodeSharePayload(host.toSharePayload()!);
    const decoded = decodeSharePayload(encoded);
    expect(decoded?.blocks?.[cards[1]!.slotId]).toBe('kpi');
    expect(decoded?.blocks?.[cards[2]!.slotId]).toBe('checklist');
    expect(decoded?.surfaces?.[cards[0]!.slotId]).toBe('mesh');
  });

  it('builds continuous Apple squircle Bezier paths and extracts dominant brand color from RGBA', () => {
    const sq = buildSquirclePath(300, 200, 24);
    expect(sq.startsWith('M ')).toBe(true);
    expect(sq).toContain(' C ');
    expect(sq.endsWith('Z')).toBe(true);

    const sharp = buildSquirclePath(300, 200, 0);
    expect(sharp).not.toContain(' C ');

    // 4 pixels: transparent, near-white background, and two vivid emerald pixels (#10B981)
    const rgba = new Uint8ClampedArray([
      255, 0, 0, 0,
      252, 252, 252, 255,
      16, 185, 129, 255,
      16, 185, 129, 255,
    ]);
    const extracted = extractDominantBrandColorFromRgba(rgba);
    expect(extracted.accentHex).toBe('#10B981');
  });

  it('supports drag-to-swap card contents, full Undo/Redo, and Wave 1 glass/aurora/font exports', () => {
    const host = new WebStudioHost({ skipDefaultSeed: false });
    const [c1, c2] = host.getSnapshot().cards;
    const origC1Text = c1!.text;
    const origC2Text = c2!.text;

    host.swapCardContents(c1!.id, c2!.id);
    expect(host.getSnapshot().cards[0]!.text).toBe(origC2Text);
    expect(host.getSnapshot().cards[1]!.text).toBe(origC1Text);
    expect(host.getSnapshot().canUndo).toBe(true);

    host.undo();
    expect(host.getSnapshot().cards[0]!.text).toBe(origC1Text);
    expect(host.getSnapshot().cards[1]!.text).toBe(origC2Text);
    expect(host.getSnapshot().canRedo).toBe(true);

    host.redo();
    expect(host.getSnapshot().cards[0]!.text).toBe(origC2Text);

    host.setBackdrop('aurora');
    host.setFontPairing('editorial');
    host.setGrainEnabled(true);
    host.setCornerStyle('squircle');
    host.setCardSurfaceTreatment(host.getSnapshot().cards[1]!.id, 'glass');

    const snap = host.getSnapshot();
    const svg = exportToSvg(snap);
    expect(svg).toContain('bg-aurora-a');
    expect(svg).toContain('mosaika-grain');
    expect(svg).toContain('Instrument Serif');

    const html = exportToHtmlTailwind(snap);
    expect(html).toContain('backdrop-filter: blur(22px)');
    expect(html).toContain('Instrument Serif');
  });

  it('renders Wave 2 widgets (Chart, Code, QR, Quote, Proof, Mockup) and patterns across SVG, HTML, and .pptx', async () => {
    const matrix = buildQrMatrix('https://prabhu-phd.github.io/mosaika');
    expect(matrix.length).toBeGreaterThanOrEqual(21);
    expect(matrix.length).toBe(matrix[0]!.length);

    const parsedChart = parseChartBlock('Revenue\n+42%\n10, 25, 40, 85');
    expect(parsedChart.values).toEqual([10, 25, 40, 85]);
    const geom = computeSparklineGeometry(parsedChart.values, 200, 80);
    expect(geom.points).toHaveLength(4);
    expect(geom.linePath.startsWith('M ')).toBe(true);

    const host = new WebStudioHost({ skipDefaultSeed: false });
    const cards = host.getSnapshot().cards;
    host.setCardPattern(cards[0]!.id, 'rings');
    host.setCardBlockType(cards[1]!.id, 'chart');
    host.setCardWidgetVariant(cards[1]!.id, 'bars');
    host.setCardBlockType(cards[2]!.id, 'qr');
    host.setCardBlockType(cards[3]!.id, 'code');
    host.setCardBlockType(cards[4]!.id, 'mockup');
    host.setCardWidgetVariant(cards[4]!.id, 'browser');

    const snap = host.getSnapshot();
    const svg = exportToSvg(snap);
    expect(svg).toContain('<pattern id="pat-');
    expect(svg).toContain('#0D0F14'); // Code terminal background
    expect(svg).toContain('Scan to try Mosaika Studio');
    expect(svg).not.toContain('<foreignObject');

    const html = exportToHtmlTailwind(snap);
    expect(html).toContain('<svg viewBox="0 0 240 72"');
    expect(html).toContain('<pre class="mt-2 rounded-xl bg-zinc-950');

    const pptxBytes = await exportToPptxBytes(snap);
    expect(pptxBytes.byteLength).toBeGreaterThan(8_000);
    expect(pptxBytes[0]).toBe(0x50);
    expect(pptxBytes[1]).toBe(0x4b);

    const encoded = encodeSharePayload(host.toSharePayload()!);
    const decoded = decodeSharePayload(encoded);
    expect(decoded?.patterns?.[cards[0]!.slotId]).toBe('rings');
    expect(decoded?.variants?.[cards[1]!.slotId]).toBe('bars');
    expect(decoded?.blocks?.[cards[2]!.slotId]).toBe('qr');
  });

  it('applies all 12 Wave 3 Starter Showcases cleanly onto hero-first slots and supports Undo', () => {
    expect(STUDIO_SHOWCASES).toHaveLength(12);
    const host = new WebStudioHost({ skipDefaultSeed: false });
    const initialHeroText = host.getSnapshot().cards.find((c) => c.role === 'hero')?.text;

    for (const sc of STUDIO_SHOWCASES) {
      const result = host.applyShowcase(sc);
      expect(result.isDark).toBe(Boolean(sc.isDark));

      const snap = host.getSnapshot();
      expect(snap.cards.length).toBeGreaterThanOrEqual(2);
      expect(snap.presetId).toBe(sc.presetId);
      expect(snap.brandAccentHex).toBe(sc.brandAccentHex);
      expect(snap.backdrop).toBe(sc.backdrop);
      expect(snap.fontPairing).toBe(sc.fontPairing);
      expect(snap.selectedCardIds).toEqual([]);

      const heroCard = snap.cards.find((c) => c.role === 'hero') ?? snap.cards[0]!;
      expect(heroCard.text).toBe(sc.cards[0]!.text);
    }

    // Undo should step cleanly back through showcase history
    expect(host.getSnapshot().canUndo).toBe(true);
    for (let i = 0; i < STUDIO_SHOWCASES.length; i++) {
      host.undo();
    }
    const restoredHero = host.getSnapshot().cards.find((c) => c.role === 'hero');
    expect(restoredHero?.text).toBe(initialHeroText);
  });

  it('parses raw Markdown/notes into smart Bento widgets and applies plan to Studio artboard', () => {
    const saasPlan = parseNotesToBentoPlan(SAMPLE_NOTE_PROMPTS[0]!.markdown);
    expect(saasPlan.cards.length).toBeGreaterThanOrEqual(5);
    const saasTypes = new Set(saasPlan.cards.map((c) => c.blockType ?? 'text'));
    expect(saasTypes.has('kpi')).toBe(true);
    expect(saasTypes.has('chart')).toBe(true);
    expect(saasTypes.has('code')).toBe(true);
    expect(saasTypes.has('checklist')).toBe(true);
    expect(saasTypes.has('qr')).toBe(true);
    expect(saasPlan.summary).toContain('cards');

    const boardPlan = parseNotesToBentoPlan(SAMPLE_NOTE_PROMPTS[1]!.markdown);
    expect(boardPlan.intent).toBe('kpi-dashboard');
    const boardTypes = new Set(boardPlan.cards.map((c) => c.blockType ?? 'text'));
    expect(boardTypes.has('kpi')).toBe(true);
    expect(boardTypes.has('quote')).toBe(true);

    const changelogPlan = parseNotesToBentoPlan(SAMPLE_NOTE_PROMPTS[2]!.markdown);
    const changelogTypes = new Set(changelogPlan.cards.map((c) => c.blockType ?? 'text'));
    expect(changelogTypes.has('checklist')).toBe(true);
    expect(changelogTypes.has('code')).toBe(true);
    expect(changelogTypes.has('proof')).toBe(true);

    const host = new WebStudioHost({ skipDefaultSeed: false });
    const applied = host.applyNotesPlan(saasPlan);
    expect(applied).toBe(true);

    const snap = host.getSnapshot();
    expect(snap.cards.length).toBe(saasPlan.cards.length);
    const heroCard = snap.cards.find((c) => c.role === 'hero') ?? snap.cards[0]!;
    expect(heroCard.text).toContain('Mosaika Studio 2.0');

    // Verify full SVG export works on auto-generated notes layout
    const svg = exportToSvg(snap);
    expect(svg).toContain('Mosaika Studio 2.0');
    expect(svg).not.toContain('<foreignObject');
  });
});
