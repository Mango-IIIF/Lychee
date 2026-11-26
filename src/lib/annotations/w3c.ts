/*
 * Image regions <-> W3C targets.
 *
 * Annotorious works in image pixels; IIIF annotations target canvas
 * coordinates. The two match for most manifests, but not when the painted
 * image's size differs from the canvas's, so both directions scale.
 */

import { ShapeType, W3CImageFormat, type ImageAnnotation } from '@annotorious/openseadragon';
import {
  scaleTarget,
  targetSource,
  timeRange,
  toImageAnnotation,
  type Annotation,
  type AnnotationTarget,
  type ImageTarget,
  type Scope,
} from '@mango-iiif/annotation';

export { scaleTarget, toImageAnnotation, type ImageTarget };

/** A shape drawn in Annotorious, in image pixels. */
export interface Region {
  id: string;
  canvasId: string;
  target: ImageTarget;
}

/** The user's annotation. Its target is computed from the scope, so moving a shape moves its annotations. */
export interface UserRecord {
  id: string;
  scope: Scope;
  canvasId?: string;
  regionId?: string;
  /** Everything but the target; for `time` scope, the target too. */
  annotation: Omit<Annotation, 'target'> & { target?: AnnotationTarget };
}

export interface ExportContext {
  manifestId: string;
  /** canvasId -> scale from image pixels to canvas units. */
  canvasScale: Record<string, { sx: number; sy: number }>;
}

/** The W3C target of a region, in canvas coordinates. */
export const regionTarget = (region: Region, ctx: ExportContext): AnnotationTarget => {
  const { sx, sy } = ctx.canvasScale[region.canvasId] ?? { sx: 1, sy: 1 };
  // Whole pixels keep an xywh fragment readable for other IIIF tools.
  const scaled = scaleTarget(region.target, sx, sy, region.target.selector.type === ShapeType.RECTANGLE);
  const serialized = W3CImageFormat(region.canvasId).serialize({
    id: region.id,
    bodies: [],
    target: scaled,
  } as ImageAnnotation);
  const target = (Array.isArray(serialized.target) ? serialized.target[0] : serialized.target) as unknown as Record<
    string,
    unknown
  >;
  return {
    ...(target as object),
    type: 'SpecificResource',
    source: { id: region.canvasId, type: 'Canvas', partOf: { id: ctx.manifestId, type: 'Manifest' } },
  } as AnnotationTarget;
};

export const toW3C = (record: UserRecord, region: Region | undefined, ctx: ExportContext): Annotation => {
  let target: AnnotationTarget;
  if (record.scope === 'region' && region) {
    target = regionTarget(region, ctx);
  } else if (record.scope === 'canvas' && record.canvasId) {
    target = { id: record.canvasId, type: 'Canvas', partOf: { id: ctx.manifestId, type: 'Manifest' } };
  } else if (record.scope === 'time' && record.annotation.target) {
    target = record.annotation.target;
  } else {
    target = { id: ctx.manifestId, type: 'Manifest' };
  }
  return { ...record.annotation, id: record.id, type: 'Annotation', target } as Annotation;
};

/**
 * A host-supplied W3C annotation in the editor's terms: a time range, a shape
 * (which becomes a region of its own), a whole canvas or the whole manifest.
 */
export const recordFromW3C = (
  annotation: Annotation,
  ctx: ExportContext,
): { record: UserRecord; region?: Region } => {
  const { target, ...rest } = annotation;
  const source = targetSource(target);
  const base = { id: annotation.id, annotation: rest };

  if (timeRange(target)) {
    return { record: { ...base, scope: 'time', canvasId: source, annotation: { ...rest, target } } };
  }
  if (source in ctx.canvasScale) {
    const shape = toImageAnnotation(annotation, source, ctx.canvasScale[source]);
    if (shape) {
      const region: Region = { id: `${annotation.id}#region`, canvasId: source, target: shape.target };
      return { record: { ...base, scope: 'region', canvasId: source, regionId: region.id }, region };
    }
    return { record: { ...base, scope: 'canvas', canvasId: source } };
  }
  return { record: { ...base, scope: 'manifest' } };
};
