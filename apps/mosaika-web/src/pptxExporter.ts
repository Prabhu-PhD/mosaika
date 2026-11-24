import PptxGenJS from 'pptxgenjs';
import { parseChecklistBlock, parseKpiBlock } from './cardBlocks.js';
import type { StudioCard, StudioSnapshot } from './studioHost.js';

function stripHash(hex: string): string {
  return hex.replace(/^#/, '').toUpperCase();
}

function computeSlideDimensionsInches(canvasW: number, canvasH: number): {
  slideW: number;
  slideH: number;
  pxToIn: number;
} {
  if (canvasW >= canvasH) {
    const slideW = 13.333;
    const slideH = Math.max(2, Math.min(20, +(slideW * (canvasH / canvasW)).toFixed(3)));
    return { slideW, slideH, pxToIn: slideW / canvasW };
  }
  const slideH = 10;
  const slideW = Math.max(2, Math.min(20, +(slideH * (canvasW / canvasH)).toFixed(3)));
  return { slideW, slideH, pxToIn: slideH / canvasH };
}

function buildTextRuns(
  card: StudioCard,
  fontColor: string
): PptxGenJS.TextProps[] {
  const trimmed = card.text.trim();
  if (!trimmed) return [];

  const isHero = card.role === 'hero';
  const headPt = isHero ? 22 : 14;
  const bodyPt = isHero ? 13 : 11;

  if (card.blockType === 'kpi') {
    const kpi = parseKpiBlock(trimmed);
    const runs: PptxGenJS.TextProps[] = [
      {
        text: kpi.value,
        options: {
          bold: true,
          fontSize: isHero ? 42 : 30,
          color: fontColor,
          fontFace: 'Segoe UI',
          breakLine: !kpi.delta,
        },
      },
    ];
    if (kpi.delta) {
      runs.push({
        text: `  ${kpi.delta}`,
        options: {
          bold: true,
          fontSize: 11,
          color: fontColor,
          fontFace: 'Segoe UI',
          breakLine: true,
        },
      });
    }
    if (kpi.label) {
      runs.push({
        text: kpi.label,
        options: {
          fontSize: 12,
          color: fontColor,
          fontFace: 'Segoe UI',
        },
      });
    }
    return runs;
  }

  if (card.blockType === 'checklist') {
    const list = parseChecklistBlock(trimmed);
    const runs: PptxGenJS.TextProps[] = [
      {
        text: list.title,
        options: {
          bold: true,
          fontSize: headPt,
          color: fontColor,
          fontFace: 'Segoe UI',
          breakLine: list.items.length > 0,
        },
      },
    ];
    list.items.forEach((item, idx) => {
      runs.push({
        text: `✓  ${item}`,
        options: {
          fontSize: bodyPt,
          color: fontColor,
          fontFace: 'Segoe UI',
          breakLine: idx < list.items.length - 1,
        },
      });
    });
    return runs;
  }

  const lines = trimmed.split(/\r?\n/);
  const runs: PptxGenJS.TextProps[] = [
    {
      text: lines[0] ?? '',
      options: {
        bold: true,
        fontSize: headPt,
        color: fontColor,
        fontFace: 'Segoe UI',
        breakLine: lines.length > 1,
      },
    },
  ];
  if (lines.length > 1) {
    runs.push({
      text: lines.slice(1).join('\n'),
      options: {
        fontSize: bodyPt,
        color: fontColor,
        fontFace: 'Segoe UI',
      },
    });
  }
  return runs;
}

function buildPresentation(snapshot: StudioSnapshot): PptxGenJS {
  const pptx = new PptxGenJS();
  pptx.author = 'Mosaika Studio';
  pptx.title = `Mosaika Bento Grid (${snapshot.canvasWidth}×${snapshot.canvasHeight})`;
  pptx.subject = 'Exported from Mosaika Studio';

  const { slideW, slideH, pxToIn } = computeSlideDimensionsInches(
    snapshot.canvasWidth,
    snapshot.canvasHeight
  );

  pptx.defineLayout({ name: 'MOSAIKA_CUSTOM', width: slideW, height: slideH });
  pptx.layout = 'MOSAIKA_CUSTOM';

  const slide = pptx.addSlide();
  slide.background = { color: stripHash(snapshot.canvasBgHex || '#FFFFFF') };

  for (const card of snapshot.cards) {
    const isCircle = card.shapeKind === 'circle';
    let x = +(card.rect.left * pxToIn).toFixed(4);
    let y = +(card.rect.top * pxToIn).toFixed(4);
    let w = +Math.max(0.1, card.rect.width * pxToIn).toFixed(4);
    let h = +Math.max(0.1, card.rect.height * pxToIn).toFixed(4);

    if (isCircle) {
      const d = Math.min(w, h);
      x = +(x + (w - d) / 2).toFixed(4);
      y = +(y + (h - d) / 2).toFixed(4);
      w = +d.toFixed(4);
      h = +d.toFixed(4);
    }

    const shapeType = isCircle ? pptx.ShapeType.ellipse : pptx.ShapeType.roundRect;
    const rectRadius =
      card.shapeKind === 'pill'
        ? 0.5
        : Math.max(0, Math.min(0.5, Number(card.cornerAdjustment.toFixed(3))));

    const shapeProps: PptxGenJS.ShapeProps = {
      x,
      y,
      w,
      h,
      ...(shapeType === pptx.ShapeType.roundRect ? { rectRadius } : {}),
    };

    if (card.style.fillHex) {
      shapeProps.fill = { color: stripHash(card.style.fillHex) };
    } else {
      shapeProps.fill = { type: 'none' };
    }

    if (card.style.borderColorHex && card.style.borderWeightPt > 0) {
      shapeProps.line = {
        color: stripHash(card.style.borderColorHex),
        pt: card.style.borderWeightPt,
        transparency: Math.round(Math.max(0, Math.min(1, card.style.borderTransparency)) * 100),
        dashType: card.style.borderDashed ? 'dash' : 'solid',
      };
    } else {
      shapeProps.line = { type: 'none' };
    }

    if (card.style.shadow) {
      shapeProps.shadow = {
        type: 'outer',
        blur: 9,
        offset: 4,
        angle: 90,
        opacity: 0.12,
        color: '0F172A',
      };
    }

    slide.addShape(shapeType, shapeProps);

    if (card.imageDataUrl) {
      slide.addImage({
        data: card.imageDataUrl,
        x,
        y,
        w,
        h,
        rounding: isCircle,
        sizing: { type: 'cover', w, h },
      });
      if (card.hasScrim) {
        slide.addShape(shapeType, {
          x,
          y,
          w,
          h,
          ...(shapeType === pptx.ShapeType.roundRect ? { rectRadius } : {}),
          fill: { color: '000000', transparency: 58 },
          line: { type: 'none' },
        });
      }
    }

    const textColor = stripHash(card.style.textColorHex || '#111827');
    const runs = buildTextRuns(card, textColor);
    if (runs.length > 0) {
      slide.addText(runs, {
        x,
        y,
        w,
        h,
        align: isCircle ? 'center' : 'left',
        valign: isCircle ? 'middle' : 'top',
        margin: [12, 14, 12, 14],
        wrap: true,
      });
    }
  }

  return pptx;
}

/**
 * Generates an editable native PowerPoint (.pptx) Blob ready for browser download.
 */
export async function exportToPptxBlob(snapshot: StudioSnapshot): Promise<Blob> {
  const pptx = buildPresentation(snapshot);
  const output = await pptx.write({ outputType: 'blob' });
  return output as Blob;
}

/**
 * Generates raw .pptx ZIP bytes (useful for Node/Vitest verification and server pipelines).
 */
export async function exportToPptxBytes(snapshot: StudioSnapshot): Promise<Uint8Array> {
  const pptx = buildPresentation(snapshot);
  const output = await pptx.write({ outputType: 'uint8array' });
  return output as Uint8Array;
}
