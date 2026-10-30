<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import type { OSDAnnotationEditor } from '@mango-iiif/annotation';
  import type { CanonicalStylesheet } from '@mango-iiif/w3c-parser';
  import {
    ViewerCore,
    applyResolvedPatch,
    buildLayerStylesheet,
    colorFromInlineStyle,
    createMangoAnnotation,
    manifestsStore,
    normaliseViewerConfig,
    parseViewerConfig,
    projectToResolved,
    resolveAnnotationJson,
    styleClassForLayer,
    type AnnotationSaveState,
    type AnnotationTool,
    type ImageRendererExtension,
    type ResolvedAnnotation,
    type ViewerCoreInstance,
    type ViewerPlugin,
  } from '@mango-iiif/iiif-viewer/core';
  import { t, translate } from '../core/i18n';
  import type { AnnotateConfig } from '../core/types/config';
  import AnnotationEditorLayer from '../features/annotations/AnnotationEditorLayer.svelte';
  import AnnotationWorkspace from '../features/annotations/workspace/AnnotationWorkspace.svelte';
  import type { LayerItem } from '../features/annotations/workspace/LeftSidebar.svelte';
  import {
    createCommandStack,
    labelForPatch,
    type CommandStackState,
  } from '../features/annotations/commands';
  import { exportAnnotationPage } from '../features/annotations/export';
  import { normaliseAuthoringLanguages } from '../features/annotations/languages';
  import {
    archiveLayer,
    createLayer,
    mergeDiscoveredLayers,
    moveLayer,
    recolourLayer,
    renameLayer,
    resolveActiveLayer,
    setLayerVisibility,
  } from '../features/annotations/layers';
  import EditorShell from './EditorShell.svelte';
  import ViewerHeader from './ui/ViewerHeader.svelte';

  /**
   * The annotation editor: a headless viewer for the stage, the editor layer
   * drawn on top of it, and the workspace panels around both.
   *
   * The viewer owns the annotations — manifest ones and the user's own — so
   * edits go through its API. This component owns only what the viewer has no
   * notion of: the unsaved draft, the edit transaction, undo history, layers
   * and the active drawing tool.
   */
  interface Props {
    manifestId?: string;
    config?: AnnotateConfig | string | undefined;
    /** Plugins for the embedded viewer's stage. */
    plugins?: ViewerPlugin[];
    /** Where viewer and editor events are dispatched as DOM events. */
    eventTarget?: EventTarget | null;
  }

  let {
    manifestId = $bindable(''),
    config = undefined,
    plugins = [],
    eventTarget = null,
  }: Props = $props();

  let normalisedConfig: AnnotateConfig = $derived(
    normaliseViewerConfig(
      parseViewerConfig(config, (error) => {
        console.warn(translate('warnings.invalidConfig'), error);
      }),
    ) as AnnotateConfig,
  );
  let annotationLanguages = $derived(
    normaliseAuthoringLanguages(
      normalisedConfig.annotations?.languages,
      normalisedConfig.language ?? 'en',
    ),
  );

  let root: HTMLDivElement | null = $state(null);
  let core: ViewerCoreInstance | null = $state(null);

  const emit = (event: string, detail: unknown) => {
    (eventTarget ?? root)?.dispatchEvent(
      new CustomEvent(event, { detail, bubbles: true, composed: true }),
    );
  };

  const DEFAULT_ANNOTATION_LAYERS: LayerItem[] = [
    { id: 'research', name: 'Research Notes', color: '#fb7185', visible: true },
    {
      id: 'transcription',
      name: 'Transcription',
      color: '#60a5fa',
      visible: true,
    },
    { id: 'highlights', name: 'Highlights', color: '#34d399', visible: true },
    { id: 'mine', name: 'My Annotations', color: '#a78bfa', visible: true },
  ];

  /* The current canvas's annotations, as the viewer holds them. */
  let editorAnnotations = $state.raw<ResolvedAnnotation[]>([]);
  let activeAnnotationId = $state<string | null>(null);
  let canvasId = $state<string | null>(null);
  let annotationEditorTool = $state<AnnotationTool>('select');

  /* The OpenSeadragon viewer the editor layer attaches to. */
  let osdViewer: ImageRendererExtension['viewer'] | null = $state(null);
  let canvasSize = $state({ width: 0, height: 0 });

  const syncCanvasSize = () => {
    const size = osdViewer?.world?.getItemAt(0)?.getContentSize?.();
    if (size && size.x > 0 && size.y > 0) {
      canvasSize = { width: size.x, height: size.y };
      return;
    }
    const content = core?.getContentSize?.();
    if (content) canvasSize = { width: content.width, height: content.height };
  };

  let offs: Array<() => void> = [];
  $effect(() => {
    const viewer = core;
    if (!viewer) return;
    viewer.setEventTarget(eventTarget ?? root ?? new EventTarget());
    editorAnnotations = viewer.getAnnotations();
    canvasId = viewer.getCanvasId();
    offs = [
      viewer.on('annotationsChange', ({ annotations }) => {
        editorAnnotations = annotations;
      }),
      viewer.on('rendererReady', ({ renderer }) => {
        osdViewer?.removeHandler('open', syncCanvasSize);
        osdViewer = renderer.kind === 'image' ? renderer.viewer : null;
        osdViewer?.addHandler('open', syncCanvasSize);
        syncCanvasSize();
      }),
      viewer.on('mediaChange', ({ canvasId: id, mediaType }) => {
        canvasId = id;
        if (mediaType !== 'image') osdViewer = null;
      }),
      viewer.on('pageChange', ({ canvasId: id }) => {
        canvasId = id;
      }),
      viewer.on('annotationSelect', ({ id }) => {
        activeAnnotationId = id;
      }),
      /*
       * The pointer-up that finishes a drawn shape reaches the stage background
       * as an ordinary click, so an unconditional clear deselected the
       * annotation the user had just drawn — the draft stayed on the canvas
       * with no way to reach it. A pending draft is dismissed through Cancel,
       * deliberately, not by clicking away.
       */
      viewer.on('annotationClear', () => {
        if (!draftAnno) activeAnnotationId = null;
      }),
    ];
    return () => {
      offs.forEach((off) => off());
      offs = [];
    };
  });
  onDestroy(() => osdViewer?.removeHandler('open', syncCanvasSize));

  const selectAnnotation = (id: string, preventZoom = true) => {
    core?.selectAnnotation(id, preventZoom);
  };
  const clearAnnotationSelection = () => {
    core?.clearAnnotationSelection();
  };

  let draftAnno = $state.raw<ResolvedAnnotation | null>(null);
  let annotationDirty = $state(false);
  let annotationSaveState = $state<AnnotationSaveState>({ status: 'clean' });
  let annotationExportStatus = $state('');
  /**
   * Expert content-authoring mode.
   *
   * Off by default, and the only route to `painting`. An ordinary comment
   * exported as `painting` tells every Presentation 3 consumer that the note is
   * the Canvas image, so the term is behind a deliberate choice rather than
   * sitting in a list next to `commenting`.
   */
  let annotationExpertMode = $state(false);
  /**
   * The annotation as it was when editing began, for Cancel to restore.
   *
   * Taken on the first change rather than on selection: selecting an annotation
   * to read it should not arm a transaction, and taking the snapshot on the
   * first edit is what makes Cancel restore the state the user last saw.
   */
  let editSnapshot = $state.raw<{ id: string; annotation: ResolvedAnnotation } | null>(null);
  let annotationLayers = $state<LayerItem[]>([...DEFAULT_ANNOTATION_LAYERS]);
  /** Layer new annotations are created in. */
  let activeAnnotationLayerId = $state('mine');

  /*
   * The live canvas editor, handed out by the editor layer.
   *
   * Held so undo/redo and exact coordinate editing can reach the package's own
   * geometry history and `setGeometry` rather than Mango synthesising pointer
   * events or keeping a second copy of the geometry.
   */
  let annotationEditor = $state.raw<OSDAnnotationEditor | null>(null);
  let commandState = $state<CommandStackState>({ canUndo: false, canRedo: false });

  /*
   * A new manifest starts a new editing session. Keyed on the prop rather than
   * the viewer's `manifestChange` event, which arrives once the manifest has
   * loaded and so could undo a tool the user picked in the meantime.
   */
  let lastManifestId: string | null = null;
  $effect.pre(() => {
    const next = manifestId ?? '';
    if (next === lastManifestId) return;
    lastManifestId = next;
    untrack(() => {
      draftAnno = null;
      editSnapshot = null;
      annotationDirty = false;
      annotationLayers = [...DEFAULT_ANNOTATION_LAYERS];
      annotationEditorTool = 'select';
    });
  });

  const commandStack = createCommandStack({
    apply: (annotationId, annotation) => {
      if (!annotation) {
        void core?.removeAnnotation(annotationId);
        return;
      }
      if (draftAnno && draftAnno.id === annotationId) {
        draftAnno = annotation;
        return;
      }
      // Replace, not patch. A snapshot restores a whole earlier state, and a
      // field that was empty before the edit is absent from it — which a patch
      // reads as "leave alone", so the edit would never be undone.
      void core?.replaceAnnotation(annotationId, annotation);
    },
    geometry: () => annotationEditor,
    onChange: (state) => (commandState = state),
  });

  /*
   * The viewer applies an edit synchronously but tells us about it through an
   * event, so read it back from the viewer rather than from local state when
   * the result is needed straight away.
   */
  const currentAnnotations = (): ResolvedAnnotation[] => core?.getAnnotations() ?? editorAnnotations;

  const annotationById = (id: string): ResolvedAnnotation | null =>
    (draftAnno && draftAnno.id === id ? draftAnno : null) ??
    currentAnnotations().find((annotation) => annotation.id === id) ??
    null;
  let visibleLayerIds = $derived(
    new Set(annotationLayers.filter((layer) => layer.visible).map((layer) => layer.id)),
  );
  const normalizeLayerId = (layerId?: string): string => (layerId?.trim() || 'mine').trim();
  const isAnnotationVisibleByLayer = (annotation: ResolvedAnnotation): boolean => {
    const layerId = normalizeLayerId(annotation.targetStyleClass);
    return visibleLayerIds.has(layerId);
  };
  /*
   * Hiding a layer takes its annotations off the stage. It does not take them
   * out of the browser list: the list is how an annotation is found, selected,
   * edited, and moved to another layer, so filtering it too made a hidden
   * annotation unmanageable — including unhideable, because the control for
   * changing its layer is in the inspector the list opens.
   */
  let filteredOverlayAnnotations = $derived(
    editorAnnotations.filter((annotation) => isAnnotationVisibleByLayer(annotation)),
  );
  let visibleDraftAnno = $derived(
    draftAnno && isAnnotationVisibleByLayer(draftAnno) ? draftAnno : null,
  );
  let editorStageAnnotations = $derived(
    visibleDraftAnno
      ? [...filteredOverlayAnnotations, visibleDraftAnno]
      : filteredOverlayAnnotations,
  );
  const handleToggleLayer = (detail: { id: string }) => {
    const current = annotationLayers.find((layer) => layer.id === detail.id);
    annotationLayers = setLayerVisibility(annotationLayers, detail.id, !current?.visible);
  };

  const handleAddLayer = () => {
    annotationLayers = [...annotationLayers, createLayer(annotationLayers)];
  };

  const handleLayerRename = (detail: { id: string; name: string }) => {
    annotationLayers = renameLayer(annotationLayers, detail.id, detail.name);
  };

  const handleLayerMove = (detail: { id: string; direction: -1 | 1 }) => {
    annotationLayers = moveLayer(annotationLayers, detail.id, detail.direction);
  };

  const handleLayerArchive = (detail: { id: string; archived: boolean }) => {
    annotationLayers = archiveLayer(annotationLayers, detail.id, detail.archived);
    // Archiving the layer being drawn into would leave new annotations landing
    // somewhere the user can no longer see.
    activeAnnotationLayerId = resolveActiveLayer(annotationLayers, activeAnnotationLayerId);
  };

  const handleLayerColorChange = (detail: { id: string; color: string }) => {
    annotationLayers = recolourLayer(annotationLayers, detail.id, detail.color);

    /*
     * Recolouring writes a new stylesheet, not an inline `target.style`. The
     * inline form has no portable Web Annotation representation, so it was
     * dropped the moment anything exported in a standards profile; a class plus
     * an Annotation-level stylesheet survives the round trip.
     *
     * The class does not change, because the class is the layer's identity.
     * Changing the colour must not change membership.
     */
    const patch: Partial<ResolvedAnnotation> = {
      targetStyleClass: styleClassForLayer(detail.id),
    };
    const stylesheet = buildLayerStylesheet([{ id: detail.id, color: detail.color }]);
    /*
     * Only annotations that name this layer, not the manifest ones that merely
     * fall back to it for rendering. Recolouring is a real edit, so matching on
     * the fallback would copy every external annotation on the page into the
     * user's own set — and into their export — over a swatch change.
     */
    const styleClass = styleClassForLayer(detail.id);
    const inLayer = (annotation: ResolvedAnnotation): boolean => {
      const current = annotation.targetStyleClass?.trim();
      return current === detail.id || current === styleClass;
    };
    const affectedAnnotationIds = new Set(
      editorAnnotations.filter(inLayer).map((annotation) => annotation.id),
    );
    if (draftAnno && inLayer(draftAnno)) {
      affectedAnnotationIds.add(draftAnno.id);
    }
    for (const annotationId of affectedAnnotationIds) {
      handleAnnotationUpdate(annotationId, patch, { stylesheet });
    }
  };

  $effect(() => {
    const source = draftAnno ? [...editorAnnotations, draftAnno] : editorAnnotations;
    const discovered = source
      .map((annotation) => ({
        id: annotation.targetStyleClass?.trim() ?? '',
        color:
          annotation.styleHints?.strokeColor ??
          colorFromInlineStyle(annotation.targetStyle) ??
          undefined,
      }))
      .filter((entry) => entry.id);

    const merged = mergeDiscoveredLayers(annotationLayers, discovered);
    if (merged.length !== annotationLayers.length) annotationLayers = merged;
  });

  const handleAnnotationCreate = (payload: { annotation: unknown; tool?: AnnotationTool }) => {
    const annotation = payload?.annotation;
    if (!annotation || typeof annotation !== 'object') return;

    const { annotation: resolved } = resolveAnnotationJson(annotation, {
      provenance: 'draft',
    });
    if (!resolved) return;

    /*
     * No defaults are applied here. The editor layer builds the annotation
     * through the profile's builders, which set `commenting` as the motivation
     * and put the layer in `styleClass`.
     */
    draftAnno = resolved;
    annotationDirty = true;
    annotationSaveState = { status: 'clean' };
    selectAnnotation(resolved.id);
  };

  const handleKeyboardAnnotationCreate = (detail: { tool: 'rectangle' | 'point' }) => {
    const targetCanvasId = core?.getCanvasId() ?? canvasId;
    if (!targetCanvasId) return;
    const content = core?.getContentSize?.() ?? null;
    const viewBox = core?.getViewBox() ?? {
      x: 0,
      y: 0,
      w: content?.width ?? 1_000,
      h: content?.height ?? 1_000,
    };
    const centre = {
      x: viewBox.x + viewBox.w / 2,
      y: viewBox.y + viewBox.h / 2,
    };
    const shape =
      detail.tool === 'point'
        ? ({ type: 'point', geometry: centre } as const)
        : ({
            type: 'rect',
            geometry: {
              x: centre.x - viewBox.w * 0.125,
              y: centre.y - viewBox.h * 0.125,
              w: Math.max(1, viewBox.w * 0.25),
              h: Math.max(1, viewBox.h * 0.25),
            },
          } as const);
    const layer = annotationLayers.find((entry) => entry.id === activeAnnotationLayerId);
    const document = createMangoAnnotation({
      canvasId: targetCanvasId,
      shape,
      styleClass: styleClassForLayer(activeAnnotationLayerId),
      stylesheet: layer ? buildLayerStylesheet([{ id: layer.id, color: layer.color }]) : undefined,
    });
    const resolved = projectToResolved(document, { provenance: 'draft', canvasId: targetCanvasId });
    if (!resolved) return;
    draftAnno = resolved;
    annotationDirty = true;
    annotationSaveState = { status: 'clean' };
    annotationEditorTool = 'select';
    selectAnnotation(resolved.id);
  };

  /**
   * Discards the pending edit.
   *
   * A draft has nothing behind it, so cancelling removes it. An edit to a saved
   * annotation is undone by restoring the snapshot taken when editing began —
   * geometry and metadata together, because they are one transaction from the
   * user's point of view even though they arrive through different callbacks.
   */
  const handleAnnotationCancel = () => {
    if (draftAnno) {
      draftAnno = null;
      annotationDirty = false;
      annotationSaveState = { status: 'clean' };
      annotationEditorTool = 'select';
      clearAnnotationSelection();
      return;
    }

    const snapshot = editSnapshot;
    editSnapshot = null;
    annotationDirty = false;
    annotationSaveState = { status: 'clean' };
    if (snapshot) void core?.updateAnnotation(snapshot.id, snapshot.annotation);
  };

  /**
   * A draft is local state until Save. Selection and Canvas navigation used to
   * replace that state silently, which made Cancel trustworthy but made every
   * other route out of the inspector destructive. Keep the policy small and
   * explicit: stay by default; discard only after confirmation.
   */
  const confirmAnnotationNavigation = (): boolean => {
    if (!annotationDirty && !draftAnno) return true;
    if (typeof window === 'undefined') return false;
    const discard = window.confirm(
      $t('viewer.panels.annotations.editor.discardNavigationConfirmation'),
    );
    if (discard) handleAnnotationCancel();
    return discard;
  };

  /**
   * Deletes an annotation, after confirming.
   *
   * A draft has nothing behind it, so removing it is not a loss and needs no
   * confirmation. Anything else is confirmed, and is undoable afterwards —
   * a confirmation the user can also reverse is cheaper to get wrong.
   */
  const handleAnnotationDelete = async (id: string) => {
    if (draftAnno && draftAnno.id === id) {
      draftAnno = null;
      clearAnnotationSelection();
      return;
    }

    const existing = annotationById(id);
    if (existing && !confirmDeletion(existing)) return;
    if (existing) {
      commandStack.record({
        annotationId: id,
        before: existing,
        after: null,
        label: 'delete',
      });
    }
    await core?.removeAnnotation(id);
  };

  /**
   * Asks before destroying something the user cannot redraw.
   *
   * `confirm` is a blunt instrument, but it is the one that is guaranteed to be
   * reachable by keyboard and announced by a screen reader without Mango
   * building a dialog and getting focus management wrong.
   */
  const confirmDeletion = (annotation: ResolvedAnnotation): boolean => {
    if (typeof window === 'undefined' || typeof window.confirm !== 'function') return true;
    const name = annotation.label?.trim() || annotation.text?.trim() || annotation.id;
    return window.confirm($t('viewer.panels.annotations.editor.confirmDelete', { name }));
  };

  const handleAnnotationUndo = () => {
    if (commandStack.undo()) annotationDirty = true;
  };

  const handleAnnotationRedo = () => {
    if (commandStack.redo()) annotationDirty = true;
  };

  /**
   * Undo and redo from the keyboard.
   *
   * Bound on the annotation editor rather than globally: the editor is embedded
   * in host pages, and swallowing the platform undo shortcut everywhere would
   * break the host's own editing surfaces.
   */
  const handleAnnotationKeydown = (event: KeyboardEvent) => {
    const modifier = event.metaKey || event.ctrlKey;
    if (!modifier || event.key.toLowerCase() !== 'z') return;
    const target = event.target as HTMLElement | null;
    // Text fields have their own undo, and taking it would be worse than not
    // offering ours.
    if (target?.closest('input, textarea, [contenteditable="true"]')) return;
    event.preventDefault();
    if (event.shiftKey) handleAnnotationRedo();
    else handleAnnotationUndo();
  };

  const handleAnnotationUpdate = (
    id: string,
    patch: Partial<ResolvedAnnotation>,
    options: {
      stylesheet?: CanonicalStylesheet | null;
      language?: string;
      bodyPurpose?: string;
      textDirection?: string;
      bodyPath?: string;
      createBody?: boolean;
    } = {},
  ) => {
    let effectivePatch = patch;
    let effectiveOptions = options;
    if (patch.targetStyleClass !== undefined && options.stylesheet === undefined) {
      const requested = patch.targetStyleClass.trim();
      const layer = annotationLayers.find(
        (entry) => entry.id === requested || styleClassForLayer(entry.id) === requested,
      );
      if (layer) {
        effectivePatch = {
          ...patch,
          targetStyleClass: styleClassForLayer(layer.id),
        };
        effectiveOptions = {
          ...options,
          stylesheet: buildLayerStylesheet([{ id: layer.id, color: layer.color }]),
        };
      }
    }
    /*
     * Recorded after the edit lands, not before, so the entry holds both ends
     * of it. Recording `after: null` meant redo restored "no annotation" — it
     * deleted the very thing it was meant to bring back.
     */
    const previous = annotationById(id);

    if (draftAnno && draftAnno.id === id) {
      draftAnno = applyResolvedPatch(draftAnno, effectivePatch, effectiveOptions);
      annotationDirty = true;
      if (previous) {
        commandStack.record({
          annotationId: id,
          before: previous,
          after: draftAnno,
          label: labelForPatch(effectivePatch),
        });
      }
      return;
    }
    if (!editSnapshot || editSnapshot.id !== id) {
      const current = currentAnnotations().find((annotation) => annotation.id === id);
      if (current) editSnapshot = { id, annotation: current };
    }
    annotationDirty = true;
    annotationSaveState = { status: 'clean' };
    void core?.updateAnnotation(id, effectivePatch, effectiveOptions);

    const next = annotationById(id);
    if (previous && next && next !== previous) {
      commandStack.record({
        annotationId: id,
        before: previous,
        after: next,
        label: labelForPatch(effectivePatch),
      });
    }
  };

  const handleAnnotationSave = async () => {
    annotationSaveState = { status: 'saving' };
    try {
      if (draftAnno) {
        await core?.addAnnotation(draftAnno);
        draftAnno = null;
      } else {
        const activeId = activeAnnotationId;
        if (!activeId) {
          annotationSaveState = { status: 'clean' };
          return;
        }
        /*
         * Edits are already applied to the viewer as they are made, so this
         * commits the transaction rather than sending a patch. Sending an empty
         * one would copy a manifest annotation into the user's own set merely
         * for being saved.
         */
        await core?.commitAnnotation(activeId);
      }
      editSnapshot = null;
      annotationDirty = false;
      annotationSaveState = { status: 'saved' };
      annotationEditorTool = 'select';
      clearAnnotationSelection();
    } catch (error) {
      annotationSaveState = {
        status: 'failed',
        message:
          error instanceof Error
            ? error.message
            : $t('viewer.panels.annotations.editor.saveState.failed'),
      };
    }
  };

  const handleExportAnnotations = () => {
    const allUserAnnos = core?.getUserAnnotations() ?? [];

    const result = exportAnnotationPage(allUserAnnos, {
      canvasId: core?.getCanvasId() ?? undefined,
      expert: annotationExpertMode,
    });
    emit('exportAnnotationPage', {
      page: result.page,
      valid: result.publicationValidation.valid,
      draftValid: result.draftValidation.valid,
      publicationValid: result.publicationValidation.valid,
      excludedPrivateFields: result.excludedPrivateFields,
      unresolvedIdentities: result.unresolvedIdentities,
      unresolvedPageIdentity: result.unresolvedPageIdentity,
    });

    /*
     * The old payload still fires for one deprecation cycle. Hosts wired to it
     * keep working; hosts that want portable JSON-LD move to the event above
     * rather than reverse-engineering `ResolvedAnnotation`.
     */
    emit('exportAnnotations', { annotations: allUserAnnos });

    /* The visible control performs a visible action even when the host has not
       installed an event listener. With draft identifiers this is explicitly a
       local draft download; publication readiness is reported separately. */
    if (typeof document !== 'undefined' && typeof URL !== 'undefined') {
      const blob = new Blob([JSON.stringify(result.page, null, 2)], {
        type: 'application/ld+json',
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'mango-annotations-draft.json';
      link.click();
      URL.revokeObjectURL(url);
    }
    annotationExportStatus = result.publicationValidation.valid
      ? $t('viewer.panels.annotations.exportPublicationReady')
      : $t('viewer.panels.annotations.exportDraftOnly');
  };

  /*
   * The list needs a box of its own to be usable, so the element grows to
   * provide one rather than taking the height off the image being annotated.
   */
  const setAnnotationListHostState = (open: boolean): void => {
    const node = root?.getRootNode();
    const host = node instanceof ShadowRoot ? node.host : null;
    if (!host) return;
    if (open) host.setAttribute('data-annotation-list', 'open');
    else host.removeAttribute('data-annotation-list');
  };

  const isDrawingTool = (tool: AnnotationTool): boolean => tool !== 'select';

  /** The embedded viewer, for pan, zoom and canvas control. */
  export function getViewer(): ViewerCoreInstance | null {
    return core;
  }
</script>

<EditorShell theme={normalisedConfig.theme} bind:root>
  {#snippet title()}
    <ViewerHeader {manifestId} manifestEntry={$manifestsStore[manifestId]} />
  {/snippet}

  {#snippet actions()}
    <button type="button" class="annotation-editor__export-btn" onclick={handleExportAnnotations}>
      {$t('viewer.panels.annotations.export')}
    </button>
    {#if annotationExportStatus}
      <span class="annotation-editor__export-status" role="status">{annotationExportStatus}</span>
    {/if}
  {/snippet}

  <main class="annotation-editor__main" aria-label={$t('viewer.stage.label')}>
    <AnnotationWorkspace
      annotations={editorAnnotations}
      {activeAnnotationId}
      draftAnnotation={draftAnno}
      isDirty={annotationDirty}
      saveState={annotationSaveState}
      expertMode={annotationExpertMode}
      languages={annotationLanguages}
      onannotationcancel={handleAnnotationCancel}
      canUndo={commandState.canUndo}
      canRedo={commandState.canRedo}
      onundo={handleAnnotationUndo}
      onredo={handleAnnotationRedo}
      onkeyboardcreate={handleKeyboardAnnotationCreate}
      onkeydown={handleAnnotationKeydown}
      activeTool={annotationEditorTool}
      layers={annotationLayers}
      activeLayerId={activeAnnotationLayerId}
      onactivelayerchange={(detail) => (activeAnnotationLayerId = detail.id)}
      ontoolchange={(detail) => {
        annotationEditorTool = detail.tool;
        if (isDrawingTool(detail.tool)) return;
        /*
         * A pending draft keeps the selection.
         *
         * The editor returns to select mode on its own the moment a shape is
         * finished, which arrives here as an ordinary tool change — so clearing
         * unconditionally deselected the very annotation the user had just
         * drawn, leaving the inspector empty and the draft unreachable. Picking
         * the select tool deliberately still clears, because then there is no
         * draft.
         */
        if (!draftAnno) clearAnnotationSelection();
      }}
      ontogglelayer={handleToggleLayer}
      onaddlayer={handleAddLayer}
      onlayercolorchange={handleLayerColorChange}
      onlayerrename={handleLayerRename}
      onlayermove={handleLayerMove}
      onlayerarchive={handleLayerArchive}
      onannotationselect={(detail) => {
        const selectedDraft = draftAnno?.id === detail.id;
        if (!selectedDraft && !confirmAnnotationNavigation()) return;
        selectAnnotation(detail.id, false);
        if (!selectedDraft) annotationEditorTool = 'select';
      }}
      onannotationdelete={(detail) => handleAnnotationDelete(detail.id)}
      onannotationupdate={(detail) =>
        handleAnnotationUpdate(detail.id, detail.patch, detail.options ?? {})}
      onannotationsave={handleAnnotationSave}
      onlistopenchange={(detail: { open: boolean }) => setAnnotationListHostState(detail.open)}
    >
      {#snippet stage()}
        <div class="annotation-editor__stage">
          <ViewerCore
            bind:this={core}
            bind:manifestId
            config={normalisedConfig}
            {plugins}
            chrome={false}
            toolbar={true}
            annotationOverlay={false}
            onbeforecanvaschange={() => confirmAnnotationNavigation()}
          />
          <AnnotationEditorLayer
            enabled={true}
            viewer={osdViewer}
            activeTool={annotationEditorTool}
            canvasWidth={canvasSize.width}
            canvasHeight={canvasSize.height}
            {canvasId}
            annotations={editorStageAnnotations}
            {activeAnnotationId}
            layers={annotationLayers}
            activeLayerId={activeAnnotationLayerId}
            oneditorready={(instance) => (annotationEditor = instance)}
            ongeometrycommit={(detail) => commandStack.recordGeometry(detail.id, 'geometry')}
            onannotationcreate={handleAnnotationCreate}
            onannotationupdate={(payload) =>
              handleAnnotationUpdate(payload.id, payload.patch as Partial<ResolvedAnnotation>)}
            onannotationdelete={(payload) => handleAnnotationDelete(payload.id)}
            onannotationselect={(payload) => {
              if (draftAnno?.id !== payload.id && !confirmAnnotationNavigation()) return;
              selectAnnotation(payload.id);
              annotationEditorTool = 'select';
            }}
            ontoolchange={(detail) => {
              annotationEditorTool = detail.tool;
            }}
          />
        </div>
      {/snippet}
    </AnnotationWorkspace>
  </main>
</EditorShell>

<style>
  .annotation-editor__main {
    --mango-viewer-av-player-max-width: calc((100cqh - 24px) * 16 / 9);
    display: grid;
    height: 100%;
    min-height: 0;
    overflow: hidden;
    align-content: stretch;
  }

  .annotation-editor__stage {
    position: relative;
    display: grid;
    grid-template-rows: minmax(0, 1fr);
    height: 100%;
    min-height: 0;
    overflow: hidden;
  }

  .annotation-editor__export-btn {
    background: #ff6b35;
    color: white;
    border: none;
    padding: 8px 16px;
    border-radius: 8px;
    font-weight: 600;
    cursor: pointer;
    transition:
      background 0.2s,
      transform 0.1s;
    font-family: inherit;
    box-shadow: 0 4px 12px rgba(255, 107, 53, 0.25);
  }

  .annotation-editor__export-btn:hover {
    background: #ff8552;
    transform: translateY(-1px);
  }

  .annotation-editor__export-btn:active {
    transform: translateY(0);
  }

  .annotation-editor__export-status {
    max-width: 34ch;
    color: var(--viewer-muted, #9aa6b2);
    font-size: 11px;
    line-height: 1.3;
  }
</style>
