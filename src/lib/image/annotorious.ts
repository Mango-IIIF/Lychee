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
import {
  AnnotoriousEditor,
  type LocalStoreChanges,
  type SamCommand,
  type SamState,
  type Tool,
} from '@mango-iiif/annotation';
import type { ImageTarget, Region } from '../annotations/w3c';

import '@annotorious/openseadragon/annotorious-openseadragon.css';
import '@annotorious/plugin-tools/annotorious-plugin-tools.css';
import '@annotorious/plugin-magnetic-outline/plugin-magnetic-outline.css';
import '@annotorious/plugin-segment-anything/annotorious-plugin-smart-tools.css';

export type { SamCommand, SamState, Tool };

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
  /** The manifest's own editable annotations; selecting one opens it for editing. */
  existing: '#94a3b8',
  /** Manifest annotations the current user may view but not edit. */
  readonly: '#64748b',
} as const;

type SamPlugin = ReturnType<
  typeof import('@annotorious/plugin-segment-anything/openseadragon').mountOpenSeadragonPlugin
>;

export class ImageAnnotatorController {
  readonly editor: AnnotoriousEditor;
  readonly anno: OpenSeadragonAnnotator;
  private canvasId = '';
  private tool: Tool = 'select';
  private existingIds = new Set<string>();
  private editableExistingIds = new Set<string>();
  private annotatedIds = new Set<string>();
  private sam: SamPlugin | undefined;
  private samRequested = false;
  private samReady = false;
  private samBusy = false;
  private samCurrent: string | undefined;
  private samOffs: (() => void)[] = [];
  private offLocal: () => void;
  private offSelect: () => void;
  private destroyed = false;

  private style = (annotation: ImageAnnotation): DrawingStyle => {
    if (this.existingIds.has(annotation.id)) {
      const editable = this.editableExistingIds.has(annotation.id);
      const colour = editable ? COLOURS.existing : COLOURS.readonly;
      return {
        stroke: colour,
        strokeWidth: editable ? 2 : 1.5,
        strokeOpacity: editable ? 0.9 : 0.55,
        fill: colour,
        fillOpacity: editable ? 0.12 : 0.05,
      };
    }
    const colour = this.annotatedIds.has(annotation.id) ? COLOURS.annotated : COLOURS.draft;
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
        this.tool === 'smart-select'
          ? UserSelectAction.NONE
          : this.existingIds.has(annotation.id)
            ? this.editableExistingIds.has(annotation.id)
              ? UserSelectAction.SELECT
              : UserSelectAction.NONE
            : UserSelectAction.EDIT) as never,
      style: this.style,
    });
    this.anno = this.editor.annotator;
    // The editor would import its own copy on first use; this one carries the fixes in build/smartTools.ts.
    mountMagneticOutline(this.anno);

    this.offLocal = this.editor.onLocalChange(this.onStoreChange);
    this.offSelect = this.editor.on('select', this.onSelection);
    // OpenSeadragon can be destroyed before Svelte runs its teardown; release SAM while
    // its mouse tracker still exists.
    viewer.addHandler('before-destroy', this.destroy);
  }

  /** Only user changes; the shapes set by `setCanvas` arrive as REMOTE and are ignored. */
  private onStoreChange = ({ created = [], updated = [], deleted = [] }: LocalStoreChanges) => {
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

  /** Shows one canvas's shapes: the user's regions and the manifest's own annotations. */
  setCanvas(
    canvasId: string,
    regions: Region[],
    existing: ImageAnnotation[],
    editableExistingIds?: Iterable<string>,
  ): void {
    this.canvasId = canvasId;
    this.existingIds = new Set(existing.map((a) => a.id));
    if (editableExistingIds !== undefined) {
      this.editableExistingIds = new Set(editableExistingIds);
    } else {
      this.editableExistingIds = new Set(this.existingIds);
    }
    const own = regions.filter((r) => r.canvasId === canvasId).map(this.shapeOf);
    this.anno.setAnnotations([...existing, ...own], true);
  }

  /** Updates which manifest shapes may be selected for editing, restyling them in place. */
  setEditableExisting(ids: Iterable<string>): void {
    this.editableExistingIds = new Set(ids);
    this.anno.setStyle(this.style);
  }

  private shapeOf = (region: Region): ImageAnnotation =>
    ({ id: region.id, bodies: [], target: { ...region.target, annotation: region.id } }) as ImageAnnotation;

  /** Swaps one of the manifest's shapes for an editable region of the user's. */
  adopt(existingId: string, region: Region): void {
    this.existingIds.delete(existingId);
    this.editableExistingIds.delete(existingId);
    if (this.anno.state.store.getAnnotation(existingId)) this.anno.removeAnnotation(existingId);
    if (!this.anno.state.store.getAnnotation(region.id)) this.anno.addAnnotation(this.shapeOf(region));
  }

  /** Puts back a manifest shape that was adopted and not saved. */
  release(regionId: string, existing: ImageAnnotation | null): void {
    if (this.anno.state.store.getAnnotation(regionId)) this.anno.removeAnnotation(regionId);
    if (!existing) return;
    this.existingIds.add(existing.id);
    this.editableExistingIds.add(existing.id);
    if (!this.anno.state.store.getAnnotation(existing.id)) this.anno.addAnnotation(existing);
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
    return this.editor.getBounds(id);
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
    this.samOffs.forEach((off) => off());
    this.sam?.destroy();
    this.offLocal();
    this.offSelect();
    this.editor.destroy();
  };
}
