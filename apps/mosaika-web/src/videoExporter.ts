import { exportToSvg } from './exporters.js';
import type { StudioSnapshot } from './studioHost.js';

export interface CardMotionFrame {
  opacity: number;
  offsetY: number;
  scale: number;
}

function easeOutCubic(t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  return 1 - Math.pow(1 - clamped, 3);
}

/**
 * Pure deterministic motion curve for each card in the 60fps looping animation export.
 * Cards stagger in smoothly, hold crisp, and gently ease out at the tail of each slide segment.
 */
export function computeCardMotionState(
  cardIndex: number,
  elapsedInSlideSec: number,
  slideDurationSec = 3.2,
  staggerSec = 0.085,
  enterDurationSec = 0.52
): CardMotionFrame {
  const enterStart = cardIndex * staggerSec;
  const enterProgress = easeOutCubic((elapsedInSlideSec - enterStart) / enterDurationSec);

  const exitStart = Math.max(enterStart + enterDurationSec + 0.8, slideDurationSec - 0.35);
  const exitProgress =
    elapsedInSlideSec > exitStart
      ? Math.max(0, Math.min(1, (elapsedInSlideSec - exitStart) / 0.35))
      : 0;

  const opacity = Math.max(0, Math.min(1, enterProgress * (1 - exitProgress * 0.85)));
  const offsetY = (1 - enterProgress) * 28 - exitProgress * 8;
  const scale = 0.94 + enterProgress * 0.06 - exitProgress * 0.015;

  return { opacity, offsetY, scale };
}

async function svgStringToImage(svgString: string): Promise<HTMLImageElement> {
  const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Failed to rasterize SVG frame for video export.'));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export interface VideoExportOptions {
  fps?: number;
  slideDurationSec?: number;
  onProgress?: (ratio: number) => void;
}

/**
 * Wave 4 (#10): Renders a crisp 60fps looping `.webm` motion video directly in the browser
 * using Canvas 2D compositing + MediaRecorder (supports both single Bento grids & multi-slide decks).
 */
export async function exportDeckToWebmBlob(
  snapshots: readonly StudioSnapshot[],
  options?: VideoExportOptions
): Promise<Blob> {
  if (snapshots.length === 0) {
    throw new Error('No slides available to record.');
  }
  if (typeof MediaRecorder === 'undefined') {
    throw new Error('MediaRecorder is not supported in this browser.');
  }

  const fps = options?.fps ?? 60;
  const slideDurationSec = options?.slideDurationSec ?? 3.2;
  const first = snapshots[0]!;
  const maxDim = 1280;
  const scale = Math.min(1, maxDim / Math.max(first.canvasWidth, first.canvasHeight));
  const outW = Math.max(320, Math.round((first.canvasWidth * scale) / 2) * 2);
  const outH = Math.max(240, Math.round((first.canvasHeight * scale) / 2) * 2);

  // Pre-rasterize background + full layer for each slide (only 2 SVG decodes per slide)
  const preparedSlides = await Promise.all(
    snapshots.map(async (snap) => {
      const bgSvg = exportToSvg({ ...snap, cards: [] });
      const fullSvg = exportToSvg(snap);
      const [bgImg, fullImg] = await Promise.all([
        svgStringToImage(bgSvg),
        svgStringToImage(fullSvg),
      ]);
      const orderedCards = [...snap.cards].sort((a, b) => a.zOrderIndex - b.zOrderIndex);
      return { snap, bgImg, fullImg, orderedCards };
    })
  );

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context unavailable for video export.');
  }

  const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
    ? 'video/webm;codecs=vp9'
    : MediaRecorder.isTypeSupported('video/webm;codecs=vp8')
      ? 'video/webm;codecs=vp8'
      : 'video/webm';

  const stream = canvas.captureStream(fps);
  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 6_000_000,
  });

  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (ev) => {
    if (ev.data && ev.data.size > 0) chunks.push(ev.data);
  };

  const recordingDone = new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
    recorder.onerror = () => reject(new Error('Motion video encoding failed.'));
  });

  const totalDurationSec = slideDurationSec * preparedSlides.length;
  recorder.start(100);

  const startMs = performance.now();
  await new Promise<void>((resolve) => {
    const drawFrame = () => {
      const elapsedSec = (performance.now() - startMs) / 1000;
      const ratio = Math.min(1, elapsedSec / totalDurationSec);
      options?.onProgress?.(ratio);

      const slideIdx = Math.min(
        preparedSlides.length - 1,
        Math.floor(elapsedSec / slideDurationSec)
      );
      const slideElapsed = elapsedSec - slideIdx * slideDurationSec;
      const current = preparedSlides[slideIdx]!;
      const { snap, bgImg, fullImg, orderedCards } = current;
      const sx = outW / snap.canvasWidth;
      const sy = outH / snap.canvasHeight;

      ctx.clearRect(0, 0, outW, outH);
      ctx.drawImage(bgImg, 0, 0, outW, outH);

      orderedCards.forEach((card, idx) => {
        const frame = computeCardMotionState(idx, slideElapsed, slideDurationSec);
        if (frame.opacity <= 0.01) return;

        const padBleed = 6;
        const srcX = Math.max(0, card.rect.left - padBleed);
        const srcY = Math.max(0, card.rect.top - padBleed);
        const srcW = Math.min(snap.canvasWidth - srcX, card.rect.width + padBleed * 2);
        const srcH = Math.min(snap.canvasHeight - srcY, card.rect.height + padBleed * 2);

        const dstX = srcX * sx;
        const dstY = srcY * sy;
        const dstW = srcW * sx;
        const dstH = srcH * sy;
        const cx = dstX + dstW / 2;
        const cy = dstY + dstH / 2;

        ctx.save();
        ctx.globalAlpha = frame.opacity;
        ctx.translate(cx, cy + frame.offsetY * sy);
        ctx.scale(frame.scale, frame.scale);
        ctx.drawImage(
          fullImg,
          srcX,
          srcY,
          srcW,
          srcH,
          -dstW / 2,
          -dstH / 2,
          dstW,
          dstH
        );
        ctx.restore();
      });

      if (elapsedSec < totalDurationSec) {
        requestAnimationFrame(drawFrame);
      } else {
        options?.onProgress?.(1);
        resolve();
      }
    };

    requestAnimationFrame(drawFrame);
  });

  recorder.stop();
  stream.getTracks().forEach((t) => t.stop());
  return recordingDone;
}
