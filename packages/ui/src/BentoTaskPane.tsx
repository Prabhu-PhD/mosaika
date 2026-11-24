import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BENTO_ERROR_MESSAGES,
  type BentoDocumentState,
  type BentoTemplate,
  type CellShapeKind,
  type EntranceAnimationPreset,
  type GridSystemId,
  type HierarchyMode,
  type HostCapabilities,
  type IBentoHost,
  type LayoutIntent,
  type MultiSlideMode,
  type SavedBentoBlueprint,
  type SelectionContext,
  type SplitAxis,
  type StylePresetId,
} from '@bento/contract';
import {
  applyTemplateToDocument,
  buildCellRenderSpecs,
  buildEntranceAnimationSpec,
  buildMosaikafyPayload,
  collectLeaves,
  computeAutoFitRect,
  computeLayoutDiff,
  computeStylePayload,
  createDocumentFromTemplate,
  createIntentBentoDocument,
  deleteLeafFromTree,
  detectMissingSlots,
  generateMultiSlideItems,
  getIntentDefinition,
  getPresetDefaultRadius,
  hydrateStateFromJson,
  instantiateSavedBlueprint,
  mergeLeaves,
  mirrorBentoLayout,
  type MirrorDirection,
  nextDeterministicSeed,
  reflowMissingSlots,
  regenerateWithLocks,
  resizeSplitRatio,
  setGridSystem,
  setLeafRole,
  setLeafShapeKind,
  splitLeaf,
  toggleLeafLock,
  updateNonStructuralParams,
} from '@bento/core';
import { ArrowLeft } from 'lucide-react';
import { ActionRow } from './components/ActionRow.js';
import { CoreSliders } from './components/CoreSliders.js';
import { Drawers } from './components/Drawers.js';
import { EntryView } from './components/EntryView.js';
import { HeaderBar } from './components/HeaderBar.js';
import { IntentBar } from './components/IntentPicker.js';
import { LibraryView } from './components/LibraryView.js';
import { Minimap } from './components/Minimap.js';
import { ToastBanner, type ToastNotice } from './components/ToastBanner.js';
import {
  createEmptyUndoHistory,
  createSeedHistory,
  popRedo,
  popUndo,
  pushSeed,
  pushUndoSnapshot,
  type SeedHistory,
  type UndoHistory,
} from './history.js';
import {
  deleteBlueprintFromLibrary,
  loadSavedBlueprints,
  saveBlueprintToLibrary,
} from './personalLibrary.js';
import { SingleFlightQueue } from './queue.js';

export interface BentoTaskPaneProps {
  host: IBentoHost;
  theme?: 'light' | 'dark';
  /** When true (e.g. inside PowerPoint CustomTaskPane), stretches to 100% of host pane width */
  fullWidth?: boolean;
  /** Optional key that forces capability/selection re-read when host simulator toggles capabilities */
  capabilitiesRevision?: number;
}

const DEFAULT_CAPABILITIES: HostCapabilities = {
  platform: 'browser-harness',
  supportsCornerRadius: true,
  supportsNativeUndoGrouping: true,
  supportsLiveThemeBinding: true,
  supportsShadows: true,
  supportsAutoMorph: true,
  supportsSelectionEvents: true,
  supportsImageCropScrim: true,
  supportsSlideDuplication: true,
  supportsCustomGeometry: true,
  supportsMosaikafy: true,
  supportsEntranceAnimations: true,
};

const OFFICE_DEBOUNCE_MS = 150;

export function BentoTaskPane({
  host,
  theme = 'light',
  fullWidth = false,
  capabilitiesRevision = 0,
}: BentoTaskPaneProps) {
  const [capabilities, setCapabilities] = useState<HostCapabilities>(DEFAULT_CAPABILITIES);
  const [selection, setSelection] = useState<SelectionContext | null>(null);
  const [selectedEntryIntent, setSelectedEntryIntent] = useState<LayoutIntent>('executive-brief');
  const [docState, setDocState] = useState<BentoDocumentState | null>(null);
  const [survivingSlots, setSurvivingSlots] = useState<string[]>([]);
  const [selectedSlots, setSelectedSlots] = useState<string[]>([]);
  const [undoHistory, setUndoHistory] = useState<UndoHistory>(createEmptyUndoHistory);
  const [seedHistory, setSeedHistory] = useState<SeedHistory>(() => createSeedHistory(48219));
  const [notice, setNotice] = useState<ToastNotice | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isLibraryBrowserOpen, setIsLibraryBrowserOpen] = useState(false);
  const [activeMotionPreset, setActiveMotionPreset] = useState<EntranceAnimationPreset>('none');
  const [savedBlueprints, setSavedBlueprints] = useState<SavedBentoBlueprint[]>(() =>
    loadSavedBlueprints()
  );

  const queueRef = useRef<SingleFlightQueue>(new SingleFlightQueue());
  const toastSeqRef = useRef(1);
  const docStateRef = useRef<BentoDocumentState | null>(null);
  const survivingSlotsRef = useRef<string[]>([]);
  const preDragSnapshotRef = useRef<BentoDocumentState | null>(null);

  useEffect(() => {
    docStateRef.current = docState;
    if (!docState) {
      setIsLibraryBrowserOpen(false);
    }
  }, [docState]);

  useEffect(() => {
    survivingSlotsRef.current = survivingSlots;
  }, [survivingSlots]);

  const dismissNotice = useCallback(() => {
    setNotice(null);
  }, []);

  const showNotice = useCallback(
    (kind: ToastNotice['kind'], message: string, autoDismissMs?: number) => {
      const id = toastSeqRef.current++;
      const resolvedDuration = autoDismissMs ?? (kind === 'success' ? 3000 : undefined);
      setNotice({
        id,
        kind,
        message,
        ...(resolvedDuration !== undefined ? { autoDismissMs: resolvedDuration } : {}),
      });
    },
    []
  );

  const syncFromHost = useCallback(async () => {
    setIsSyncing(true);
    try {
      const [caps, ctx] = await Promise.all([
        host.getCapabilities(),
        host.getSelectionContext(),
      ]);
      setCapabilities(caps);
      setSelection(ctx);

      if (ctx.hasDuplicateSlotConflict) {
        showNotice('warning', BENTO_ERROR_MESSAGES.DUPLICATE_SLOT_CONFLICT);
      }

      if (ctx.activeBentoId && ctx.hydratedStateJson) {
        const hydrated = hydrateStateFromJson(ctx.hydratedStateJson);
        if (hydrated) {
          const switchedBento = docStateRef.current?.bentoId !== hydrated.bentoId;
          setDocState(hydrated);
          setSurvivingSlots(ctx.survivingSlotIds);
          setSelectedSlots(ctx.selectedSlotIds);
          if (switchedBento) {
            setUndoHistory(createEmptyUndoHistory());
            setSeedHistory(createSeedHistory(hydrated.params.seed));
          }
          return;
        }
      }

      // No active bento selected
      setDocState(null);
      setSurvivingSlots([]);
      setSelectedSlots([]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to sync with host.';
      showNotice('error', msg);
    } finally {
      setIsSyncing(false);
    }
  }, [host, showNotice]);

  // Boot + re-sync whenever host or capabilitiesRevision changes
  useEffect(() => {
    void syncFromHost();
  }, [syncFromHost, capabilitiesRevision]);

  // Subscribe to host selection events ONLY when supportsSelectionEvents is true (Rule 3)
  useEffect(() => {
    if (!capabilities.supportsSelectionEvents || !host.onSelectionChanged) {
      return;
    }
    const unsubscribe = host.onSelectionChanged(() => {
      void syncFromHost();
    });
    return unsubscribe;
  }, [capabilities.supportsSelectionEvents, host, syncFromHost]);

  const missingSlotIds = useMemo(() => {
    if (!docState) {
      return [];
    }
    return detectMissingSlots(docState, survivingSlots);
  }, [docState, survivingSlots]);

  const commitStateToHost = useCallback(
    async (
      prevState: BentoDocumentState | null,
      nextState: BentoDocumentState,
      options: {
        deletePlaceholderSelection?: boolean;
        commitUndoEntry: boolean;
        applyStyle?: boolean;
        pushHistory?: boolean;
      }
    ) => {
      if (options.pushHistory && prevState) {
        setUndoHistory((h) => pushUndoSnapshot(h, prevState));
      }

      const existingSet = new Set(survivingSlotsRef.current);
      const diff = computeLayoutDiff(prevState, nextState, existingSet, {
        deletePlaceholderSelection: options.deletePlaceholderSelection,
        commitUndoEntry: options.commitUndoEntry,
        supportsCustomGeometry: capabilities.supportsCustomGeometry,
      });

      const nextSlotIds = buildCellRenderSpecs(nextState, {
        supportsCustomGeometry: capabilities.supportsCustomGeometry,
      }).map((c) => c.slotId);
      setSurvivingSlots(nextSlotIds);
      survivingSlotsRef.current = nextSlotIds;

      const { stashedCount } = await host.applyLayoutDiff(diff);

      if (options.applyStyle || diff.create.length > 0) {
        const stylePayload = computeStylePayload(nextState, {
          supportsShadows: capabilities.supportsShadows,
          isDarkTheme: theme === 'dark',
          commitUndoEntry: options.commitUndoEntry,
        });
        await host.applyStyle(nextState.bentoId, stylePayload);
      }

      if (stashedCount > 0) {
        showNotice(
          'info',
          `Moved ${stashedCount} card(s) with content off-slide so nothing was lost.`
        );
      }
    },
    [capabilities.supportsShadows, host, showNotice, theme]
  );

  // Entry actions
  const handleCreateInSelected = () => {
    if (!selection || selection.selectedShapeCount === 0 || !selection.selectedShapeBounds) {
      if (selection && selection.selectedShapeCount > 1) {
        showNotice('warning', BENTO_ERROR_MESSAGES.MULTI_SHAPE_SELECTED);
      } else {
        showNotice('warning', BENTO_ERROR_MESSAGES.NO_SHAPE_SELECTED);
      }
      return;
    }

    const created = createIntentBentoDocument(selection.selectedShapeBounds, selectedEntryIntent);
    if (!created.ok) {
      showNotice('error', created.message);
      return;
    }
    if (created.warning) {
      showNotice('warning', BENTO_ERROR_MESSAGES[created.warning]);
    }

    const nextState = created.value;
    setDocState(nextState);
    setUndoHistory(createEmptyUndoHistory());
    setSeedHistory(createSeedHistory(nextState.params.seed));
    setSelectedSlots([]);
    survivingSlotsRef.current = [];

    void queueRef.current.enqueue(() =>
      commitStateToHost(null, nextState, {
        deletePlaceholderSelection: true,
        commitUndoEntry: true,
        applyStyle: true,
      })
    );
  };

  const handleAutoFitSlide = () => {
    const slideBounds = selection?.slideBounds ?? { left: 0, top: 0, width: 960, height: 540 };
    const autoRect = computeAutoFitRect(slideBounds);
    const created = createIntentBentoDocument(autoRect, selectedEntryIntent);
    if (!created.ok) {
      showNotice('error', created.message);
      return;
    }
    if (created.warning) {
      showNotice('warning', BENTO_ERROR_MESSAGES[created.warning]);
    }

    const nextState = created.value;
    setDocState(nextState);
    setUndoHistory(createEmptyUndoHistory());
    setSeedHistory(createSeedHistory(nextState.params.seed));
    setSelectedSlots([]);
    survivingSlotsRef.current = [];

    void queueRef.current.enqueue(() =>
      commitStateToHost(null, nextState, {
        deletePlaceholderSelection: false,
        commitUndoEntry: true,
        applyStyle: true,
      })
    );
  };

  // Phase 3: Non-destructive Mosaika-fy of 2+ selected slide shapes
  const handleMosaikafySelected = () => {
    if (
      !capabilities.supportsMosaikafy ||
      !host.mosaikafySelection ||
      !selection?.selectedShapes ||
      selection.selectedShapes.length < 2
    ) {
      return;
    }

    const built = buildMosaikafyPayload(
      selection.selectedShapes,
      selection.slideBounds,
      selectedEntryIntent,
      {
        supportsShadows: capabilities.supportsShadows,
        supportsCustomGeometry: capabilities.supportsCustomGeometry,
        isDarkTheme: theme === 'dark',
      }
    );
    if (!built.ok) {
      showNotice('error', built.message);
      return;
    }

    const { state: nextState, payload } = built.value;
    const nextSlots = payload.cells.map((c) => c.slotId);
    setDocState(nextState);
    setUndoHistory(createEmptyUndoHistory());
    setSeedHistory(createSeedHistory(nextState.params.seed));
    setSurvivingSlots(nextSlots);
    survivingSlotsRef.current = nextSlots;
    setSelectedSlots([]);

    void queueRef.current.enqueue(async () => {
      const res = await host.mosaikafySelection!(payload);
      showNotice(
        'success',
        `Mosaika-fied ${res.convertedCount} existing shapes without losing content.`
      );
      await syncFromHost();
    });
  };

  // Phase 3: Personal Saved Library — Save, Insert, Swap, Delete
  const handleSaveCurrentLayout = (customName?: string) => {
    const current = docStateRef.current;
    if (!current) return;
    const intentDef = getIntentDefinition(current.params.intent);
    const defaultName = `${intentDef.label} ${current.params.count}`;
    const { blueprint, nextList } = saveBlueprintToLibrary(
      savedBlueprints,
      customName?.trim() || defaultName,
      current
    );
    setSavedBlueprints(nextList);
    showNotice('success', `Saved "${blueprint.name}" to My Library.`);
  };

  const handleDeleteSavedBlueprint = (id: string) => {
    setSavedBlueprints((prev) => deleteBlueprintFromLibrary(prev, id));
    showNotice('info', 'Removed layout from My Library.');
  };

  const handleInsertSavedBlueprint = (blueprint: SavedBentoBlueprint) => {
    const hasSingleShape =
      selection !== null &&
      selection.selectedShapeCount === 1 &&
      selection.selectedShapeBounds !== undefined;

    const slideBounds = selection?.slideBounds ?? { left: 0, top: 0, width: 960, height: 540 };
    const targetRect = hasSingleShape
      ? selection.selectedShapeBounds!
      : computeAutoFitRect(slideBounds);

    const nextState = instantiateSavedBlueprint(blueprint, targetRect, null);
    setDocState(nextState);
    setUndoHistory(createEmptyUndoHistory());
    setSeedHistory(createSeedHistory(nextState.params.seed));
    setSelectedSlots([]);
    survivingSlotsRef.current = [];

    void queueRef.current.enqueue(() =>
      commitStateToHost(null, nextState, {
        deletePlaceholderSelection: hasSingleShape,
        commitUndoEntry: true,
        applyStyle: true,
      })
    );
  };

  const handleApplySavedBlueprint = (blueprint: SavedBentoBlueprint) => {
    const current = docStateRef.current;
    if (!current) return;
    const nextState = instantiateSavedBlueprint(blueprint, current.anchorRect, current);
    setDocState(nextState);
    setSeedHistory((s) => pushSeed(s, nextState.params.seed));
    setSelectedSlots([]);
    setIsLibraryBrowserOpen(false);
    void queueRef.current.enqueue(() =>
      commitStateToHost(current, nextState, {
        commitUndoEntry: true,
        applyStyle: true,
        pushHistory: true,
      })
    );
    showNotice('success', `Applied "${blueprint.name}".`);
  };

  // Phase 3: Staggered Entrance Animations
  const handleApplyEntranceAnimation = (preset: EntranceAnimationPreset) => {
    const current = docStateRef.current;
    if (!current || !capabilities.supportsEntranceAnimations || !host.applyEntranceAnimations) {
      return;
    }
    setActiveMotionPreset(preset);
    const spec = buildEntranceAnimationSpec(current, preset, {
      supportsCustomGeometry: capabilities.supportsCustomGeometry,
    });
    void queueRef.current.enqueue(async () => {
      await host.applyEntranceAnimations!(current.bentoId, spec);
      showNotice(
        'success',
        preset === 'none'
          ? 'Cleared entrance animations.'
          : `Applied ${preset.replace('-', ' ')} entrance (${spec.orderedSlotIds.length} cards).`
      );
    });
  };

  // 1-click Library insertion from Entry (uses selected bounding shape if present, else Auto-Fits slide)
  const handleInsertTemplate = (template: BentoTemplate) => {
    const hasSingleShape =
      selection !== null &&
      selection.selectedShapeCount === 1 &&
      selection.selectedShapeBounds !== undefined;

    const slideBounds = selection?.slideBounds ?? { left: 0, top: 0, width: 960, height: 540 };
    const targetRect = hasSingleShape
      ? selection.selectedShapeBounds!
      : computeAutoFitRect(slideBounds);

    const created = createDocumentFromTemplate(
      targetRect,
      template,
      !capabilities.supportsCornerRadius ? { radiusPt: 0 } : undefined
    );
    if (!created.ok) {
      showNotice('error', created.message);
      return;
    }
    if (created.warning) {
      showNotice('warning', BENTO_ERROR_MESSAGES[created.warning]);
    }

    const nextState = created.value;
    setDocState(nextState);
    setUndoHistory(createEmptyUndoHistory());
    setSeedHistory(createSeedHistory(nextState.params.seed));
    setSelectedSlots([]);
    setIsLibraryBrowserOpen(false);
    survivingSlotsRef.current = [];

    void queueRef.current.enqueue(() =>
      commitStateToHost(null, nextState, {
        deletePlaceholderSelection: hasSingleShape,
        commitUndoEntry: true,
        applyStyle: true,
      })
    );
    showNotice('success', `Inserted "${template.name}".`);
  };

  // Non-destructive Library swap while editing an active Bento (preserves text & active style)
  const handleApplyTemplate = (template: BentoTemplate) => {
    if (!docState) return;
    const swapped = applyTemplateToDocument(docState, template, {
      preserveCornerRadius: !capabilities.supportsCornerRadius,
      preserveStyle: true,
    });
    if (!swapped.ok) {
      showNotice('warning', swapped.message);
      return;
    }
    setIsLibraryBrowserOpen(false);
    applyImmediateMutation(swapped.value, { applyStyle: true });
    showNotice('success', `Applied "${template.name}".`);
  };

  // Switch active layout intent (preserves user's manual style; offers Match Style chip)
  const handleSelectActiveIntent = (nextIntent: LayoutIntent) => {
    if (!docState) return;
    const rec = getIntentDefinition(nextIntent).recommendedParams;
    const res = regenerateWithLocks(docState, {
      intent: nextIntent,
      heroBias: rec.heroBias,
      ...(rec.gridSystem ? { gridSystem: rec.gridSystem } : {}),
    });
    if (!res.ok) {
      showNotice('warning', res.message);
      return;
    }
    applyImmediateMutation(res.value, { applyStyle: true });
  };

  const handleMatchIntentStyle = () => {
    if (!docState) return;
    const rec = getIntentDefinition(docState.params.intent).recommendedParams;
    const next = updateNonStructuralParams(docState, {
      stylePreset: rec.stylePreset,
      hierarchyMode: rec.hierarchyMode,
      gutterPt: rec.gutterPt,
      ...(capabilities.supportsCornerRadius ? { radiusPt: rec.radiusPt } : {}),
    });
    applyImmediateMutation(next, { applyStyle: true });
    showNotice('success', `Matched ${getIntentDefinition(docState.params.intent).label} signature style.`);
  };

  // Slider drag scheduling: 60fps minimap update + debounced single-flight commit
  const applyLiveDragState = (nextState: BentoDocumentState) => {
    if (!preDragSnapshotRef.current && docStateRef.current) {
      preDragSnapshotRef.current = docStateRef.current;
    }
    setDocState(nextState);
    docStateRef.current = nextState;

    const runCommit = async () => {
      await commitStateToHost(preDragSnapshotRef.current, nextState, {
        commitUndoEntry: false,
      });
    };

    if (!capabilities.supportsNativeUndoGrouping) {
      queueRef.current.scheduleDebounced(OFFICE_DEBOUNCE_MS, runCommit);
    } else {
      void queueRef.current.enqueue(runCommit);
    }
  };

  const handleCommitSlider = () => {
    const latest = docStateRef.current;
    const preDrag = preDragSnapshotRef.current;
    preDragSnapshotRef.current = null;
    if (!latest) {
      return;
    }
    void queueRef.current.flushDebounced(() =>
      commitStateToHost(preDrag, latest, {
        commitUndoEntry: true,
        pushHistory: Boolean(preDrag && preDrag.revision !== latest.revision),
      })
    );
  };

  const handleChangeCount = (count: number) => {
    if (!docState) return;
    const res = regenerateWithLocks(docState, { count });
    if (!res.ok) {
      showNotice('warning', res.message);
      return;
    }
    applyLiveDragState(res.value);
  };

  const handleChangeGutter = (gutterPt: number) => {
    if (!docState) return;
    const next = updateNonStructuralParams(docState, { gutterPt });
    applyLiveDragState(next);
  };

  const handleChangeRadius = (radiusPt: number) => {
    if (!docState || !capabilities.supportsCornerRadius) return;
    const next = updateNonStructuralParams(docState, { radiusPt });
    applyLiveDragState(next);
  };

  const handleChangeHeroBias = (heroBias: number) => {
    if (!docState) return;
    const res = regenerateWithLocks(docState, { heroBias });
    if (!res.ok) {
      showNotice('warning', res.message);
      return;
    }
    applyLiveDragState(res.value);
  };

  const handleResizeSplit = (nodeId: string, nextRatio: number, snapHarmonic: boolean) => {
    const current = docStateRef.current;
    if (!current) return;
    const { state: nextState } = resizeSplitRatio(current, nodeId, nextRatio, { snapHarmonic });
    if (nextState !== current) {
      applyLiveDragState(nextState);
    }
  };

  const handleSelectGridSystem = (gridSystem: GridSystemId) => {
    if (!docState) return;
    const next = setGridSystem(docState, gridSystem);
    applyImmediateMutation(next);
  };

  const handleMirror = (direction: MirrorDirection) => {
    if (!docState) return;
    const res = mirrorBentoLayout(docState, direction);
    if (!res.ok) {
      showNotice('warning', res.message);
      return;
    }
    if (res.value !== docState) {
      applyImmediateMutation(res.value);
    }
  };

  // Immediate committed mutation helper
  const applyImmediateMutation = (
    nextState: BentoDocumentState,
    opts?: { applyStyle?: boolean }
  ) => {
    const prev = docStateRef.current;
    setDocState(nextState);
    docStateRef.current = nextState;
    void queueRef.current.flushDebounced(() =>
      commitStateToHost(prev, nextState, {
        commitUndoEntry: true,
        applyStyle: opts?.applyStyle,
        pushHistory: true,
      })
    );
  };

  // Seed & Randomize actions
  const handleRandomize = () => {
    if (!docState) return;
    const newSeed = nextDeterministicSeed(docState.params.seed);
    const res = regenerateWithLocks(docState, { seed: newSeed });
    if (!res.ok) {
      showNotice('warning', res.message);
      return;
    }
    setSeedHistory((h) => pushSeed(h, newSeed));
    applyImmediateMutation(res.value);
  };

  const handleSeedBack = () => {
    if (!docState || seedHistory.index <= 0) return;
    const targetSeed = seedHistory.seeds[seedHistory.index - 1]!;
    const res = regenerateWithLocks(docState, { seed: targetSeed });
    if (!res.ok) {
      showNotice('warning', res.message);
      return;
    }
    setSeedHistory((h) => ({ ...h, index: h.index - 1 }));
    applyImmediateMutation(res.value);
  };

  const handleSeedForward = () => {
    if (!docState || seedHistory.index >= seedHistory.seeds.length - 1) return;
    const targetSeed = seedHistory.seeds[seedHistory.index + 1]!;
    const res = regenerateWithLocks(docState, { seed: targetSeed });
    if (!res.ok) {
      showNotice('warning', res.message);
      return;
    }
    setSeedHistory((h) => ({ ...h, index: h.index + 1 }));
    applyImmediateMutation(res.value);
  };

  const handleApplySeedCode = (count: number, seed: number) => {
    if (!docState) return;
    const res = regenerateWithLocks(docState, { count, seed });
    if (!res.ok) {
      showNotice('warning', res.message);
      return;
    }
    setSeedHistory((h) => pushSeed(h, seed));
    applyImmediateMutation(res.value);
  };

  // Reflow Gaps
  const handleReflowGaps = () => {
    if (!docState) return;
    const survivingSet = new Set(survivingSlots);
    const healed = reflowMissingSlots(docState, survivingSet);
    if (!healed) {
      setDocState(null);
      setSelectedSlots([]);
      showNotice('info', 'All bento cards were removed.');
      return;
    }
    setSelectedSlots([]);
    applyImmediateMutation(healed);
    showNotice('success', 'Reflowed gaps to recover 100% of bounding area.');
  };

  // Minimap tile actions
  const handleToggleLock = (slotId: string) => {
    if (!docState) return;
    applyImmediateMutation(toggleLeafLock(docState, slotId));
  };

  const handleToggleHero = (slotId: string) => {
    if (!docState) return;
    const leaf = collectLeaves(docState.tree).find((l) => l.slotId === slotId);
    if (!leaf) return;
    const nextRole = leaf.role === 'hero' ? 'standard' : 'hero';
    applyImmediateMutation(setLeafRole(docState, slotId, nextRole), { applyStyle: true });
  };

  const handleSetShapeKind = (slotId: string, shapeKind: CellShapeKind) => {
    if (!docState) return;
    applyImmediateMutation(setLeafShapeKind(docState, slotId, shapeKind));
  };

  const handleSetImage = (slotId: string, imageBase64: string, addScrim: boolean) => {
    if (!docState) return;
    const nextState = setLeafRole(docState, slotId, 'image');
    const prev = docStateRef.current;
    setDocState(nextState);
    docStateRef.current = nextState;
    void queueRef.current.enqueue(async () => {
      await commitStateToHost(prev, nextState, {
        commitUndoEntry: true,
        pushHistory: true,
      });
      await host.setImageSlot(nextState.bentoId, slotId, imageBase64, addScrim);
      showNotice('success', 'Applied image fill to selected card.');
    });
  };

  const handleSplit = (slotId: string, axis: SplitAxis) => {
    if (!docState) return;
    const res = splitLeaf(docState, slotId, axis);
    if (!res.ok) {
      showNotice('warning', res.message);
      return;
    }
    applyImmediateMutation(res.value, { applyStyle: true });
  };

  const handleMerge = (slotIdA: string, slotIdB: string) => {
    if (!docState) return;
    const res = mergeLeaves(docState, slotIdA, slotIdB);
    if (!res.ok) {
      showNotice('warning', res.message);
      return;
    }
    setSelectedSlots([slotIdA]);
    applyImmediateMutation(res.value);
  };

  const handleDeleteLeaf = (slotId: string) => {
    if (!docState) return;
    const next = deleteLeafFromTree(docState, slotId);
    if (!next) {
      showNotice('warning', 'Cannot delete the last remaining card. Use Detach instead.');
      return;
    }
    setSelectedSlots([]);
    applyImmediateMutation(next);
  };

  // Style & Hierarchy drawers
  const handleSelectPreset = (presetId: StylePresetId) => {
    if (!docState) return;
    const presetRadius = getPresetDefaultRadius(presetId);
    const next = updateNonStructuralParams(docState, {
      stylePreset: presetId,
      ...(capabilities.supportsCornerRadius ? { radiusPt: presetRadius } : {}),
    });
    applyImmediateMutation(next, { applyStyle: true });
  };

  const handleSelectHierarchy = (mode: HierarchyMode) => {
    if (!docState) return;
    const next = updateNonStructuralParams(docState, { hierarchyMode: mode });
    applyImmediateMutation(next, { applyStyle: true });
  };

  const handleSyncStyleFromSelected = () => {
    if (!docState) return;
    void queueRef.current.enqueue(async () => {
      await host.syncStyleFromSelected(docState.bentoId);
      showNotice('success', 'Synced card style across standard bento cards.');
    });
  };

  // Multi-Slide Generator
  const handleGenerateMultiSlides = (
    mode: MultiSlideMode,
    slideCount: number,
    morphNamingEnabled: boolean
  ) => {
    if (!docState) return;
    const items = generateMultiSlideItems(docState, {
      mode,
      slideCount,
      morphNamingEnabled,
      supportsAutoMorph: capabilities.supportsAutoMorph,
      styleOptions: {
        supportsShadows: capabilities.supportsShadows,
        isDarkTheme: theme === 'dark',
      },
    });
    void queueRef.current.enqueue(async () => {
      const res = await host.generateMultiSlides(items);
      showNotice('success', `Generated ${res.createdSlideCount} bento slides.`);
    });
  };

  // Deck Cleanup
  const handleReorderReadingOrder = () => {
    if (!docState) return;
    const orderedIds = buildCellRenderSpecs(docState).map((c) => c.slotId);
    void queueRef.current.enqueue(async () => {
      await host.reorderReadingOrder(docState.bentoId, orderedIds);
      showNotice('success', 'Re-sorted reading order (Hero -> top-to-bottom, left-to-right).');
    });
  };

  const handleDetachBento = () => {
    if (!docState) return;
    const id = docState.bentoId;
    void queueRef.current.enqueue(async () => {
      await host.detachBento(id);
      setDocState(null);
      setSurvivingSlots([]);
      setSelectedSlots([]);
      setUndoHistory(createEmptyUndoHistory());
      showNotice('info', 'Grid finalized and detached. Shapes remain editable.');
      await syncFromHost();
    });
  };

  // In-pane 25-step Undo/Redo (for hosts with !capabilities.supportsNativeUndoGrouping)
  const handleUndo = useCallback(() => {
    const current = docStateRef.current;
    if (!current) return;
    setUndoHistory((prevHistory) => {
      const popped = popUndo(prevHistory, current);
      if (!popped) return prevHistory;
      const restored = { ...popped.state, revision: current.revision + 1 };
      setDocState(restored);
      docStateRef.current = restored;
      void queueRef.current.enqueue(() =>
        commitStateToHost(current, restored, {
          commitUndoEntry: true,
          applyStyle: true,
        })
      );
      return popped.history;
    });
  }, [commitStateToHost]);

  const handleRedo = useCallback(() => {
    const current = docStateRef.current;
    if (!current) return;
    setUndoHistory((prevHistory) => {
      const popped = popRedo(prevHistory, current);
      if (!popped) return prevHistory;
      const restored = { ...popped.state, revision: current.revision + 1 };
      setDocState(restored);
      docStateRef.current = restored;
      void queueRef.current.enqueue(() =>
        commitStateToHost(current, restored, {
          commitUndoEntry: true,
          applyStyle: true,
        })
      );
      return popped.history;
    });
  }, [commitStateToHost]);

  // Capability-gated keyboard Undo/Redo shortcuts (Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, Ctrl/Cmd+Y)
  useEffect(() => {
    if (capabilities.supportsNativeUndoGrouping) {
      return;
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const tag = document.activeElement?.tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;
      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      } else if ((key === 'z' && e.shiftKey) || key === 'y') {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [capabilities.supportsNativeUndoGrouping, handleUndo, handleRedo]);

  return (
    <aside
      data-bento-theme={theme}
      data-testid="bento-task-pane"
      className={`bento-pane flex h-full shrink-0 flex-col overflow-x-hidden bg-[var(--bento-bg)] text-[var(--bento-fg)] ${
        fullWidth ? 'w-full min-w-[260px]' : 'w-[320px] min-w-[280px] max-w-[420px]'
      }`}
    >
      <HeaderBar
        capabilities={capabilities}
        activeCardCount={docState?.params.count}
        canUndo={Boolean(docState) && undoHistory.past.length > 0}
        canRedo={Boolean(docState) && undoHistory.future.length > 0}
        isSyncing={isSyncing}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onSync={() => void syncFromHost()}
      />

      <ToastBanner notice={notice} onDismiss={dismissNotice} />

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {!docState ? (
          <EntryView
            selection={selection}
            selectedIntent={selectedEntryIntent}
            supportsMosaikafy={Boolean(capabilities.supportsMosaikafy && host.mosaikafySelection)}
            savedBlueprints={savedBlueprints}
            isBusy={isSyncing}
            onSelectIntent={setSelectedEntryIntent}
            onCreateInSelected={handleCreateInSelected}
            onMosaikafySelected={handleMosaikafySelected}
            onAutoFitSlide={handleAutoFitSlide}
            onInsertTemplate={handleInsertTemplate}
            onInsertSavedBlueprint={handleInsertSavedBlueprint}
            onDeleteSavedBlueprint={handleDeleteSavedBlueprint}
          />
        ) : isLibraryBrowserOpen ? (
          <>
            <div className="shrink-0">
              <IntentBar
                value={docState.params.intent}
                styleMatchesIntent
                isLibraryOpen
                onToggleLibrary={() => setIsLibraryBrowserOpen(false)}
                onChangeIntent={(nextIntent) => {
                  setIsLibraryBrowserOpen(false);
                  handleSelectActiveIntent(nextIntent);
                }}
                onMatchStyle={handleMatchIntentStyle}
              />
              <div className="flex items-center justify-between border-b border-[var(--bento-border)] bg-[var(--bento-well)] px-3 py-1">
                <button
                  type="button"
                  onClick={() => setIsLibraryBrowserOpen(false)}
                  data-testid="btn-library-back-to-editor"
                  className="flex items-center gap-1 text-[10.5px] font-semibold text-[var(--bento-fg)] hover:underline"
                >
                  <ArrowLeft className="h-3 w-3" />
                  <span>Back to Editor</span>
                </button>
                <span className="font-mono text-[9.5px] uppercase tracking-[0.04em] text-[var(--bento-fg-muted)]">
                  Click swatch to swap
                </span>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
              <LibraryView
                mode="swap"
                activeIntent={docState.params.intent}
                selectionBounds={docState.anchorRect}
                savedBlueprints={savedBlueprints}
                canSaveCurrent
                isBusy={isSyncing}
                onSelectTemplate={handleApplyTemplate}
                onSelectSavedBlueprint={handleApplySavedBlueprint}
                onDeleteSavedBlueprint={handleDeleteSavedBlueprint}
                onSaveCurrentLayout={handleSaveCurrentLayout}
              />
            </div>
          </>
        ) : (
          <>
            {/* Pinned Intent/Library Bar & Layout Map (never scrolls out of view, matching InfoGen) */}
            <div className="shrink-0">
              <IntentBar
                value={docState.params.intent}
                styleMatchesIntent={(() => {
                  const rec = getIntentDefinition(docState.params.intent).recommendedParams;
                  return (
                    docState.params.stylePreset === rec.stylePreset &&
                    docState.params.hierarchyMode === rec.hierarchyMode
                  );
                })()}
                isLibraryOpen={false}
                onToggleLibrary={() => setIsLibraryBrowserOpen(true)}
                onChangeIntent={handleSelectActiveIntent}
                onMatchStyle={handleMatchIntentStyle}
              />

              <Minimap
                state={docState}
                capabilities={capabilities}
                missingSlotIds={missingSlotIds}
                selectedSlotIds={selectedSlots}
                isDarkTheme={theme === 'dark'}
                onSelectSlots={setSelectedSlots}
                onToggleLock={handleToggleLock}
                onToggleHero={handleToggleHero}
                onSetShapeKind={handleSetShapeKind}
                onSetImage={handleSetImage}
                onSplit={handleSplit}
                onMerge={handleMerge}
                onDelete={handleDeleteLeaf}
                onSelectGridSystem={handleSelectGridSystem}
                onMirror={handleMirror}
                onResizeSplit={handleResizeSplit}
                onCommitResizeSplit={handleCommitSlider}
              />
            </div>

            {/* Scrollable Controls & Exclusive Accordions */}
            <div
              data-testid="bento-controls-scroll"
              className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden"
            >
              <CoreSliders
                state={docState}
                capabilities={capabilities}
                onChangeCount={handleChangeCount}
                onChangeGutter={handleChangeGutter}
                onChangeRadius={handleChangeRadius}
                onChangeHeroBias={handleChangeHeroBias}
                onCommitSlider={handleCommitSlider}
              />

              <Drawers
                state={docState}
                capabilities={capabilities}
                hasSingleSelectedCard={selectedSlots.length === 1}
                activeMotionPreset={activeMotionPreset}
                onSelectPreset={handleSelectPreset}
                onSelectHierarchy={handleSelectHierarchy}
                onSyncStyleFromSelected={handleSyncStyleFromSelected}
                onApplyEntranceAnimation={handleApplyEntranceAnimation}
                onSaveToLibrary={() => handleSaveCurrentLayout()}
                onGenerateMultiSlides={handleGenerateMultiSlides}
                onReorderReadingOrder={handleReorderReadingOrder}
                onDetachBento={handleDetachBento}
              />
            </div>

            <ActionRow
              count={docState.params.count}
              seed={docState.params.seed}
              canSeedBack={seedHistory.index > 0}
              canSeedForward={seedHistory.index < seedHistory.seeds.length - 1}
              missingCount={missingSlotIds.length}
              onRandomize={handleRandomize}
              onSeedBack={handleSeedBack}
              onSeedForward={handleSeedForward}
              onApplySeedCode={handleApplySeedCode}
              onInvalidSeedCode={() =>
                showNotice('warning', 'Invalid seed code. Use format like B5-48219.')
              }
              onReflowGaps={handleReflowGaps}
            />
          </>
        )}
      </div>
    </aside>
  );
}
