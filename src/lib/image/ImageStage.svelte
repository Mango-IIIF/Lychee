<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import type OpenSeadragon from 'openseadragon';
  import {
    AnnotationToolbar,
    canvasesOf,
    idOf,
    label,
    targetSource,
    toImageAnnotation,
    type Annotation,
  } from '@mango-iiif/annotation';
  import {
    ViewerCore,
    manifestsStore,
    resolveCanvasThumbnail,
    type ViewerCoreInstance,
    type ViewerPlugin,
  } from '@mango-iiif/iiif-viewer/core';
  import type { AnnotateConfig } from '../core/types/config';
  import { t } from '../core/i18n';
  import type { AnnotationStore } from '../annotations/store.svelte';
  import type { Region } from '../annotations/w3c';
  import { ImageAnnotatorController, type Bounds, type SamCommand, type SamState, type Tool } from './annotorious';
  import GalleryStrip from './GalleryStrip.svelte';

  /**
   * Mango's viewer as a stage, with Annotorious drawing on its OpenSeadragon
   * instance. The viewer is never given annotations; everything on the image
   * is Annotorious.
   */
  interface Props {
    manifestId: string;
    config: AnnotateConfig;
    plugins?: ViewerPlugin[];
    store: AnnotationStore;
    /** canvasId -> image-pixel to canvas-unit scale. */
    canvasScale: Record<string, { sx: number; sy: number }>;
    /** Region ids with at least one of the user's annotations. */
    annotatedIds: string[];
    /** Canvas ids with at least one of the user's annotations, marked in the gallery strip. */
    annotatedCanvasIds?: string[];
    /** Manifest annotations visible on the stage (defaults to `store.existing`). */
    existingAnnotations?: Annotation[];
    /** Manifest annotation ids the current user may select to edit on the image. */
    editableExistingIds?: string[];
    /** The shape the sidebar is about. */
    selectedRegionId?: string;
    tool?: Tool;
    canvasId?: string | null;
    onselect: (id: string | undefined) => void;
    /** A shape the user has just drawn. */
    onregioncreate?: (id: string) => void;
    onregiondelete: (id: string) => void;
    oncanceldraw?: () => void;
    onbeforecanvaschange?: () => boolean;
    /** Where the viewer's own events (pageChange, zoomChange, …) are dispatched. */
    eventTarget?: EventTarget | null;
    /** Mango theme for the stage; changes apply without reloading the viewer. */
    theme?: string;
  }

  let {
    manifestId = $bindable(''),
    config,
    plugins = [],
    store,
    canvasScale,
    annotatedIds,
    annotatedCanvasIds = [],
    existingAnnotations = undefined,
    editableExistingIds = undefined,
    selectedRegionId,
    tool = $bindable('select'),
    canvasId = $bindable(null),
    onselect,
    onregioncreate,
    onregiondelete,
    oncanceldraw,
    onbeforecanvaschange,
    eventTarget = null,
    theme = 'dark',
  }: Props = $props();


  let core: ViewerCoreInstance | null = $state(null);
  let osd: OpenSeadragon.Viewer | null = $state.raw(null);
  let controller: ImageAnnotatorController | null = $state.raw(null);
  let samState = $state<SamState>({ state: 'idle' });
  let samMode = $state<'add' | 'remove'>('add');

  /* The page thumbnails: open unless configured otherwise, and pointless for a single image. */
  let galleryMode = $derived(config.annotations?.gallery ?? 'open');
  let galleryOpen = $state(false);
  $effect(() => {
    galleryOpen = galleryMode === 'open';
  });

  let manifestEntry = $derived($manifestsStore[manifestId]);
  let pages = $derived(
    canvasesOf(manifestEntry?.json).map((canvas, index) => ({
      id: idOf(canvas),
      label: label(canvas.label, config.language ?? 'en'),
      thumbnail: resolveCanvasThumbnail(manifestEntry?.manifesto, idOf(canvas), index),
    })),
  );
  let galleryAvailable = $derived(galleryMode !== 'off' && pages.length > 1);
  let pageIndex = $derived(pages.findIndex((page) => page.id === canvasId));
  let annotatedPages = $derived(new Set(annotatedCanvasIds));

  const selectPage = (index: number) => {
    if (index === pageIndex || onbeforecanvaschange?.() === false) return;
    core?.setCanvasByIndex(index);
  };

  /* The editor needs pixels it can read (smart tools) and clicks that draw rather than zoom. */
  let stageConfig = $derived({
    ...config,
    theme: untrack(() => theme),
    initialLayoutMode: 'single' as const,
    osdConfig: {
      ...config.osdConfig,
      crossOriginPolicy: 'Anonymous',
      gestureSettingsMouse: { clickToZoom: false, dblClickToZoom: false },
    },
  });

  $effect(() => {
    const viewer = core;
    if (!viewer) return;
    if (eventTarget) viewer.setEventTarget(eventTarget);
    canvasId = viewer.getCanvasId();
    const offs = [
      viewer.on('rendererReady', ({ renderer }) => {
        osd = renderer.kind === 'image' ? (renderer.viewer as unknown as OpenSeadragon.Viewer) : null;
      }),
      viewer.on('pageChange', ({ canvasId: id }) => {
        canvasId = id;
      }),
    ];
    return () => offs.forEach((off) => off());
  });

  /* One annotator per OpenSeadragon instance. */
  $effect(() => {
    const viewer = osd;
    if (!viewer) return;
    const instance = new ImageAnnotatorController(viewer, {
      onRegionChange: (region: Region) => {
        const created = !store.regions.some((r) => r.id === region.id);
        store.upsertRegion(region);
        if (created) onregioncreate?.(region.id);
      },
      onRegionDelete: (id) => onregiondelete(id),
      onSelect: (id) => onselect(id),
      onSamState: (state) => (samState = state),
    });
    instance.setTool(untrack(() => tool));
    controller = instance;
    return () => {
      instance.destroy();
      if (controller === instance) controller = null;
      samState = { state: 'idle' };
    };
  });

  /* The current canvas's shapes. Re-run on canvas or visible-existing change: user regions are already drawn. */
  $effect(() => {
    const instance = controller;
    const id = canvasId;
    const existing = existingAnnotations ?? store.existing;
    if (!instance || !id) return;
    const scale = canvasScale[id] ?? { sx: 1, sy: 1 };
    const shapes = existing
      .filter((annotation) => targetSource(annotation.target) === id)
      .map((annotation) => toImageAnnotation(annotation, id, scale))
      .filter((shape) => shape !== null);
    instance.setCanvas(
      id,
      untrack(() => store.regions),
      shapes,
      untrack(() => editableExistingIds),
    );
  });

  $effect(() => {
    if (editableExistingIds !== undefined) {
      controller?.setEditableExisting(editableExistingIds);
    }
  });

  $effect(() => {
    controller?.setAnnotated(annotatedIds);
  });

  $effect(() => {
    controller?.setTool(tool);
  });

  $effect(() => {
    controller?.select(selectedRegionId);
  });

  $effect(() => {
    controller?.setSamMode(samMode);
  });

  /* The config sets the first theme; later changes go through the API, keeping the page and zoom. */
  $effect(() => {
    core?.setTheme(theme);
  });

  onDestroy(() => controller?.destroy());

  export const fitTo = (id: string): void => controller?.fitTo(id);
  export const removeRegion = (id: string): void => controller?.remove(id);
  export const getBounds = (id: string): Bounds | undefined => controller?.getBounds(id);
  export const getViewer = (): ViewerCoreInstance | null => core;
  export const goToCanvas = (id: string): void => core?.setCanvasById(id);
  /** Makes one of the manifest's shapes editable, as `region`. */
  export const adoptExisting = (existingId: string, region: Region): void => controller?.adopt(existingId, region);
  /** Puts a manifest shape back after an edit that was not saved. */
  export const releaseExisting = (annotation: Annotation, regionId: string): void => {
    const source = targetSource(annotation.target);
    // After a canvas change the new canvas's shapes are already drawn.
    const shape = source === canvasId ? toImageAnnotation(annotation, source, canvasScale[source] ?? { sx: 1, sy: 1 }) : null;
    controller?.release(regionId, shape);
  };

  const HINT_TOOLS = new Set<Tool>(['rectangle', 'polygon', 'ellipse', 'path', 'line']);
  let activeHintTool = $derived(HINT_TOOLS.has(tool) ? tool : null);

  const cancelDraw = () => {
    if (oncanceldraw) oncanceldraw();
    else tool = 'select';
  };

  const onWindowKeydown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !activeHintTool) return;
    const target = event.target as HTMLElement | null;
    if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
    event.preventDefault();
    cancelDraw();
  };

  const onSamCommand = (command: SamCommand) => {
    samMode = 'add';
    controller?.samCommand(command);
  };
</script>

<svelte:window onkeydown={onWindowKeydown} />

<div class="image-stage">
  <div class="image-stage__viewer">
  <ViewerCore
    bind:this={core}
    bind:manifestId
    config={stageConfig}
    {plugins}
    chrome={false}
    toolbar={true}
    annotationOverlay={false}
    onbeforecanvaschange={() => onbeforecanvaschange?.() ?? true}
  />
  {#if osd}
    <AnnotationToolbar
      {tool}
      {samState}
      {samMode}
      autoSelect={config.annotations?.autoSelect !== false}
      ontoolchange={(next: Tool) => (tool = next)}
      onsammode={(mode: 'add' | 'remove') => (samMode = mode)}
      onsamcommand={onSamCommand}
      gallery={galleryAvailable ? galleryOpen : undefined}
      ongallerytoggle={() => (galleryOpen = !galleryOpen)}
    />
    {#if activeHintTool}
      <div class="image-stage__draw-hint" role="status" aria-live="polite">
        <span class="image-stage__draw-hint-dot" aria-hidden="true"></span>
        <span class="image-stage__draw-hint-text">{$t(`annotate.tools.hints.${activeHintTool}`)}</span>
        <button type="button" class="image-stage__draw-hint-cancel" onclick={cancelDraw}>
          {$t('annotate.region.cancelDraw')}
        </button>
      </div>
    {/if}
  {/if}
  </div>
  {#if galleryAvailable && galleryOpen}
    <GalleryStrip {pages} selectedIndex={pageIndex} annotatedIds={annotatedPages} onselect={selectPage} />
  {/if}
</div>

<style>
  .image-stage {
    display: grid;
    grid-template-rows: minmax(0, 1fr) auto;
    height: 100%;
    min-height: 0;
    overflow: hidden;
  }

  .image-stage__viewer {
    /* The drawing tools stop short of Mango's controls, the row under the image. */
    --anno-controls-height: 52px;
    container: anno-stage / inline-size;
    position: relative;
    display: grid;
    grid-template-rows: minmax(0, 1fr);
    min-height: 0;
    overflow: hidden;
  }

  /*
   * Mango floats its toolbar over the image and shows it on hover; here it is a
   * row of its own under the image, always visible and never over a shape.
   */
  .image-stage__viewer :global(.stage__primary) {
    grid-template-rows: minmax(0, 1fr) auto;
  }

  .image-stage__viewer :global(.stage__primary .stage__toolbar.stage__toolbar--below) {
    position: static;
    width: 100%;
    margin: 0;
    padding: 6px 12px;
    border: 0;
    border-top: 1px solid var(--viewer-panel-border);
    background: var(--viewer-stage-bottom-bg);
    -webkit-backdrop-filter: none;
    backdrop-filter: none;
    opacity: 1;
    pointer-events: auto;
    transform: none;
  }

  .image-stage__draw-hint {
    position: absolute;
    top: 14px;
    left: 50%;
    z-index: 20;
    display: inline-flex;
    align-items: center;
    gap: 10px;
    max-width: calc(100% - 140px);
    padding: 6px 8px 6px 14px;
    border: 1px solid var(--anno-accent);
    border-radius: 999px;
    background: var(--anno-raised);
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.28);
    color: var(--viewer-text);
    font-size: 13px;
    line-height: 1.35;
    transform: translateX(-50%);
    pointer-events: auto;
  }

  .image-stage__draw-hint-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--anno-accent);
    flex-shrink: 0;
  }

  .image-stage__draw-hint-text {
    font-weight: 500;
  }

  .image-stage__draw-hint-cancel {
    flex-shrink: 0;
    height: 26px;
    padding: 0 10px;
    border: 1px solid var(--viewer-panel-border);
    border-radius: 999px;
    background: var(--anno-tint);
    color: var(--viewer-text);
    font: inherit;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
  }

  .image-stage__draw-hint-cancel:hover,
  .image-stage__draw-hint-cancel:focus-visible {
    border-color: var(--anno-accent);
    color: var(--anno-accent);
  }
</style>
