<script lang="ts">
  import { onDestroy, untrack } from 'svelte';
  import type OpenSeadragon from 'openseadragon';
  import { AnnotationToolbar } from '@mango-iiif/annotation';
  import {
    ViewerCore,
    manifestsStore,
    resolveCanvasThumbnail,
    type ViewerCoreInstance,
    type ViewerPlugin,
  } from '@mango-iiif/iiif-viewer/core';
  import type { AnnotateConfig } from '../core/types/config';
  import type { AnnotationStore } from '../annotations/store.svelte';
  import { canvasesOf, idOf, label } from '../annotations/iiif';
  import { targetSource } from '../annotations/model';
  import type { Annotation } from '../annotations/types';
  import { toImageAnnotation, type Region } from '../annotations/w3c';
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
    /** The shape the sidebar is about. */
    selectedRegionId?: string;
    tool?: Tool;
    canvasId?: string | null;
    onselect: (id: string | undefined) => void;
    /** A shape the user has just drawn. */
    onregioncreate?: (id: string) => void;
    onregiondelete: (id: string) => void;
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
    selectedRegionId,
    tool = $bindable('select'),
    canvasId = $bindable(null),
    onselect,
    onregioncreate,
    onregiondelete,
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

  /* The current canvas's shapes. Re-run on canvas change only: regions changed by the user are already drawn. */
  $effect(() => {
    const instance = controller;
    const id = canvasId;
    const existing = store.existing;
    if (!instance || !id) return;
    const scale = canvasScale[id] ?? { sx: 1, sy: 1 };
    const shapes = existing
      .filter((annotation) => targetSource(annotation.target) === id)
      .map((annotation) => toImageAnnotation(annotation, id, scale))
      .filter((shape) => shape !== null);
    instance.setCanvas(id, untrack(() => store.regions), shapes);
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

  const onSamCommand = (command: SamCommand) => {
    samMode = 'add';
    controller?.samCommand(command);
  };
</script>

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
    --anno-controls-height: 64px;
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
    padding: 8px 12px;
    border: 0;
    border-top: 1px solid var(--viewer-panel-border);
    background: var(--viewer-stage-bottom-bg);
    -webkit-backdrop-filter: none;
    backdrop-filter: none;
    opacity: 1;
    pointer-events: auto;
    transform: none;
  }
</style>
