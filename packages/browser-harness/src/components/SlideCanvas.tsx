import { useEffect, useMemo, useRef, useState } from 'react';
import { BENTO_TAGS, type HostCapabilities, type RectPt, type SplitAxis } from '@bento/contract';
import {
  computeGridLattice,
  DEFAULT_TEXTFRAME_STYLE,
  hydrateStateFromJson,
  resolveSplitHandles,
  type ResolvedSplitHandle,
} from '@bento/core';
import { Lock, Trash2 } from 'lucide-react';
import { SLIDE_BOUNDS, type MockShape, type MockSlide } from '../mockHost.js';

export interface SlideCanvasProps {
  slide: MockSlide;
  capabilities: HostCapabilities;
  isDarkTheme: boolean;
  showGridOverlay: boolean;
  onDrawPlaceholder: (rect: RectPt) => void;
  onSelectShapes: (ids: string[]) => void;
  onUpdateShapeText: (shapeId: string, text: string) => void;
  onDeleteShape: (shapeId: string) => void;
  onDeleteSelected: () => void;
  onResizeSplit: (
    bentoId: string,
    nodeId: string,
    nextRatio: number,
    snapHarmonic: boolean,
    commit: boolean
  ) => void;
}

const TOTAL_VIEWBOX_W = 1216;
const TOTAL_VIEWBOX_H = 540;

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

export function SlideCanvas({
  slide,
  capabilities,
  isDarkTheme,
  showGridOverlay,
  onDrawPlaceholder,
  onSelectShapes,
  onUpdateShapeText,
  onDeleteShape,
  onDeleteSelected,
  onResizeSplit,
}: SlideCanvasProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [drawCurrent, setDrawCurrent] = useState<{ x: number; y: number } | null>(null);
  const [editingShapeId, setEditingShapeId] = useState<string | null>(null);
  const [hoveredGutterId, setHoveredGutterId] = useState<string | null>(null);
  const [draggingGutter, setDraggingGutter] = useState<{
    bentoId: string;
    nodeId: string;
    axis: SplitAxis;
    parentRect: RectPt;
    gutterPt: number;
    lastRatio: number;
  } | null>(null);

  // Hydrate active bento tree on this slide to expose direct on-canvas gutter sliders
  const activeBentoInfo = useMemo(() => {
    const bentoShapes = slide.shapes.filter(
      (s) => s.kind === 'bento-card' && Boolean(s.tags[BENTO_TAGS.ID])
    );
    if (bentoShapes.length === 0) return null;

    const selectedBento = bentoShapes.find((s) => slide.selectedShapeIds.includes(s.id));
    const bentoId = (selectedBento ?? bentoShapes[0]!).tags[BENTO_TAGS.ID];
    if (!bentoId) return null;

    let highestRev = -1;
    let stateJson: string | undefined;
    for (const sh of bentoShapes) {
      if (sh.tags[BENTO_TAGS.ID] !== bentoId) continue;
      const rev = Number.parseInt(sh.tags[BENTO_TAGS.REV] ?? '0', 10);
      if (rev >= highestRev && sh.tags[BENTO_TAGS.STATE]) {
        highestRev = rev;
        stateJson = sh.tags[BENTO_TAGS.STATE];
      }
    }
    if (!stateJson) return null;
    const doc = hydrateStateFromJson(stateJson);
    if (!doc) return null;
    const handles = resolveSplitHandles(doc.tree, doc.anchorRect, doc.params.gutterPt);
    const lattice = computeGridLattice(doc.anchorRect, doc.params.gutterPt, doc.params.gridSystem);
    return { bentoId, doc, handles, lattice };
  }, [slide.shapes, slide.selectedShapeIds]);

  // Keyboard Delete/Backspace deletes selected shapes when not typing in textarea
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName.toLowerCase();
      if (activeTag === 'textarea' || activeTag === 'input') {
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (slide.selectedShapeIds.length > 0) {
          e.preventDefault();
          onDeleteSelected();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onDeleteSelected, slide.selectedShapeIds.length]);

  const clientToSlidePt = (clientX: number, clientY: number): { x: number; y: number } | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const x = ((clientX - rect.left) / rect.width) * TOTAL_VIEWBOX_W;
    const y = ((clientY - rect.top) / rect.height) * TOTAL_VIEWBOX_H;
    return {
      x: Math.max(0, Math.min(SLIDE_BOUNDS.width, x)),
      y: Math.max(0, Math.min(SLIDE_BOUNDS.height, y)),
    };
  };

  const handleCanvasPointerDown = (e: React.PointerEvent<SVGRectElement>) => {
    if (e.button !== 0) return;
    setEditingShapeId(null);
    const pt = clientToSlidePt(e.clientX, e.clientY);
    if (!pt) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrawStart(pt);
    setDrawCurrent(pt);
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<SVGRectElement>) => {
    if (!drawStart) return;
    const pt = clientToSlidePt(e.clientX, e.clientY);
    if (pt) {
      setDrawCurrent(pt);
    }
  };

  const handleCanvasPointerUp = (e: React.PointerEvent<SVGRectElement>) => {
    if (!drawStart || !drawCurrent) {
      setDrawStart(null);
      setDrawCurrent(null);
      return;
    }
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }

    const left = Math.min(drawStart.x, drawCurrent.x);
    const top = Math.min(drawStart.y, drawCurrent.y);
    const width = Math.abs(drawCurrent.x - drawStart.x);
    const height = Math.abs(drawCurrent.y - drawStart.y);

    setDrawStart(null);
    setDrawCurrent(null);

    if (width >= 24 && height >= 24) {
      onDrawPlaceholder({ left, top, width, height });
    } else {
      onSelectShapes([]);
    }
  };

  const draftRect: RectPt | null =
    drawStart && drawCurrent
      ? {
          left: Math.min(drawStart.x, drawCurrent.x),
          top: Math.min(drawStart.y, drawCurrent.y),
          width: Math.abs(drawCurrent.x - drawStart.x),
          height: Math.abs(drawCurrent.y - drawStart.y),
        }
      : null;

  const selectedSet = new Set(slide.selectedShapeIds);

  const handleShapeClick = (e: React.MouseEvent, shape: MockShape) => {
    e.stopPropagation();
    if (e.shiftKey) {
      if (selectedSet.has(shape.id)) {
        onSelectShapes(slide.selectedShapeIds.filter((id) => id !== shape.id));
      } else {
        onSelectShapes([...slide.selectedShapeIds, shape.id]);
      }
    } else {
      onSelectShapes([shape.id]);
    }
  };

  const handleGutterDown = (
    e: React.PointerEvent<SVGGElement>,
    bentoId: string,
    handle: ResolvedSplitHandle,
    gutterPt: number
  ) => {
    if (handle.locked) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setEditingShapeId(null);
    setDraggingGutter({
      bentoId,
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
    const pt = clientToSlidePt(e.clientX, e.clientY);
    if (!pt) return;
    const pr = draggingGutter.parentRect;
    const g = draggingGutter.gutterPt;
    const nextRatio =
      draggingGutter.axis === 'vertical'
        ? (pt.x - pr.left - g / 2) / Math.max(1, pr.width - g)
        : (pt.y - pr.top - g / 2) / Math.max(1, pr.height - g);
    setDraggingGutter((prev) => (prev ? { ...prev, lastRatio: nextRatio } : null));
    onResizeSplit(draggingGutter.bentoId, draggingGutter.nodeId, nextRatio, !e.altKey, false);
  };

  const handleGutterUp = (e: React.PointerEvent<SVGGElement>) => {
    if (!draggingGutter) return;
    e.stopPropagation();
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    const { bentoId, nodeId, lastRatio } = draggingGutter;
    setDraggingGutter(null);
    onResizeSplit(bentoId, nodeId, lastRatio, !e.altKey, true);
  };

  const stashedShapes = slide.shapes.filter((s) => s.kind === 'stashed');

  return (
    <div className="flex flex-1 flex-col items-center justify-center overflow-hidden p-4">
      <div className="relative flex w-full max-w-[1160px] flex-col gap-2">
        <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-zinc-400">
          <span>
            16:9 Slide Canvas (<span className="font-mono tabular-nums">960 × 540 pt</span>) — Drag
            gutters between cards to resize (<kbd className="rounded border border-slate-300 px-1 py-0.5 font-mono text-[9.5px] dark:border-zinc-700">Alt</kbd> for fine drag, double-click for 1:1).
          </span>
          <span className="font-mono text-[10px] tabular-nums">
            Off-Slide Stash: {stashedShapes.length} card(s) @ x=984pt
          </span>
        </div>

        <svg
          ref={svgRef}
          viewBox={`0 0 ${TOTAL_VIEWBOX_W} ${TOTAL_VIEWBOX_H}`}
          className="h-auto w-full rounded-xl border border-slate-200 bg-slate-100/80 shadow-sm select-none dark:border-zinc-800 dark:bg-zinc-900/70"
          data-testid="slide-canvas-svg"
        >
          <defs>
            <filter id="bento-elevated-shadow" x="-20%" y="-20%" width="140%" height="150%">
              <feDropShadow
                dx="0"
                dy="6"
                stdDeviation="9"
                floodColor="#0F172A"
                floodOpacity="0.12"
              />
            </filter>
            <linearGradient id="bento-caption-scrim" x1="0" y1="0" x2="0" y2="1">
              <stop offset="55%" stopColor="#000000" stopOpacity="0" />
              <stop offset="100%" stopColor="#000000" stopOpacity="0.65" />
            </linearGradient>
            <pattern id="bento-dot-grid" width="24" height="24" patternUnits="userSpaceOnUse">
              <circle
                cx="12"
                cy="12"
                r="0.8"
                fill={isDarkTheme ? '#3f3f46' : '#cbd5e1'}
                opacity="0.6"
              />
            </pattern>
          </defs>

          {/* 16:9 Active Slide Artboard (0..960 x 0..540) */}
          <rect
            x={0}
            y={0}
            width={SLIDE_BOUNDS.width}
            height={SLIDE_BOUNDS.height}
            fill={isDarkTheme ? '#09090b' : '#ffffff'}
            stroke={isDarkTheme ? '#27272a' : '#cbd5e1'}
            strokeWidth={1}
          />
          <rect
            x={0}
            y={0}
            width={SLIDE_BOUNDS.width}
            height={SLIDE_BOUNDS.height}
            fill="url(#bento-dot-grid)"
            className="cursor-crosshair"
            data-testid="slide-draw-surface"
            onPointerDown={handleCanvasPointerDown}
            onPointerMove={handleCanvasPointerMove}
            onPointerUp={handleCanvasPointerUp}
          />

          {/* Slide Chrome (Title & Footer) */}
          {slide.hasChrome && (
            <g pointerEvents="none">
              <text
                x={48}
                y={56}
                fontSize={24}
                fontWeight={700}
                fill={isDarkTheme ? '#f4f4f5' : '#0f172a'}
                letterSpacing="-0.02em"
              >
                {slide.title}
              </text>
              <text
                x={48}
                y={78}
                fontSize={12}
                fill={isDarkTheme ? '#a1a1aa' : '#64748b'}
              >
                {slide.subtitle}
              </text>
              <line
                x1={48}
                y1={92}
                x2={912}
                y2={92}
                stroke={isDarkTheme ? '#27272a' : '#e2e8f0'}
                strokeWidth={1}
              />
              <text
                x={912}
                y={522}
                textAnchor="end"
                fontSize={10}
                fill={isDarkTheme ? '#71717a' : '#94a3b8'}
              >
                {slide.hasMorphTransition ? 'Morph Transition Active' : 'Mosaika Deck'}
              </text>
            </g>
          )}

          {/* Off-Slide Stash Area (x = 984..1216) */}
          <g data-testid="offslide-stash-area">
            <rect
              x={968}
              y={8}
              width={240}
              height={524}
              rx={10}
              fill={isDarkTheme ? '#18181b' : '#f1f5f9'}
              stroke={isDarkTheme ? '#3f3f46' : '#cbd5e1'}
              strokeWidth={1}
              strokeDasharray="5 4"
            />
            <text
              x={984}
              y={26}
              fontSize={10}
              fontWeight={700}
              fill={isDarkTheme ? '#a1a1aa' : '#475569'}
              letterSpacing="0.06em"
            >
              OFF-SLIDE STASH (x=984pt)
            </text>
            {stashedShapes.length === 0 && (
              <text
                x={1088}
                y={270}
                textAnchor="middle"
                fontSize={11}
                fill={isDarkTheme ? '#71717a' : '#94a3b8'}
              >
                Non-empty retired cards appear here
              </text>
            )}
          </g>

          {/* Render All Shapes */}
          {slide.shapes.map((shape) => {
            const isSelected = selectedSet.has(shape.id);
            const isEditing = editingShapeId === shape.id;
            const slotId = shape.tags[BENTO_TAGS.SLOT_ID];
            const adj = capabilities.supportsCornerRadius ? shape.cornerAdjustment : 0;
            const rx = adj * Math.min(shape.rect.width, shape.rect.height);

            const fillColor = shape.style.fillHex ?? 'transparent';
            const strokeColor = shape.style.borderColorHex
              ? hexToRgba(shape.style.borderColorHex, shape.style.borderTransparency)
              : 'none';
            const useShadow = Boolean(capabilities.supportsShadows && shape.style.shadow);
            const clipId = `clip-${shape.id}`;

            return (
              <g
                key={shape.id}
                data-testid={
                  shape.kind === 'stashed'
                    ? `stashed-shape-${shape.id}`
                    : slotId
                      ? `canvas-card-${slotId}`
                      : `canvas-shape-${shape.id}`
                }
                data-shape-kind={shape.kind}
                data-slot-id={slotId ?? ''}
                onClick={(e) => handleShapeClick(e, shape)}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  if (shape.kind !== 'placeholder') {
                    setEditingShapeId(shape.id);
                  }
                }}
                className="cursor-pointer"
              >
                <defs>
                  <clipPath id={clipId}>
                    {shape.svgPath ? (
                      <path
                        d={shape.svgPath}
                        transform={`translate(${shape.rect.left} ${shape.rect.top})`}
                      />
                    ) : (
                      <rect
                        x={shape.rect.left}
                        y={shape.rect.top}
                        width={shape.rect.width}
                        height={shape.rect.height}
                        rx={rx}
                        ry={rx}
                      />
                    )}
                  </clipPath>
                </defs>

                {/* Base Shape (Native RoundedRectangle or Custom Sculpted/Puzzle Freeform Path) */}
                {shape.svgPath ? (
                  <path
                    d={shape.svgPath}
                    transform={`translate(${shape.rect.left} ${shape.rect.top})`}
                    fill={fillColor}
                    stroke={strokeColor}
                    strokeWidth={shape.style.borderWeightPt}
                    strokeDasharray={shape.style.borderDashed ? '6 4' : undefined}
                    filter={useShadow ? 'url(#bento-elevated-shadow)' : undefined}
                  />
                ) : (
                  <rect
                    x={shape.rect.left}
                    y={shape.rect.top}
                    width={shape.rect.width}
                    height={shape.rect.height}
                    rx={rx}
                    ry={rx}
                    fill={fillColor}
                    stroke={strokeColor}
                    strokeWidth={shape.style.borderWeightPt}
                    strokeDasharray={shape.style.borderDashed ? '6 4' : undefined}
                    filter={useShadow ? 'url(#bento-elevated-shadow)' : undefined}
                  />
                )}

                {/* Optional Image Fill + Scrim */}
                {shape.imageDataUrl && (
                  <g clipPath={`url(#${clipId})`} pointerEvents="none">
                    <image
                      href={shape.imageDataUrl}
                      x={shape.rect.left}
                      y={shape.rect.top}
                      width={shape.rect.width}
                      height={shape.rect.height}
                      preserveAspectRatio="xMidYMid slice"
                    />
                    {shape.hasScrim && capabilities.supportsImageCropScrim && (
                      <rect
                        x={shape.rect.left}
                        y={shape.rect.top}
                        width={shape.rect.width}
                        height={shape.rect.height}
                        fill="url(#bento-caption-scrim)"
                      />
                    )}
                  </g>
                )}

                {/* Placeholder label */}
                {shape.kind === 'placeholder' && (
                  <text
                    x={shape.rect.left + shape.rect.width / 2}
                    y={shape.rect.top + shape.rect.height / 2}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={13}
                    fontWeight={600}
                    fill="#2563EB"
                    pointerEvents="none"
                  >
                    Bounding Box ({Math.round(shape.rect.width)} × {Math.round(shape.rect.height)} pt)
                  </text>
                )}

                {/* Editable Text Frame inside Bento & Stashed Cards */}
                {shape.kind !== 'placeholder' && (
                  <foreignObject
                    x={shape.rect.left}
                    y={shape.rect.top}
                    width={shape.rect.width}
                    height={shape.rect.height}
                    clipPath={`url(#${clipId})`}
                  >
                    <div
                      className="flex h-full w-full flex-col"
                      style={{
                        paddingLeft: shape.kind === 'stashed' ? 10 : DEFAULT_TEXTFRAME_STYLE.marginLeftPt,
                        paddingRight: shape.kind === 'stashed' ? 10 : DEFAULT_TEXTFRAME_STYLE.marginRightPt,
                        paddingTop: shape.kind === 'stashed' ? 8 : DEFAULT_TEXTFRAME_STYLE.marginTopPt,
                        paddingBottom: shape.kind === 'stashed' ? 8 : DEFAULT_TEXTFRAME_STYLE.marginBottomPt,
                      }}
                    >
                      <div className="mb-1 flex items-center justify-between gap-1 text-[9px] font-medium opacity-60">
                        <span
                          className="truncate font-mono"
                          style={{ color: shape.style.textColorHex }}
                        >
                          {shape.shapeName}
                        </span>
                        {shape.locked && (
                          <Lock
                            className="h-2.5 w-2.5 shrink-0"
                            style={{ color: shape.style.textColorHex }}
                          />
                        )}
                      </div>
                      <textarea
                        value={shape.text}
                        placeholder={
                          shape.kind === 'stashed'
                            ? 'Stashed card'
                            : shape.contentHint
                              ? `${shape.contentHint} — click to type…`
                              : 'Click to type...'
                        }
                        data-testid={
                          shape.kind === 'stashed'
                            ? `stashed-text-${shape.id}`
                            : slotId
                              ? `card-input-${slotId}`
                              : `shape-input-${shape.id}`
                        }
                        onFocus={() => {
                          setEditingShapeId(shape.id);
                          onSelectShapes([shape.id]);
                        }}
                        onBlur={() => setEditingShapeId(null)}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => onUpdateShapeText(shape.id, e.target.value)}
                        style={{
                          color: shape.style.textColorHex,
                          fontSize: shape.kind === 'stashed' ? 11 : 13,
                        }}
                        className={`h-full w-full resize-none bg-transparent leading-snug outline-none placeholder:opacity-40 ${
                          isEditing ? 'cursor-text' : 'cursor-pointer'
                        }`}
                      />
                    </div>
                  </foreignObject>
                )}

                {/* Active Selection Ring & Quick Delete Control */}
                {isSelected && (
                  <g>
                    {shape.svgPath ? (
                      <path
                        d={shape.svgPath}
                        transform={`translate(${shape.rect.left} ${shape.rect.top})`}
                        fill="none"
                        stroke="#2563EB"
                        strokeWidth={2}
                        pointerEvents="none"
                      />
                    ) : (
                      <rect
                        x={shape.rect.left - 1.5}
                        y={shape.rect.top - 1.5}
                        width={shape.rect.width + 3}
                        height={shape.rect.height + 3}
                        rx={rx + 1.5}
                        ry={rx + 1.5}
                        fill="none"
                        stroke="#2563EB"
                        strokeWidth={2}
                        pointerEvents="none"
                      />
                    )}
                    <g
                      data-testid={slotId ? `canvas-delete-${slotId}` : `canvas-delete-${shape.id}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteShape(shape.id);
                      }}
                      className="cursor-pointer"
                    >
                      <circle
                        cx={shape.rect.left + shape.rect.width - 8}
                        cy={shape.rect.top + 8}
                        r={10}
                        fill="#EF4444"
                        stroke="#FFFFFF"
                        strokeWidth={1.5}
                      />
                      <foreignObject
                        x={shape.rect.left + shape.rect.width - 14}
                        y={shape.rect.top + 2}
                        width={12}
                        height={12}
                        pointerEvents="none"
                      >
                        <Trash2 className="h-3 w-3 text-white" />
                      </foreignObject>
                    </g>
                  </g>
                )}
              </g>
            );
          })}

          {/* Swiss Modular Grid Overlay (Translucent Column & Row Lattice behind/over cards) */}
          {showGridOverlay && activeBentoInfo?.lattice && (
            <g pointerEvents="none" data-testid="canvas-swiss-grid-overlay">
              {activeBentoInfo.lattice.colBands.map((band) => (
                <g key={`sc-${band.index}`}>
                  <rect
                    x={band.start}
                    y={activeBentoInfo.doc.anchorRect.top}
                    width={band.size}
                    height={activeBentoInfo.doc.anchorRect.height}
                    fill={isDarkTheme ? 'rgba(244, 63, 94, 0.08)' : 'rgba(244, 63, 94, 0.055)'}
                    stroke={isDarkTheme ? 'rgba(244, 63, 94, 0.16)' : 'rgba(244, 63, 94, 0.14)'}
                    strokeWidth={0.5}
                  />
                  <text
                    x={band.start + band.size / 2}
                    y={activeBentoInfo.doc.anchorRect.top - 4}
                    textAnchor="middle"
                    fontSize={8}
                    fontFamily="monospace"
                    fill={isDarkTheme ? 'rgba(251, 113, 133, 0.7)' : 'rgba(225, 29, 72, 0.6)'}
                  >
                    {band.index + 1}
                  </text>
                </g>
              ))}
              {activeBentoInfo.lattice.rowBands.map((band) => (
                <rect
                  key={`sr-${band.index}`}
                  x={activeBentoInfo.doc.anchorRect.left}
                  y={band.start}
                  width={activeBentoInfo.doc.anchorRect.width}
                  height={band.size}
                  fill="none"
                  stroke={isDarkTheme ? 'rgba(56, 189, 248, 0.18)' : 'rgba(37, 99, 235, 0.14)'}
                  strokeWidth={0.6}
                  strokeDasharray="3 3"
                />
              ))}
            </g>
          )}

          {/* Direct On-Canvas Interactive Gutter Resize Handles */}
          {activeBentoInfo &&
            activeBentoInfo.handles.map((handle) => {
              const isDraggingThis = draggingGutter?.nodeId === handle.nodeId;
              const isHoveredThis = hoveredGutterId === handle.nodeId;
              const showVisual = isDraggingThis || isHoveredThis;
              const g = activeBentoInfo.doc.params.gutterPt;

              if (handle.axis === 'vertical') {
                const centerX = handle.gutterRect.left + handle.gutterRect.width / 2;
                const hitW = Math.max(handle.gutterRect.width, 14);
                const availW = Math.max(0, handle.parentRect.width - g);
                const w1 = Math.round(availW * handle.ratio);
                const w2 = Math.round(availW - w1);
                const midY = handle.gutterRect.top + handle.gutterRect.height / 2;

                return (
                  <g
                    key={`sg-${handle.nodeId}`}
                    data-testid={`canvas-gutter-${handle.nodeId}`}
                    className={handle.locked ? 'cursor-not-allowed' : 'cursor-col-resize'}
                    onMouseEnter={() => setHoveredGutterId(handle.nodeId)}
                    onMouseLeave={() => setHoveredGutterId(null)}
                    onPointerDown={(e) => handleGutterDown(e, activeBentoInfo.bentoId, handle, g)}
                    onPointerMove={handleGutterMove}
                    onPointerUp={handleGutterUp}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      if (!handle.locked) {
                        onResizeSplit(activeBentoInfo.bentoId, handle.nodeId, 0.5, true, true);
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
                          y1={handle.gutterRect.top + 4}
                          x2={centerX}
                          y2={handle.gutterRect.top + handle.gutterRect.height - 4}
                          stroke={handle.locked ? '#D97706' : '#2563EB'}
                          strokeWidth={isDraggingThis ? 2.2 : 1.5}
                          strokeDasharray={handle.locked ? '4 3' : undefined}
                          opacity={isDraggingThis ? 0.95 : 0.7}
                        />
                        <rect
                          x={centerX - 3.5}
                          y={midY - 18}
                          width={7}
                          height={36}
                          rx={3.5}
                          fill={handle.locked ? '#D97706' : '#2563EB'}
                          stroke="#FFFFFF"
                          strokeWidth={1.2}
                        />
                        {isDraggingThis && !handle.locked && (
                          <g>
                            <rect
                              x={centerX - 58}
                              y={midY - 42}
                              width={116}
                              height={20}
                              rx={5}
                              fill="#0F172A"
                              opacity={0.92}
                            />
                            <text
                              x={centerX}
                              y={midY - 29}
                              textAnchor="middle"
                              fontSize={9.5}
                              fontFamily="monospace"
                              fontWeight={600}
                              fill="#FFFFFF"
                            >
                              {w1} | {w2}pt · {formatHarmonicBadge(handle.ratio)}
                            </text>
                          </g>
                        )}
                      </g>
                    )}
                  </g>
                );
              }

              const centerY = handle.gutterRect.top + handle.gutterRect.height / 2;
              const hitH = Math.max(handle.gutterRect.height, 14);
              const availH = Math.max(0, handle.parentRect.height - g);
              const h1 = Math.round(availH * handle.ratio);
              const h2 = Math.round(availH - h1);
              const midX = handle.gutterRect.left + handle.gutterRect.width / 2;

              return (
                <g
                  key={`sg-${handle.nodeId}`}
                  data-testid={`canvas-gutter-${handle.nodeId}`}
                  className={handle.locked ? 'cursor-not-allowed' : 'cursor-row-resize'}
                  onMouseEnter={() => setHoveredGutterId(handle.nodeId)}
                  onMouseLeave={() => setHoveredGutterId(null)}
                  onPointerDown={(e) => handleGutterDown(e, activeBentoInfo.bentoId, handle, g)}
                  onPointerMove={handleGutterMove}
                  onPointerUp={handleGutterUp}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    if (!handle.locked) {
                      onResizeSplit(activeBentoInfo.bentoId, handle.nodeId, 0.5, true, true);
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
                        x1={handle.gutterRect.left + 4}
                        y1={centerY}
                        x2={handle.gutterRect.left + handle.gutterRect.width - 4}
                        y2={centerY}
                        stroke={handle.locked ? '#D97706' : '#2563EB'}
                        strokeWidth={isDraggingThis ? 2.2 : 1.5}
                        strokeDasharray={handle.locked ? '4 3' : undefined}
                        opacity={isDraggingThis ? 0.95 : 0.7}
                      />
                      <rect
                        x={midX - 18}
                        y={centerY - 3.5}
                        width={36}
                        height={7}
                        rx={3.5}
                        fill={handle.locked ? '#D97706' : '#2563EB'}
                        stroke="#FFFFFF"
                        strokeWidth={1.2}
                      />
                      {isDraggingThis && !handle.locked && (
                        <g>
                          <rect
                            x={midX - 58}
                            y={centerY - 28}
                            width={116}
                            height={20}
                            rx={5}
                            fill="#0F172A"
                            opacity={0.92}
                          />
                          <text
                            x={midX}
                            y={centerY - 15}
                            textAnchor="middle"
                            fontSize={9.5}
                            fontFamily="monospace"
                            fontWeight={600}
                            fill="#FFFFFF"
                          >
                            {h1} / {h2}pt · {formatHarmonicBadge(handle.ratio)}
                          </text>
                        </g>
                      )}
                    </g>
                  )}
                </g>
              );
            })}

          {/* Active Drawing Bounding Rectangle Preview */}
          {draftRect && draftRect.width > 2 && draftRect.height > 2 && (
            <g pointerEvents="none">
              <rect
                x={draftRect.left}
                y={draftRect.top}
                width={draftRect.width}
                height={draftRect.height}
                fill="rgba(37, 99, 235, 0.1)"
                stroke="#2563EB"
                strokeWidth={1.5}
                strokeDasharray="6 4"
              />
              <rect
                x={draftRect.left + 6}
                y={draftRect.top + 6}
                width={94}
                height={20}
                rx={4}
                fill="#0F172A"
                opacity={0.85}
              />
              <text
                x={draftRect.left + 53}
                y={draftRect.top + 19}
                textAnchor="middle"
                fontSize={10}
                fontFamily="monospace"
                fill="#FFFFFF"
              >
                {Math.round(draftRect.width)} × {Math.round(draftRect.height)} pt
              </text>
            </g>
          )}
        </svg>
      </div>
    </div>
  );
}
