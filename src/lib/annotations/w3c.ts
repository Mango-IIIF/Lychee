/*
 * Image regions <-> W3C targets.
 *
 * Annotorious works in image pixels; IIIF annotations target canvas
 * coordinates. The two match for most manifests, but not when the painted
 * image's size differs from the canvas's, so both directions scale.
 */

import { ShapeType, W3CImageFormat, type ImageAnnotation } from '@annotorious/openseadragon';
import { targetSource } from './model';
import { timeRange } from './time';
import type { Annotation, AnnotationTarget, Scope } from './types';

type Geometry = Record<string, unknown> & {
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  points?: number[][];
  cx?: number;
  cy?: number;
  rx?: number;
  ry?: number;
  polygons?: number[][][][];
};

export type ImageTarget = ImageAnnotation['target'];

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

const scaleGeometry = (type: string, g: Geometry, sx: number, sy: number, round: boolean) => {
  const r = (n: number) => (round ? Math.round(n) : n);
  if (type === ShapeType.RECTANGLE) {
    Object.assign(g, { x: r(g.x! * sx), y: r(g.y! * sy), w: r(g.w! * sx), h: r(g.h! * sy) });
  } else if (type === ShapeType.POLYGON || type === 'POLYLINE' || type === 'LINE') {
    if (g.points) g.points = g.points.map(([x, y]) => [x * sx, y * sy]);
  } else if (type === ShapeType.ELLIPSE) {
    Object.assign(g, { cx: g.cx! * sx, cy: g.cy! * sy, rx: g.rx! * sx, ry: g.ry! * sy });
  } else if (type === ShapeType.MULTIPOLYGON && g.polygons) {
    g.polygons = g.polygons.map((polygon) =>
      polygon.map((ring) => ring.map(([x, y]) => [x * sx, y * sy])),
    );
  }
  const b = g.bounds as { minX: number; minY: number; maxX: number; maxY: number } | undefined;
  if (b) g.bounds = { minX: b.minX * sx, minY: b.minY * sy, maxX: b.maxX * sx, maxY: b.maxY * sy };
};

/** Copies a target, scaled, without the provenance Annotorious adds to it. */
export const scaleTarget = (target: ImageTarget, sx: number, sy: number, round = false): ImageTarget => {
  const { created: _c, updated: _u, creator: _cr, updatedBy: _ub, ...rest } = target as ImageTarget &
    Record<string, unknown>;
  const copy = structuredClone(rest) as ImageTarget;
  if (sx !== 1 || sy !== 1 || round) {
    scaleGeometry(copy.selector.type, copy.selector.geometry as unknown as Geometry, sx, sy, round);
  }
  return copy;
};

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
 * A W3C annotation on `canvasId` as an Annotorious shape in image pixels, or
 * null when it has no supported selector (whole-canvas, time-based, ...).
 */
export const toImageAnnotation = (
  annotation: Annotation,
  canvasId: string,
  scale: { sx: number; sy: number },
): ImageAnnotation | null => {
  try {
    const { parsed } = W3CImageFormat(canvasId).parse(annotation as never);
    if (!parsed?.target?.selector) return null;
    return {
      ...parsed,
      target: scaleTarget(parsed.target, 1 / scale.sx, 1 / scale.sy),
    } as ImageAnnotation;
  } catch {
    return null;
  }
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
