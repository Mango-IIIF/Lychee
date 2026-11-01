/*
 * Annotorious on Mango's OpenSeadragon viewer.
 *
 * The toolset is the one IMMARKUS is built from: rectangle and polygon from
 * Annotorious, ellipse / freehand / line from plugin-tools, Smart Scissors and
 * Edge Snap from plugin-magnetic-outline, and Auto Select (SAM2, WebGPU) from
 * plugin-segment-anything, loaded only when first used.
 *
 * @mango-iiif/annotation's AnnotoriousEditor creates the annotator and switches
 * the drawing tools; this adds Auto Select, the colours, and the regions.
 *
 * Svelte owns the state; this module only translates between it and the
 * annotator, so it has no framework code in it.
 */

import type OpenSeadragon from 'openseadragon';
import {
  UserSelectAction,
  type DrawingStyle,
  type ImageAnnotation,
  type OpenSeadragonAnnotator,
} from '@annotorious/openseadragon';
import { mountPlugin as mountMagneticOutline } from '@annotorious/plugin-magnetic-outline';
import { AnnotoriousEditor, type SamCommand, type SamState, type Tool } from '@mango-iiif/annotation';
import type { ImageTarget, Region } from '../annotations/w3c';

import '@annotorious/openseadragon/annotorious-openseadragon.css';
import '@annotorious/plugin-tools/annotorious-plugin-tools.css';
import '@annotorious/plugin-magnetic-outline/plugin-magnetic-outline.css';
import '@annotorious/plugin-segment-anything/annotorious-plugin-smart-tools.css';

export type { SamCommand, SamState, Tool };

export const DRAW_TOOLS: readonly Tool[] = [
  'rectangle',
  'polygon',
  'ellipse',
  'path',
  'line',
  'intelligent-scissors',
  'magnetic-cursor',
];

export interface ImageAnnotatorCallbacks {
  onRegionChange(region: Region): void;
  onRegionDelete(id: string): void;
  /** A shape the user selected on the image, or none. */
  onSelect(id: string | undefined): void;
  onSamState(state: SamState): void;
}

export interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const COLOURS = {
  /** A shape the user drew and has not annotated yet. */
  draft: '#2dd4bf',
  /** A shape with at least one of the user's annotations. */
  annotated: '#f59e0b',
  /** The manifest's own annotations, read-only. */
  existing: '#94a3b8',
} as const;

type SamPlugin = ReturnType<
  typeof import('@annotorious/plugin-segment-anything/openseadragon').mountOpenSeadragonPlugin
>;

type StoreChanges = {
  created?: ImageAnnotation[];
  updated?: { newValue: ImageAnnotation }[];
  deleted?: ImageAnnotation[];
};

/** Origin.LOCAL from @annotorious/core, which the OSD bundle does not re-export. */
const ORIGIN_LOCAL = 'LOCAL';

export class ImageAnnotatorController {
  readonly editor: AnnotoriousEditor;
  readonly anno: OpenSeadragonAnnotator;
  private canvasId = '';
  private tool: Tool = 'select';
  private existingIds = new Set<string>();
  private annotatedIds = new Set<string>();
  private sam: SamPlugin | undefined;
  private samRequested = false;
  private samReady = false;
  private samBusy = false;
  private samCurrent: string | undefined;
  private samOffs: (() => void)[] = [];
  private destroyed = false;

  private style = (annotation: ImageAnnotation): DrawingStyle => {
    const colour = this.existingIds.has(annotation.id)
      ? COLOURS.existing
      : this.annotatedIds.has(annotation.id)
        ? COLOURS.annotated
        : COLOURS.draft;
    return { stroke: colour, strokeWidth: 2, fill: colour, fillOpacity: 0.12 };
  };

  constructor(
    readonly viewer: OpenSeadragon.Viewer,
    private callbacks: ImageAnnotatorCallbacks,
  ) {
    this.editor = new AnnotoriousEditor({
      viewer,
      drawingMode: 'click',
      userSelectAction: ((annotation: ImageAnnotation) =>
        this.tool === 'smart-select' || this.existingIds.has(annotation.id)
          ? UserSelectAction.NONE
          : UserSelectAction.EDIT) as never,
      style: this.style,
    });
    this.anno = this.editor.annotator;
    // The editor would import its own copy on first use; this one carries the fixes in build/smartTools.ts.
    mountMagneticOutline(this.anno);

    this.anno.state.store.observe(this.onStoreChange, { origin: ORIGIN_LOCAL as never });
    this.anno.on('selectionChanged', this.onSelection);
    viewer.element.addEventListener('pointerdown', this.onPointerDown, true);
    // OpenSeadragon can be destroyed before Svelte runs its teardown; release SAM while
    // its mouse tracker still exists.
    viewer.addHandler('before-destroy', this.destroy);
  }

  /** Only user changes; the shapes set by `setCanvas` arrive as REMOTE and are ignored. */
  private onStoreChange = (event: { changes: StoreChanges }) => {
    const { created = [], updated = [], deleted = [] } = event.changes;
    for (const a of created) this.emitRegion(a);
    for (const { newValue } of updated) this.emitRegion(newValue);
    for (const a of deleted) this.callbacks.onRegionDelete(a.id);
  };

  private emitRegion(annotation: ImageAnnotation) {
    if (this.existingIds.has(annotation.id)) return;
    this.callbacks.onRegionChange({
      id: annotation.id,
      canvasId: this.canvasId,
      target: annotation.target as ImageTarget,
    });
  }

  /** SAM selects and clears its draft on every refinement; those are not user selections. */
  private onSelection = (selected: ImageAnnotation[]) => {
    if (this.tool !== 'smart-select') this.callbacks.onSelect(selected[0]?.id);
  };

  /**
   * While a shape is selected Annotorious shows its editor in place of the drawing tool, so
   * a press on empty image would only deselect and the user would have to click again to
   * draw. Deselect on the press instead, and replay it to the tool once it has mounted.
   */
  private onPointerDown = (event: PointerEvent) => {
    const layer = event.target as Element;
    if (
      !event.isTrusted ||
      !DRAW_TOOLS.includes(this.tool) ||
      !layer.classList?.contains('a9s-osd-drawinglayer') ||
      this.anno.getSelected().length === 0
    ) {
      return;
    }
    this.anno.setSelected(undefined);
    // Annotorious mounts the tool in its next microtask flush; the replay stays on the layer
    // so OpenSeadragon does not see the press twice.
    queueMicrotask(() =>
      layer.dispatchEvent(
        new PointerEvent('pointerdown', {
          clientX: event.clientX,
          clientY: event.clientY,
          screenX: event.screenX,
          screenY: event.screenY,
          button: event.button,
          buttons: event.buttons,
          pointerId: event.pointerId,
          pointerType: event.pointerType,
          isPrimary: event.isPrimary,
          shiftKey: event.shiftKey,
          ctrlKey: event.ctrlKey,
          altKey: event.altKey,
          metaKey: event.metaKey,
          cancelable: true,
        }),
      ),
    );
  };

  /** Shows one canvas's shapes: the user's regions and the manifest's own annotations. */
  setCanvas(canvasId: string, regions: Region[], existing: ImageAnnotation[]): void {
    this.canvasId = canvasId;
    this.existingIds = new Set(existing.map((a) => a.id));
    const own = regions
      .filter((r) => r.canvasId === canvasId)
      .map((r) => ({ id: r.id, bodies: [], target: { ...r.target, annotation: r.id } }) as ImageAnnotation);
    this.anno.setAnnotations([...existing, ...own], true);
  }

  /** Shapes with annotations draw in a different colour. */
  setAnnotated(ids: Iterable<string>): void {
    this.annotatedIds = new Set(ids);
    this.anno.setStyle(this.style);
  }

  setTool(tool: Tool): void {
    this.tool = tool;
    // Auto Select is not an Annotorious drawing tool: SAM draws while drawing is off.
    this.editor.setTool(tool === 'smart-select' ? 'select' : tool);
    if (tool === 'smart-select') this.startSam();
    else this.stopSam();
  }

  select(id: string | undefined): void {
    if (this.tool === 'smart-select') return;
    const current = this.anno.getSelected()[0]?.id;
    if (id === current) return;
    this.anno.setSelected(id && this.anno.state.store.getAnnotation(id) ? id : undefined);
  }

  remove(id: string): void {
    this.anno.removeAnnotation(id);
  }

  fitTo(id: string): void {
    if (this.anno.state.store.getAnnotation(id)) {
      this.anno.fitBoundsWithConstraints({ id }, { padding: 80 } as never);
    }
  }

  /** A region's bounds in image pixels. */
  getBounds(id: string): Bounds | undefined {
    const b = this.anno.state.store.getAnnotation(id)?.target.selector.geometry.bounds;
    return b && { x: b.minX, y: b.minY, w: b.maxX - b.minX, h: b.maxY - b.minY };
  }

  /* ---------------------------------------------------------------- SAM */

  private reportSam() {
    if (!this.samReady) return;
    this.callbacks.onSamState({
      state: 'ready',
      busy: this.samBusy,
      hasSelection: Boolean(this.samCurrent),
    });
  }

  private startSam() {
    if (this.samReady && this.sam) {
      this.samCurrent = undefined;
      this.sam.start();
      this.reportSam();
      return;
    }
    if (this.samRequested) return;
    this.samRequested = true;
    if (!('gpu' in navigator)) {
      this.callbacks.onSamState({ state: 'unsupported' });
      return;
    }
    this.callbacks.onSamState({ state: 'loading', progress: 0 });
    import('@annotorious/plugin-segment-anything/openseadragon')
      .then(({ mountOpenSeadragonPlugin }) => {
        if (this.destroyed) return;
        const plugin = mountOpenSeadragonPlugin(this.anno);
        this.sam = plugin;
        const on = plugin.on as (event: string, cb: (...args: never[]) => void) => () => void;
        this.samOffs.push(
          on('downloadProgress', (d: { loaded: number; total?: number; complete?: boolean }) =>
            this.callbacks.onSamState({
              state: 'loading',
              progress: d.complete ? 1 : d.total ? d.loaded / d.total : 0,
            }),
          ),
          on('initialized', () => {
            this.samReady = true;
            if (this.tool === 'smart-select') plugin.start();
            this.reportSam();
          }),
          on('initError', (e: unknown) =>
            this.callbacks.onSamState({
              state: 'error',
              message: String(e instanceof Error ? e.message : e),
            }),
          ),
          on('animationStart', () => {
            if (this.tool !== 'smart-select') return;
            this.samBusy = true;
            this.samCurrent = undefined;
            this.reportSam();
          }),
          on('encodingStart', () => {
            this.samBusy = true;
            this.reportSam();
          }),
          on('encodingFinished', () => {
            this.samBusy = false;
            this.reportSam();
          }),
          on('createAnnotation', (a: ImageAnnotation) => {
            if (this.tool !== 'smart-select') return;
            this.samCurrent = a.id;
            this.reportSam();
          }),
          on('deleteAnnotation', (a: ImageAnnotation) => {
            // reset() removes through the public API (REMOTE origin), past the LOCAL observer.
            this.callbacks.onRegionDelete(a.id);
            this.samCurrent = undefined;
            this.reportSam();
          }),
        );
        plugin.init();
      })
      .catch((e: unknown) => {
        if (!this.destroyed) {
          this.callbacks.onSamState({
            state: 'error',
            message: String(e instanceof Error ? e.message : e),
          });
        }
      });
  }

  private stopSam() {
    if (!this.sam || !this.samReady) return;
    this.sam.stop();
    this.samBusy = false;
    this.samCurrent = undefined;
    this.reportSam();
  }

  setSamMode(mode: 'add' | 'remove'): void {
    this.sam?.setQueryMode(mode);
  }

  /** Done keeps the shape and selects it for annotating; Reset discards it. */
  samCommand(kind: SamCommand): void {
    const plugin = this.sam;
    const id = this.samCurrent;
    if (!plugin || this.samBusy || !id) return;
    this.samCurrent = undefined;
    plugin.setQueryMode('add');
    if (kind === 'reset') {
      plugin.reset();
    } else {
      const shape = this.anno.state.store.getAnnotation(id);
      if (shape) this.emitRegion(shape as ImageAnnotation);
      plugin.restart();
      this.anno.setSelected(id);
      this.callbacks.onSelect(id);
    }
    this.reportSam();
  }

  destroy = (): void => {
    if (this.destroyed) return;
    this.destroyed = true;
    this.viewer.removeHandler('before-destroy', this.destroy);
    this.viewer.element?.removeEventListener('pointerdown', this.onPointerDown, true);
    this.samOffs.forEach((off) => off());
    this.sam?.destroy();
    this.anno.state.store.unobserve(this.onStoreChange);
    this.anno.off('selectionChanged', this.onSelection);
    this.editor.destroy();
  };
}
