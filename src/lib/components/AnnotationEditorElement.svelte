<svelte:options
  customElement={{
    tag: 'mango-annotation-editor',
    shadow: 'open',
    props: {
      manifestId: { attribute: 'manifest-id', type: 'String', reflect: true },
      config: { attribute: 'config', type: 'String', reflect: false },
      plugins: { attribute: 'plugins', type: 'Object', reflect: false },
    },
  }}
/>

<script lang="ts">
  import type {
    ContentSize,
    MediaType,
    ViewBox,
    ViewerCoreInstance,
    ViewerEventMap,
    ViewerPlugin,
    ViewerStateSnapshot,
  } from '@mango-iiif/iiif-viewer/core';
  import type { Annotation } from '../annotations/types';
  import type { AnnotateConfig } from '../core/types/config';
  import AnnotationEditor from '../host/AnnotationEditor.svelte';

  export let manifestId = '';
  export let config: string | AnnotateConfig | undefined = undefined;
  export let plugins: ViewerPlugin[] = [];

  let editor: AnnotationEditor | null = null;

  /** The embedded viewer's API, for pan, zoom and canvas control. */
  export function getViewer(): ViewerCoreInstance | null {
    return editor?.getViewer() ?? null;
  }

  /*
   * The embedded viewer's navigation, on the element itself, so a host page
   * can pan, zoom and turn pages exactly as it would with `<mango-viewer>`.
   */
  const viewerApi = () => getViewer();

  export function getViewBox(): ViewBox | null {
    return viewerApi()?.getViewBox() ?? null;
  }

  export function setViewBox(box: ViewBox): void {
    viewerApi()?.setViewBox(box);
  }

  export function getContentSize(): ContentSize | null {
    return viewerApi()?.getContentSize?.() ?? null;
  }

  export function getZoom(): number {
    return viewerApi()?.getZoom() ?? 100;
  }

  export function setZoom(percent: number): void {
    viewerApi()?.setZoom(percent);
  }

  export function zoomIn(): void {
    viewerApi()?.zoomIn();
  }

  export function zoomOut(): void {
    viewerApi()?.zoomOut();
  }

  export function goHome(): void {
    viewerApi()?.goHome();
  }

  export function panTo(x: number, y: number): void {
    viewerApi()?.panTo(x, y);
  }

  export function getState(): ViewerStateSnapshot | null {
    return viewerApi()?.getState() ?? null;
  }

  export function getManifestId(): string | null {
    return viewerApi()?.getManifestId() ?? null;
  }

  export function setManifest(id: string): void {
    viewerApi()?.setManifest(id);
  }

  export function getMediaType(): MediaType | null {
    return viewerApi()?.getMediaType() ?? null;
  }

  export function getCanvasIndex(): number {
    return viewerApi()?.getCanvasIndex() ?? -1;
  }

  export function getCanvasId(): string | null {
    return viewerApi()?.getCanvasId() ?? null;
  }

  export function getCanvasCount(): number {
    return viewerApi()?.getCanvasCount() ?? 0;
  }

  export function setCanvasByIndex(index: number): void {
    viewerApi()?.setCanvasByIndex(index);
  }

  export function setCanvasById(canvasId: string): void {
    viewerApi()?.setCanvasById(canvasId);
  }

  /** The current canvas's annotations, as W3C: the manifest's and the user's own. */
  export function getAnnotations(): Annotation[] {
    return editor?.getAnnotations() ?? [];
  }

  /** Every annotation the user has made, across all canvases, as W3C. */
  export function getUserAnnotations(): Annotation[] {
    return editor?.getUserAnnotations() ?? [];
  }

  /** Adds a W3C annotation to the user's own, e.g. one loaded from the host's store. */
  export function addAnnotation(annotation: Annotation): void {
    editor?.addAnnotation(annotation);
  }

  /** Replaces the user's annotations. */
  export function setAnnotations(annotations: Annotation[]): void {
    editor?.setAnnotations(annotations);
  }

  export function removeAnnotation(annotationId: string): void {
    editor?.removeAnnotation(annotationId);
  }

  /* Viewer events (navigation, zoom). Images only: audio and video have no embedded viewer. */
  export function on<K extends keyof ViewerEventMap>(
    event: K,
    handler: (payload: ViewerEventMap[K]) => void,
  ): () => void {
    return viewerApi()?.on(event, handler) ?? (() => undefined);
  }

  export function off<K extends keyof ViewerEventMap>(
    event: K,
    handler: (payload: ViewerEventMap[K]) => void,
  ): void {
    viewerApi()?.off(event, handler);
  }
</script>

<div class="element-root">
  <AnnotationEditor bind:this={editor} bind:manifestId {config} {plugins} />
</div>

<style>
  :host {
    display: block;
    width: 100%;
    /*
     * The element owns one definite block size. Embedders can override this
     * with ordinary site CSS (`mango-annotation-editor { height: 900px; }`) or
     * with the custom property. A definite host height keeps the shadow layout
     * from alternating between percentage and intrinsic sizing at breakpoints.
     */
    height: var(--mango-viewer-height, min(720px, 100vh));
    height: var(--mango-viewer-height, min(720px, 100svh));
    min-height: 0;
  }

  /*
   * The annotation list needs a box of its own to be usable, so the element
   * grows to provide one rather than taking the height off the page being
   * annotated. Still a single definite block size — only its value changes —
   * which is what the shadow layout depends on.
   *
   * An embedder who sets `mango-annotation-editor { height: ... }` in site CSS
   * wins over this, as they do over the base rule; the list then shares the
   * height they chose.
   */
  :host([data-annotation-list='open']) {
    height: calc(var(--mango-viewer-height, min(720px, 100vh)) + 230px);
    height: calc(var(--mango-viewer-height, min(720px, 100svh)) + 230px);
  }

  .element-root {
    width: 100%;
    height: 100%;
    min-height: 0;
    box-sizing: border-box;
  }
</style>
