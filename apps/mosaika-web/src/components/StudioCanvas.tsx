import { useEffect, useMemo, useRef, useState } from 'react';
import type { RectPt, SplitAxis } from '@bento/contract';
import {
  computeGridLattice,
  resolveSplitHandles,
  type ResolvedSplitHandle,
} from '@bento/core';
import { GripVertical, Lock } from 'lucide-react';
import {
  computeGradientStops,
  parseChecklistBlock,
  parseKpiBlock,
} from '../cardBlocks.js';
import type { StudioCard, StudioSnapshot } from '../studioHost.js';
import {
  buildSquirclePath,
  computeBackdropPalette,
  getFontPairing,
} from '../visualCraft.js';
import { CardIcon } from './CardIcon.js';

export interface StudioCanvasProps {
  snapshot: StudioSnapshot;
  isDarkTheme: boolean;
  showGridOverlay: boolean;
  onSelectCards: (ids: string[]) => void;
  onUpdateCardText: (cardId: string, text: string) => void;
  onSetCardImage: (cardId: string, dataUrl: string) => void;
  onSwapCardContents: (sourceId: string, targetId: string) => void;
  onDeleteCard: (cardId: string) => void;
  onResizeSplit: (
    nodeId: string,
    nextRatio: number,
    snapHarmonic: boolean,
    commit: boolean
  ) => void;
  children?: React.ReactNode;
}

function hexToRgba(hex: string, transparency: number): string {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return hex;
  const r = Number.parseInt(clean.slice(0, 2), 16);
  const g = Number.parseInt(clean.slice(2, 4), 16);
  const b = Number.parseInt(clean.slice(4, 6), 16);
  const alpha = Math.max(0, Math.min(1, 1 - transparency));
  return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`;
}

function formatHarmonicBadge(ratio: number): string {
  const presets: ReadonlyArray<[number, string]> = [
    [0.25, '1:3'],
    [1 / 3, '1:2'],
    [0.4, '2:3'],
    [0.5, '1:1'],
    [0.6, '3:2'],
    [2 / 3, '2:1'],
    [0.75, '3:1'],
  ];
  for (const [val, label] of presets) {
    if (Math.abs(ratio - val) < 0.008) return label;
  }
  return `${Math.round(ratio * 100)}%`;
}

function computeNotchSafePadding(
  card: StudioCard,
  allCards: readonly StudioCard[],
  basePadX: number,
  basePadY: number
): { padLeft: number; padTop: number; padRight: number; padBottom: number } {
  let padLeft = basePadX;
  let padTop = basePadY;
  const padRight = basePadX;
  const padBottom = basePadY;

  if (!card.svgPath || card.shapeKind === 'circle') {
    return { padLeft, padTop, padRight, padBottom };
  }

  for (const other of allCards) {
    if (other.id === card.id) continue;
    const ox1 = Math.max(card.rect.left, other.rect.left);
    const oy1 = Math.max(card.rect.top, other.rect.top);
    const ox2 = Math.min(card.rect.left + card.rect.width, other.rect.left + other.rect.width);
    const oy2 = Math.min(card.rect.top + card.rect.height, other.rect.top + other.rect.height);
    if (ox2 <= ox1 || oy2 <= oy1) continue;

    const intrudesTopLeft =
      ox1 <= card.rect.left + basePadX + 48 && oy1 <= card.rect.top + basePadY + 48;
    if (!intrudesTopLeft) continue;

    const clearRightX = ox2 - card.rect.left + 20;
    const clearBelowY = oy2 - card.rect.top + 18;
    const remainW = card.rect.width - clearRightX - padRight;
    const remainH = card.rect.height - clearBelowY - padBottom;

    if (remainW >= card.rect.width * 0.42) {
      padLeft = Math.max(padLeft, Math.round(clearRightX));
    } else if (remainH >= card.rect.height * 0.35) {
      padTop = Math.max(padTop, Math.round(clearBelowY));
    } else {
      padLeft = Math.max(padLeft, Math.round(clearRightX));
    }
  }

  return { padLeft, padTop, padRight, padBottom };
}

function readImageFileAsDataUrl(file: File): Promise<string | null> {
  if (!file.type.startsWith('image/')) return Promise.resolve(null);
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

export function StudioCanvas({
  snapshot,
  isDarkTheme,
  showGridOverlay,
  onSelectCards,
  onUpdateCardText,
  onSetCardImage,
  onSwapCardContents,
  onDeleteCard,
  onResizeSplit,
  children,
}: StudioCanvasProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [stageBox, setStageBox] = useState<{ w: number; h: number }>({ w: 1020, h: 700 });
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [hoveredCardId, setHoveredCardId] = useState<string | null>(null);
  const [dragSwapSourceId, setDragSwapSourceId] = useState<string | null>(null);
  const [dragOverCardId, setDragOverCardId] = useState<string | null>(null);
  const [hoveredGutterId, setHoveredGutterId] = useState<string | null>(null);
  const [draggingGutter, setDraggingGutter] = useState<{
    nodeId: string;
    axis: SplitAxis;
    parentRect: RectPt;
    gutterPt: number;
    lastRatio: number;
  } | null>(null);

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setStageBox({ w: rect.width, h: rect.height });
      }
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Delete / Escape keyboard ergonomics
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = document.activeElement?.tagName.toLowerCase();
      if (tag === 'textarea' || tag === 'input' || tag === 'select') return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && snapshot.selectedCardIds.length > 0) {
        e.preventDefault();
        for (const id of snapshot.selectedCardIds) {
          onDeleteCard(id);
        }
      } else if (e.key === 'Escape') {
        setEditingCardId(null);
        onSelectCards([]);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onDeleteCard, onSelectCards, snapshot.selectedCardIds]);

  const fittedArtboard = useMemo(() => {
    const availW = Math.max(240, stageBox.w - 64);
    const availH = Math.max(200, stageBox.h - 110);
    const scale = Math.min(availW / snapshot.canvasWidth, availH / snapshot.canvasHeight, 1.15);
    return {
      width: Math.round(snapshot.canvasWidth * scale),
      height: Math.round(snapshot.canvasHeight * scale),
      scale,
    };
  }, [stageBox.w, stageBox.h, snapshot.canvasWidth, snapshot.canvasHeight]);

  const bentoOverlays = useMemo(() => {
    if (!snapshot.activeDoc || snapshot.cards.length === 0) return null;
    const doc = snapshot.activeDoc;
    const handles = resolveSplitHandles(doc.tree, doc.anchorRect, doc.params.gutterPt);
    const lattice = computeGridLattice(doc.anchorRect, doc.params.gutterPt, doc.params.gridSystem);
    return { doc, handles, lattice };
  }, [snapshot.activeDoc, snapshot.cards.length]);

  const backdropPalette = useMemo(
    () => computeBackdropPalette(snapshot.brandAccentHex, isDarkTheme),
    [snapshot.brandAccentHex, isDarkTheme]
  );

  const fontSpec = useMemo(() => getFontPairing(snapshot.fontPairing), [snapshot.fontPairing]);
  const selectedSet = useMemo(() => new Set(snapshot.selectedCardIds), [snapshot.selectedCardIds]);

  const clientToCanvasPt = (clientX: number, clientY: number): { x: number; y: number } | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const x = ((clientX - rect.left) / rect.width) * snapshot.canvasWidth;
    const y = ((clientY - rect.top) / rect.height) * snapshot.canvasHeight;
    return {
      x: Math.max(0, Math.min(snapshot.canvasWidth, x)),
      y: Math.max(0, Math.min(snapshot.canvasHeight, y)),
    };
  };

  const handleCardClick = (e: React.MouseEvent, card: StudioCard) => {
    e.stopPropagation();
    onSelectCards([card.id]);
  };

  const handleGutterDown = (
    e: React.PointerEvent<SVGGElement>,
    handle: ResolvedSplitHandle,
    gutterPt: number
  ) => {
    if (handle.locked) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setEditingCardId(null);
    setDraggingGutter({
      nodeId: handle.nodeId,
      axis: handle.axis,
      parentRect: handle.parentRect,
      gutterPt,
      lastRatio: handle.ratio,
    });
  };

  const handleGutterMove = (e: React.PointerEvent<SVGGElement>) => {
    if (!draggingGutter) return;
    e.stopPropagation();
    const pt = clientToCanvasPt(e.clientX, e.clientY);
    if (!pt) return;
    const pr = draggingGutter.parentRect;
    const g = draggingGutter.gutterPt;
    const nextRatio =
      draggingGutter.axis === 'vertical'
        ? (pt.x - pr.left - g / 2) / Math.max(1, pr.width - g)
        : (pt.y - pr.top - g / 2) / Math.max(1, pr.height - g);
    setDraggingGutter((prev) => (prev ? { ...prev, lastRatio: nextRatio } : null));
    onResizeSplit(draggingGutter.nodeId, nextRatio, !e.altKey, false);
  };

  const handleGutterUp = (e: React.PointerEvent<SVGGElement>) => {
    if (!draggingGutter) return;
    e.stopPropagation();
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    const { nodeId, lastRatio } = draggingGutter;
    setDraggingGutter(null);
    onResizeSplit(nodeId, lastRatio, !e.altKey, true);
  };

  const handleCardDrop = async (e: React.DragEvent, targetCardId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverCardId(null);

    const swappedSource = e.dataTransfer.getData('application/x-mosaika-card') || dragSwapSourceId;
    setDragSwapSourceId(null);
    if (swappedSource && swappedSource !== targetCardId) {
      onSwapCardContents(swappedSource, targetCardId);
      return;
    }

    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const dataUrl = await readImageFileAsDataUrl(file);
    if (dataUrl) {
      onSetCardImage(targetCardId, dataUrl);
    }
  };

  const uiScaleInv = Math.max(0.75, Math.min(2.2, 1 / Math.max(0.3, fittedArtboard.scale)));
  const badgeFontPx = Math.round(11 * uiScaleInv);

  return (
    <div
      ref={stageRef}
      className="relative flex-1 min-w-0 h-full flex flex-col items-center justify-center overflow-hidden select-none pb-12"
      style={{
        backgroundColor: isDarkTheme ? '#090A0D' : '#EEF0F4',
      }}
      onClick={() => {
        setEditingCardId(null);
        onSelectCards([]);
      }}
    >
      {/* Subtle Dimension Whisper above Artboard */}
      <div
        className="flex items-center justify-between mb-2.5 px-1 text-[11px] font-mono tracking-tight"
        style={{
          width: fittedArtboard.width,
          color: isDarkTheme ? '#71717A' : '#64748B',
        }}
      >
        <div className="flex items-center gap-2">
          <span className="font-medium" style={{ color: isDarkTheme ? '#D4D4D8' : '#334155' }}>
            {snapshot.canvasWidth} × {snapshot.canvasHeight}
          </span>
          <span>·</span>
          <span>
            {snapshot.cards.length} {snapshot.cards.length === 1 ? 'card' : 'cards'}
          </span>
          <span>·</span>
          <span>{Math.round(fittedArtboard.scale * 100)}%</span>
        </div>
        <span className="hidden md:inline opacity-80">
          Double-click to edit · Drag handle to swap tiles · Ctrl+V to paste image
        </span>
      </div>

      {/* Centered Artboard Frame */}
      <div
        data-testid="studio-artboard-frame"
        className="relative rounded-xl overflow-hidden transition-[width,height] duration-150"
        style={{
          width: fittedArtboard.width,
          height: fittedArtboard.height,
          boxShadow: isDarkTheme
            ? '0 28px 70px rgba(0, 0, 0, 0.72), 0 0 0 1px rgba(255, 255, 255, 0.10)'
            : '0 24px 64px rgba(15, 23, 42, 0.12), 0 0 0 1px rgba(15, 23, 42, 0.07)',
        }}
      >
        <svg
          ref={svgRef}
          data-testid="studio-artboard-svg"
          viewBox={`0 0 ${snapshot.canvasWidth} ${snapshot.canvasHeight}`}
          width={fittedArtboard.width}
          height={fittedArtboard.height}
          className="block w-full h-full"
        >
          <defs>
            <filter id="studio-card-shadow" x="-10%" y="-10%" width="120%" height="124%">
              <feDropShadow
                dx="0"
                dy="10"
                stdDeviation="14"
                floodColor="#0F172A"
                floodOpacity={isDarkTheme ? '0.42' : '0.09'}
              />
            </filter>
            <linearGradient id="studio-card-scrim" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#000000" stopOpacity="0.06" />
              <stop offset="55%" stopColor="#000000" stopOpacity="0.24" />
              <stop offset="100%" stopColor="#000000" stopOpacity="0.72" />
            </linearGradient>

            {/* Backdrop Aurora / Dusk Gradients */}
            <radialGradient id="studio-aurora-a" cx="18%" cy="18%" r="58%">
              <stop offset="0%" stopColor={backdropPalette.blobA} stopOpacity={isDarkTheme ? '0.52' : '0.48'} />
              <stop offset="100%" stopColor={backdropPalette.blobA} stopOpacity="0" />
            </radialGradient>
            <radialGradient id="studio-aurora-b" cx="84%" cy="24%" r="54%">
              <stop offset="0%" stopColor={backdropPalette.blobB} stopOpacity={isDarkTheme ? '0.42' : '0.45'} />
              <stop offset="100%" stopColor={backdropPalette.blobB} stopOpacity="0" />
            </radialGradient>
            <radialGradient id="studio-aurora-c" cx="55%" cy="88%" r="58%">
              <stop offset="0%" stopColor={backdropPalette.blobC} stopOpacity={isDarkTheme ? '0.46' : '0.42'} />
              <stop offset="100%" stopColor={backdropPalette.blobC} stopOpacity="0" />
            </radialGradient>
            <linearGradient id="studio-dusk-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={isDarkTheme ? '#0B0F1A' : '#FDFBF7'} />
              <stop offset="52%" stopColor={isDarkTheme ? '#131826' : '#F3F4F8'} />
              <stop offset="100%" stopColor={isDarkTheme ? '#1C1628' : '#EBF0F9'} />
            </linearGradient>
            <pattern id="studio-dots-pat" width="24" height="24" patternUnits="userSpaceOnUse">
              <circle cx="12" cy="12" r="1.4" fill={backdropPalette.dotColor} />
            </pattern>
            <filter id="studio-film-grain" x="0%" y="0%" width="100%" height="100%">
              <feTurbulence
                type="fractalNoise"
                baseFrequency="0.78"
                numOctaves="3"
                stitchTiles="stitch"
              />
              <feColorMatrix type="saturate" values="0" />
            </filter>

            {/* Per-card Clip Paths & Gradients */}
            {snapshot.cards.map((card) => {
              const rx = card.cornerAdjustment * Math.min(card.rect.width, card.rect.height);
              const useSquircle =
                snapshot.cornerStyle === 'squircle' &&
                !card.svgPath &&
                card.shapeKind !== 'circle' &&
                card.shapeKind !== 'pill';
              const contourPath =
                card.svgPath ??
                (useSquircle ? buildSquirclePath(card.rect.width, card.rect.height, rx) : null);

              const stops =
                card.style.fillHex &&
                (card.surfaceTreatment === 'sheen' || card.surfaceTreatment === 'mesh')
                  ? computeGradientStops(card.style.fillHex)
                  : null;

              return (
                <g key={`defs-${card.id}`}>
                  <clipPath id={`studio-clip-${card.id}`}>
                    {contourPath ? (
                      <path
                        d={contourPath}
                        transform={`translate(${card.rect.left} ${card.rect.top})`}
                      />
                    ) : (
                      <rect
                        x={card.rect.left}
                        y={card.rect.top}
                        width={card.rect.width}
                        height={card.rect.height}
                        rx={rx}
                        ry={rx}
                      />
                    )}
                  </clipPath>
                  {stops && (
                    <linearGradient id={`studio-grad-${card.id}`} x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor={stops.startHex} />
                      <stop offset="52%" stopColor={stops.midHex} />
                      <stop offset="100%" stopColor={stops.endHex} />
                    </linearGradient>
                  )}
                  {stops && card.surfaceTreatment === 'mesh' && (
                    <radialGradient id={`studio-mesh-${card.id}`} cx="85%" cy="18%" r="62%">
                      <stop offset="0%" stopColor={stops.glowHex} stopOpacity="0.44" />
                      <stop offset="100%" stopColor={stops.glowHex} stopOpacity="0" />
                    </radialGradient>
                  )}
                </g>
              );
            })}
          </defs>

          {/* Artboard Backdrop Layer */}
          <g
            onClick={() => {
              setEditingCardId(null);
              onSelectCards([]);
            }}
          >
            {snapshot.backdrop === 'aurora' ? (
              <>
                <rect x={0} y={0} width={snapshot.canvasWidth} height={snapshot.canvasHeight} fill={backdropPalette.baseBg} />
                <rect x={0} y={0} width={snapshot.canvasWidth} height={snapshot.canvasHeight} fill="url(#studio-aurora-a)" />
                <rect x={0} y={0} width={snapshot.canvasWidth} height={snapshot.canvasHeight} fill="url(#studio-aurora-b)" />
                <rect x={0} y={0} width={snapshot.canvasWidth} height={snapshot.canvasHeight} fill="url(#studio-aurora-c)" />
              </>
            ) : snapshot.backdrop === 'dusk' ? (
              <rect x={0} y={0} width={snapshot.canvasWidth} height={snapshot.canvasHeight} fill="url(#studio-dusk-grad)" />
            ) : snapshot.backdrop === 'dots' ? (
              <>
                <rect x={0} y={0} width={snapshot.canvasWidth} height={snapshot.canvasHeight} fill={snapshot.canvasBgHex} />
                <rect x={0} y={0} width={snapshot.canvasWidth} height={snapshot.canvasHeight} fill="url(#studio-dots-pat)" />
              </>
            ) : snapshot.backdrop === 'photo' && snapshot.backdropImageUrl ? (
              <>
                <rect x={0} y={0} width={snapshot.canvasWidth} height={snapshot.canvasHeight} fill="#111216" />
                <image
                  href={snapshot.backdropImageUrl}
                  x={0}
                  y={0}
                  width={snapshot.canvasWidth}
                  height={snapshot.canvasHeight}
                  preserveAspectRatio="xMidYMid slice"
                />
              </>
            ) : (
              <rect
                x={0}
                y={0}
                width={snapshot.canvasWidth}
                height={snapshot.canvasHeight}
                fill={snapshot.canvasBgHex}
              />
            )}
          </g>

          {/* Cards */}
          {snapshot.cards.map((card) => {
            const isSelected = selectedSet.has(card.id);
            const isHovered = hoveredCardId === card.id;
            const isEditing = editingCardId === card.id;
            const isDropTarget = dragOverCardId === card.id;
            const isGlass = card.surfaceTreatment === 'glass' && !card.imageDataUrl;
            const rx = card.cornerAdjustment * Math.min(card.rect.width, card.rect.height);

            const useSquircle =
              snapshot.cornerStyle === 'squircle' &&
              !card.svgPath &&
              card.shapeKind !== 'circle' &&
              card.shapeKind !== 'pill';
            const contourPath =
              card.svgPath ??
              (useSquircle ? buildSquirclePath(card.rect.width, card.rect.height, rx) : null);

            const hasGradientFill = Boolean(
              card.style.fillHex &&
                (card.surfaceTreatment === 'sheen' || card.surfaceTreatment === 'mesh')
            );
            const fill = isGlass
              ? isDarkTheme
                ? 'rgba(20, 22, 29, 0.42)'
                : 'rgba(255, 255, 255, 0.56)'
              : hasGradientFill
                ? `url(#studio-grad-${card.id})`
                : (card.style.fillHex ?? 'none');

            const stroke = isGlass
              ? isDarkTheme
                ? 'rgba(255, 255, 255, 0.16)'
                : 'rgba(255, 255, 255, 0.88)'
              : card.style.borderColorHex && card.style.borderWeightPt > 0
                ? hexToRgba(card.style.borderColorHex, card.style.borderTransparency)
                : 'none';

            const strokeW = isGlass ? 1.25 : card.style.borderWeightPt;

            const anim = snapshot.activeAnimation;
            const animIndex = anim ? anim.orderedSlotIds.indexOf(card.slotId) : -1;
            const animStyle: React.CSSProperties | undefined =
              anim && anim.preset !== 'none' && animIndex >= 0
                ? {
                    transformBox: 'fill-box',
                    transformOrigin: 'center',
                    animation: `mosaika-${anim.preset} ${anim.durationSec}s cubic-bezier(0.22, 1, 0.36, 1) ${(animIndex * anim.staggerSec).toFixed(2)}s both`,
                  }
                : undefined;

            const headlineSize =
              card.role === 'hero'
                ? Math.max(22, Math.min(42, Math.round(card.rect.width * 0.052)))
                : Math.max(15, Math.min(24, Math.round(card.rect.width * 0.048)));
            const basePadX = Math.max(20, Math.round(card.rect.width * 0.058));
            const basePadY = Math.max(20, Math.round(card.rect.height * 0.072));
            const safePad = computeNotchSafePadding(card, snapshot.cards, basePadX, basePadY);
            const isCircle = card.shapeKind === 'circle';
            const align = isCircle ? 'center' : (card.textAlign ?? 'tl');
            const lines = card.text.split(/\r?\n/);
            const firstLine = lines[0] ?? '';
            const restLines = lines.slice(1).join('\n');

            const alignClasses =
              align === 'center'
                ? 'items-center justify-center text-center'
                : align === 'bl'
                  ? 'items-start justify-end text-left'
                  : align === 'split'
                    ? 'items-start justify-between text-left'
                    : 'items-start justify-start text-left';

            return (
              <g
                key={`${card.id}-${snapshot.animationRunId}`}
                data-testid={`studio-card-${card.slotId}`}
                className="cursor-pointer"
                style={animStyle}
                onMouseEnter={() => setHoveredCardId(card.id)}
                onMouseLeave={() => setHoveredCardId((prev) => (prev === card.id ? null : prev))}
                onClick={(e) => handleCardClick(e, card)}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  onSelectCards([card.id]);
                  setEditingCardId(card.id);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setDragOverCardId(card.id);
                }}
                onDragLeave={() => {
                  setDragOverCardId((prev) => (prev === card.id ? null : prev));
                }}
                onDrop={(e) => {
                  void handleCardDrop(e, card.id);
                }}
              >
                {/* Live GPU Backdrop Blur for Glassmorphism cards */}
                {isGlass && (
                  <g clipPath={`url(#studio-clip-${card.id})`} pointerEvents="none">
                    <foreignObject
                      x={card.rect.left}
                      y={card.rect.top}
                      width={card.rect.width}
                      height={card.rect.height}
                    >
                      <div
                        className="w-full h-full"
                        style={{
                          backdropFilter: 'blur(24px) saturate(150%)',
                          WebkitBackdropFilter: 'blur(24px) saturate(150%)',
                        }}
                      />
                    </foreignObject>
                  </g>
                )}

                {/* Base Vector Contour (Squircle / Cutout Path / Rounded Rect) */}
                {contourPath ? (
                  <path
                    d={contourPath}
                    transform={`translate(${card.rect.left} ${card.rect.top})`}
                    fill={fill}
                    stroke={stroke}
                    strokeWidth={strokeW}
                    strokeDasharray={card.style.borderDashed ? '6 4' : undefined}
                    filter={card.style.shadow ? 'url(#studio-card-shadow)' : undefined}
                  />
                ) : (
                  <rect
                    x={card.rect.left}
                    y={card.rect.top}
                    width={card.rect.width}
                    height={card.rect.height}
                    rx={rx}
                    ry={rx}
                    fill={fill}
                    stroke={stroke}
                    strokeWidth={strokeW}
                    strokeDasharray={card.style.borderDashed ? '6 4' : undefined}
                    filter={card.style.shadow ? 'url(#studio-card-shadow)' : undefined}
                  />
                )}

                {/* Optional Mesh Radial Glow */}
                {hasGradientFill && card.surfaceTreatment === 'mesh' && (
                  <g clipPath={`url(#studio-clip-${card.id})`} pointerEvents="none">
                    <rect
                      x={card.rect.left}
                      y={card.rect.top}
                      width={card.rect.width}
                      height={card.rect.height}
                      fill={`url(#studio-mesh-${card.id})`}
                    />
                  </g>
                )}

                {/* Clipped Photo & Scrim */}
                {card.imageDataUrl && (
                  <g clipPath={`url(#studio-clip-${card.id})`} pointerEvents="none">
                    <image
                      href={card.imageDataUrl}
                      x={card.rect.left}
                      y={card.rect.top}
                      width={card.rect.width}
                      height={card.rect.height}
                      preserveAspectRatio="xMidYMid slice"
                    />
                    {card.hasScrim && (
                      <rect
                        x={card.rect.left}
                        y={card.rect.top}
                        width={card.rect.width}
                        height={card.rect.height}
                        fill="url(#studio-card-scrim)"
                      />
                    )}
                  </g>
                )}

                {/* Card Typography, Kicker, Icon & Live Inline Editor */}
                <g clipPath={`url(#studio-clip-${card.id})`}>
                  <foreignObject
                    x={card.rect.left}
                    y={card.rect.top}
                    width={card.rect.width}
                    height={card.rect.height}
                  >
                    <div
                      className={`w-full h-full flex flex-col ${alignClasses}`}
                      style={{
                        padding: `${safePad.padTop}px ${safePad.padRight}px ${safePad.padBottom}px ${safePad.padLeft}px`,
                        color: card.style.textColorHex,
                        fontFamily: fontSpec.bodyFamily,
                      }}
                    >
                      {isEditing ? (
                        <textarea
                          autoFocus
                          value={card.text}
                          onChange={(e) => onUpdateCardText(card.id, e.target.value)}
                          onBlur={() => setEditingCardId(null)}
                          onClick={(e) => e.stopPropagation()}
                          placeholder="Line 1: Title — Line 2+: Body copy..."
                          className={`w-full h-full resize-none bg-transparent outline-none ${
                            align === 'center' ? 'text-center' : 'text-left'
                          }`}
                          style={{
                            color: card.style.textColorHex,
                            fontFamily: fontSpec.headingFamily,
                            fontSize: `${headlineSize}px`,
                            lineHeight: 1.25,
                            fontWeight: fontSpec.headingWeight,
                          }}
                        />
                      ) : (
                        <>
                          {/* Optional Eyebrow Kicker + Icon Badge */}
                          {(card.kicker?.trim() || (card.icon && card.icon !== 'none')) && (
                            <div
                              className={`flex items-center gap-2 mb-2.5 ${
                                align === 'center' ? 'justify-center' : 'justify-start'
                              }`}
                              style={{ opacity: 0.78 }}
                            >
                              {card.icon && card.icon !== 'none' && (
                                <span
                                  className="inline-flex items-center justify-center rounded-lg"
                                  style={{
                                    padding: '5px',
                                    backgroundColor: 'rgba(128,128,128,0.14)',
                                  }}
                                >
                                  <CardIcon icon={card.icon} size={Math.max(14, Math.round(headlineSize * 0.65))} />
                                </span>
                              )}
                              {card.kicker?.trim() && (
                                <span
                                  className="uppercase tracking-[0.12em] font-semibold"
                                  style={{
                                    fontSize: `${Math.max(10, Math.round(headlineSize * 0.36))}px`,
                                  }}
                                >
                                  {card.kicker.trim()}
                                </span>
                              )}
                            </div>
                          )}

                          {card.blockType === 'kpi' && card.text.trim().length > 0 ? (
                            (() => {
                              const kpi = parseKpiBlock(card.text);
                              const metricPx = Math.max(
                                30,
                                Math.min(64, Math.round(card.rect.width * 0.14))
                              );
                              return (
                                <div className="flex flex-col justify-between flex-1 w-full">
                                  <div
                                    className={`flex items-center gap-2.5 flex-wrap ${
                                      align === 'center' ? 'justify-center' : 'justify-start'
                                    }`}
                                  >
                                    <span
                                      style={{
                                        fontFamily: fontSpec.headingFamily,
                                        fontSize: `${metricPx}px`,
                                        lineHeight: 1.02,
                                        fontWeight: 700,
                                        letterSpacing: '-0.035em',
                                        fontVariantNumeric: 'tabular-nums',
                                      }}
                                    >
                                      {kpi.value}
                                    </span>
                                    {kpi.delta && (
                                      <span
                                        style={{
                                          fontSize: `${Math.max(11, Math.round(headlineSize * 0.58))}px`,
                                          fontWeight: 600,
                                          padding: '3px 9px',
                                          borderRadius: '9999px',
                                          border: '1px solid currentColor',
                                          opacity: 0.85,
                                        }}
                                      >
                                        {kpi.delta}
                                      </span>
                                    )}
                                  </div>
                                  {kpi.label && (
                                    <div
                                      style={{
                                        marginTop: '10px',
                                        fontSize: `${Math.max(13, Math.round(headlineSize * 0.72))}px`,
                                        fontWeight: 500,
                                        opacity: 0.78,
                                      }}
                                    >
                                      {kpi.label}
                                    </div>
                                  )}
                                </div>
                              );
                            })()
                          ) : card.blockType === 'checklist' && card.text.trim().length > 0 ? (
                            (() => {
                              const list = parseChecklistBlock(card.text);
                              const itemPx = Math.max(12, Math.round(headlineSize * 0.64));
                              return (
                                <div className="flex flex-col w-full">
                                  <div
                                    style={{
                                      fontFamily: fontSpec.headingFamily,
                                      fontSize: `${headlineSize}px`,
                                      lineHeight: 1.18,
                                      fontWeight: fontSpec.headingWeight,
                                      letterSpacing: fontSpec.letterSpacing,
                                    }}
                                  >
                                    {list.title}
                                  </div>
                                  <ul
                                    style={{
                                      marginTop: `${Math.max(8, Math.round(headlineSize * 0.42))}px`,
                                      display: 'flex',
                                      flexDirection: 'column',
                                      gap: '6px',
                                      listStyle: 'none',
                                      padding: 0,
                                    }}
                                  >
                                    {list.items.map((item, idx) => (
                                      <li
                                        key={idx}
                                        style={{
                                          fontSize: `${itemPx}px`,
                                          lineHeight: 1.35,
                                          opacity: 0.84,
                                          display: 'flex',
                                          alignItems: 'baseline',
                                          gap: '8px',
                                        }}
                                      >
                                        <span style={{ fontWeight: 700 }}>✓</span>
                                        <span>{item}</span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              );
                            })()
                          ) : card.text.trim().length > 0 ? (
                            <div className="w-full">
                              <div
                                style={{
                                  fontFamily: fontSpec.headingFamily,
                                  fontSize: `${headlineSize}px`,
                                  lineHeight: 1.15,
                                  fontWeight: fontSpec.headingWeight,
                                  letterSpacing: fontSpec.letterSpacing,
                                }}
                              >
                                {firstLine}
                              </div>
                              {restLines && (
                                <div
                                  style={{
                                    marginTop: `${Math.max(8, Math.round(headlineSize * 0.34))}px`,
                                    fontSize: `${Math.max(13, Math.round(headlineSize * 0.56))}px`,
                                    lineHeight: 1.5,
                                    opacity: 0.8,
                                    whiteSpace: 'pre-wrap',
                                  }}
                                >
                                  {restLines}
                                </div>
                              )}
                            </div>
                          ) : (
                            <div
                              className="uppercase tracking-wider font-mono"
                              style={{
                                fontSize: `${Math.max(10, Math.round(headlineSize * 0.45))}px`,
                                opacity: 0.38,
                              }}
                            >
                              {card.contentHint ?? card.shapeName}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </foreignObject>
                </g>

                {/* Subtle Lock Indicator */}
                {card.locked && (
                  <g
                    transform={`translate(${card.rect.left + card.rect.width - 30}, ${card.rect.top + 12})`}
                    pointerEvents="none"
                  >
                    <rect width={20} height={20} rx={6} fill="rgba(15,23,42,0.72)" />
                    <foreignObject x={3} y={3} width={14} height={14}>
                      <Lock className="w-3.5 h-3.5 text-amber-300" />
                    </foreignObject>
                  </g>
                )}

                {/* Selection or Drop-to-Swap Highlight Ring */}
                {(isSelected || isDropTarget) && (
                  <>
                    {contourPath ? (
                      <path
                        d={contourPath}
                        transform={`translate(${card.rect.left} ${card.rect.top})`}
                        fill={isDropTarget ? 'rgba(37, 99, 235, 0.14)' : 'none'}
                        stroke={isDropTarget ? '#2563EB' : '#0EA5E9'}
                        strokeWidth={Math.max(2, 2.2 * uiScaleInv)}
                        strokeDasharray={isDropTarget ? '8 5' : undefined}
                        pointerEvents="none"
                      />
                    ) : (
                      <rect
                        x={card.rect.left}
                        y={card.rect.top}
                        width={card.rect.width}
                        height={card.rect.height}
                        rx={rx}
                        ry={rx}
                        fill={isDropTarget ? 'rgba(37, 99, 235, 0.14)' : 'none'}
                        stroke={isDropTarget ? '#2563EB' : '#0EA5E9'}
                        strokeWidth={Math.max(2, 2.2 * uiScaleInv)}
                        strokeDasharray={isDropTarget ? '8 5' : undefined}
                        pointerEvents="none"
                      />
                    )}
                  </>
                )}

                {/* Drag-to-Swap Handle Pill (visible cleanly on hover or selection) */}
                {(isHovered || isSelected) && !isEditing && (
                  <foreignObject
                    x={Math.max(8, card.rect.left + card.rect.width - 38 * uiScaleInv)}
                    y={Math.max(8, card.rect.top + 10)}
                    width={30 * uiScaleInv}
                    height={30 * uiScaleInv}
                  >
                    <div
                      draggable
                      title="Drag onto another card to swap contents"
                      data-testid={`card-drag-handle-${card.slotId}`}
                      onDragStart={(e) => {
                        e.stopPropagation();
                        setDragSwapSourceId(card.id);
                        e.dataTransfer.setData('application/x-mosaika-card', card.id);
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                      onDragEnd={() => {
                        setDragSwapSourceId(null);
                        setDragOverCardId(null);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center justify-center rounded-md bg-zinc-950/75 text-white hover:bg-zinc-900 cursor-grab active:cursor-grabbing"
                      style={{
                        width: `${26 * uiScaleInv}px`,
                        height: `${26 * uiScaleInv}px`,
                      }}
                    >
                      <GripVertical
                        style={{ width: `${14 * uiScaleInv}px`, height: `${14 * uiScaleInv}px` }}
                      />
                    </div>
                  </foreignObject>
                )}
              </g>
            );
          })}

          {/* Subtle Film Grain Texture Overlay */}
          {snapshot.grainEnabled && (
            <rect
              x={0}
              y={0}
              width={snapshot.canvasWidth}
              height={snapshot.canvasHeight}
              filter="url(#studio-film-grain)"
              opacity={isDarkTheme ? 0.06 : 0.045}
              pointerEvents="none"
            />
          )}

          {/* Swiss Grid Lattice Overlay */}
          {showGridOverlay && bentoOverlays?.lattice && (
            <g pointerEvents="none" data-testid="studio-swiss-grid-overlay">
              {bentoOverlays.lattice.colBands.map((band) => (
                <g key={`sc-${band.index}`}>
                  <rect
                    x={band.start}
                    y={bentoOverlays.doc.anchorRect.top}
                    width={band.size}
                    height={bentoOverlays.doc.anchorRect.height}
                    fill={isDarkTheme ? 'rgba(244, 63, 94, 0.09)' : 'rgba(244, 63, 94, 0.055)'}
                    stroke={isDarkTheme ? 'rgba(244, 63, 94, 0.22)' : 'rgba(244, 63, 94, 0.16)'}
                    strokeWidth={1}
                  />
                  <text
                    x={band.start + band.size / 2}
                    y={Math.max(14, bentoOverlays.doc.anchorRect.top - 8)}
                    textAnchor="middle"
                    fontSize={badgeFontPx}
                    fontFamily="monospace"
                    fill={isDarkTheme ? 'rgba(251, 113, 133, 0.8)' : 'rgba(225, 29, 72, 0.7)'}
                  >
                    {band.index + 1}
                  </text>
                </g>
              ))}
              {bentoOverlays.lattice.rowBands.map((band) => (
                <rect
                  key={`sr-${band.index}`}
                  x={bentoOverlays.doc.anchorRect.left}
                  y={band.start}
                  width={bentoOverlays.doc.anchorRect.width}
                  height={band.size}
                  fill="none"
                  stroke={isDarkTheme ? 'rgba(56, 189, 248, 0.22)' : 'rgba(37, 99, 235, 0.18)'}
                  strokeWidth={1}
                  strokeDasharray="5 5"
                />
              ))}
            </g>
          )}

          {/* Direct On-Canvas Interactive Split-Gutter Handles */}
          {bentoOverlays &&
            bentoOverlays.handles.map((handle) => {
              const isDraggingThis = draggingGutter?.nodeId === handle.nodeId;
              const isHoveredThis = hoveredGutterId === handle.nodeId;
              const showVisual = isDraggingThis || isHoveredThis;
              const g = bentoOverlays.doc.params.gutterPt;

              if (handle.axis === 'vertical') {
                const centerX = handle.gutterRect.left + handle.gutterRect.width / 2;
                const hitW = Math.max(handle.gutterRect.width, 18 * uiScaleInv);
                const availW = Math.max(0, handle.parentRect.width - g);
                const w1 = Math.round(availW * handle.ratio);
                const w2 = Math.round(availW - w1);
                const midY = handle.gutterRect.top + handle.gutterRect.height / 2;

                return (
                  <g
                    key={`sg-${handle.nodeId}`}
                    className={handle.locked ? 'cursor-not-allowed' : 'cursor-col-resize'}
                    onMouseEnter={() => setHoveredGutterId(handle.nodeId)}
                    onMouseLeave={() => setHoveredGutterId(null)}
                    onPointerDown={(e) => handleGutterDown(e, handle, g)}
                    onPointerMove={handleGutterMove}
                    onPointerUp={handleGutterUp}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      if (!handle.locked) {
                        onResizeSplit(handle.nodeId, 0.5, true, true);
                      }
                    }}
                  >
                    <rect
                      x={centerX - hitW / 2}
                      y={handle.gutterRect.top}
                      width={hitW}
                      height={handle.gutterRect.height}
                      fill="transparent"
                    />
                    {showVisual && (
                      <g pointerEvents="none">
                        <line
                          x1={centerX}
                          y1={handle.gutterRect.top + 6}
                          x2={centerX}
                          y2={handle.gutterRect.top + handle.gutterRect.height - 6}
                          stroke={handle.locked ? '#D97706' : '#0EA5E9'}
                          strokeWidth={(isDraggingThis ? 3 : 2) * uiScaleInv}
                          strokeDasharray={handle.locked ? '6 4' : undefined}
                        />
                        <rect
                          x={centerX - 4.5 * uiScaleInv}
                          y={midY - 22 * uiScaleInv}
                          width={9 * uiScaleInv}
                          height={44 * uiScaleInv}
                          rx={4.5 * uiScaleInv}
                          fill={handle.locked ? '#D97706' : '#0EA5E9'}
                          stroke="#FFFFFF"
                          strokeWidth={1.5 * uiScaleInv}
                        />
                        {isDraggingThis && !handle.locked && (
                          <g>
                            <rect
                              x={centerX - 72 * uiScaleInv}
                              y={midY - 52 * uiScaleInv}
                              width={144 * uiScaleInv}
                              height={24 * uiScaleInv}
                              rx={6 * uiScaleInv}
                              fill="#09090B"
                            />
                            <text
                              x={centerX}
                              y={midY - 36 * uiScaleInv}
                              textAnchor="middle"
                              fontSize={badgeFontPx}
                              fontFamily="monospace"
                              fontWeight={600}
                              fill="#FFFFFF"
                            >
                              {w1} | {w2}px · {formatHarmonicBadge(handle.ratio)}
                            </text>
                          </g>
                        )}
                      </g>
                    )}
                  </g>
                );
              }

              const centerY = handle.gutterRect.top + handle.gutterRect.height / 2;
              const hitH = Math.max(handle.gutterRect.height, 18 * uiScaleInv);
              const availH = Math.max(0, handle.parentRect.height - g);
              const h1 = Math.round(availH * handle.ratio);
              const h2 = Math.round(availH - h1);
              const midX = handle.gutterRect.left + handle.gutterRect.width / 2;

              return (
                <g
                  key={`sg-${handle.nodeId}`}
                  className={handle.locked ? 'cursor-not-allowed' : 'cursor-row-resize'}
                  onMouseEnter={() => setHoveredGutterId(handle.nodeId)}
                  onMouseLeave={() => setHoveredGutterId(null)}
                  onPointerDown={(e) => handleGutterDown(e, handle, g)}
                  onPointerMove={handleGutterMove}
                  onPointerUp={handleGutterUp}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    if (!handle.locked) {
                      onResizeSplit(handle.nodeId, 0.5, true, true);
                    }
                  }}
                >
                  <rect
                    x={handle.gutterRect.left}
                    y={centerY - hitH / 2}
                    width={handle.gutterRect.width}
                    height={hitH}
                    fill="transparent"
                  />
                  {showVisual && (
                    <g pointerEvents="none">
                      <line
                        x1={handle.gutterRect.left + 6}
                        y1={centerY}
                        x2={handle.gutterRect.left + handle.gutterRect.width - 6}
                        y2={centerY}
                        stroke={handle.locked ? '#D97706' : '#0EA5E9'}
                        strokeWidth={(isDraggingThis ? 3 : 2) * uiScaleInv}
                        strokeDasharray={handle.locked ? '6 4' : undefined}
                      />
                      <rect
                        x={midX - 22 * uiScaleInv}
                        y={centerY - 4.5 * uiScaleInv}
                        width={44 * uiScaleInv}
                        height={9 * uiScaleInv}
                        rx={4.5 * uiScaleInv}
                        fill={handle.locked ? '#D97706' : '#0EA5E9'}
                        stroke="#FFFFFF"
                        strokeWidth={1.5 * uiScaleInv}
                      />
                      {isDraggingThis && !handle.locked && (
                        <g>
                          <rect
                            x={midX - 72 * uiScaleInv}
                            y={centerY - 34 * uiScaleInv}
                            width={144 * uiScaleInv}
                            height={24 * uiScaleInv}
                            rx={6 * uiScaleInv}
                            fill="#09090B"
                          />
                          <text
                            x={midX}
                            y={centerY - 18 * uiScaleInv}
                            textAnchor="middle"
                            fontSize={badgeFontPx}
                            fontFamily="monospace"
                            fontWeight={600}
                            fill="#FFFFFF"
                          >
                            {h1} | {h2}px · {formatHarmonicBadge(handle.ratio)}
                          </text>
                        </g>
                      )}
                    </g>
                  )}
                </g>
              );
            })}
        </svg>

        {/* Empty Artboard Callout */}
        {snapshot.cards.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 pointer-events-none">
            <div
              className="px-5 py-4 rounded-xl text-xs max-w-xs shadow-sm"
              style={{
                backgroundColor: isDarkTheme ? 'rgba(20, 22, 27, 0.92)' : 'rgba(255, 255, 255, 0.94)',
                border: `1px solid ${isDarkTheme ? 'rgba(255,255,255,0.1)' : 'rgba(15,23,42,0.1)'}`,
                color: isDarkTheme ? '#E4E4E7' : '#27272A',
              }}
            >
              <p className="font-semibold text-[13px]">Canvas is clear</p>
              <p className="mt-1 opacity-70">
                Open the Library or click Create Starter Bento in the Canvas panel on the right.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Floating Bottom Dock Slot */}
      {children}
    </div>
  );
}
