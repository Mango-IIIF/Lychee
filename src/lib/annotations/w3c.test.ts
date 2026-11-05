import { describe, expect, it } from 'vitest';
import { exportAnnotationPage, isPublishable } from './export';
import { canvasScale, mediaKindOf } from './iiif';
import { formatTime, parseTime, timeRange, validateTime } from './time';
import { recordFromW3C, toW3C, type ExportContext, type Region, type UserRecord } from './w3c';
import type { Annotation } from './types';

const CANVAS = 'https://example.org/canvas/1';
const MANIFEST = 'https://example.org/manifest';

const ctx: ExportContext = { manifestId: MANIFEST, canvasScale: { [CANVAS]: { sx: 2, sy: 2 } } };

const rectangle: Region = {
  id: 'shape-1',
  canvasId: CANVAS,
  target: {
    annotation: 'shape-1',
    selector: {
      type: 'RECTANGLE',
      geometry: { x: 10.4, y: 20, w: 30, h: 40, bounds: { minX: 10.4, minY: 20, maxX: 40.4, maxY: 60 } },
    },
  } as unknown as Region['target'],
};

const record = (patch: Partial<UserRecord>): UserRecord => ({
  id: 'urn:uuid:a',
  scope: 'region',
  annotation: { id: 'urn:uuid:a', type: 'Annotation', motivation: 'commenting', body: { type: 'TextualBody', value: 'Hi' } },
  ...patch,
});

describe('records → W3C', () => {
  it('targets a shape on the canvas, scaled to canvas units, in whole pixels', () => {
    const annotation = toW3C(record({ canvasId: CANVAS, regionId: 'shape-1' }), rectangle, ctx);
    expect(annotation.target).toMatchObject({
      type: 'SpecificResource',
      source: { id: CANVAS, type: 'Canvas', partOf: { id: MANIFEST, type: 'Manifest' } },
      selector: { type: 'FragmentSelector', value: 'xywh=pixel:21,40,60,80' },
    });
  });

  it('targets a whole canvas, or the whole manifest', () => {
    expect(toW3C(record({ scope: 'canvas', canvasId: CANVAS }), undefined, ctx).target).toEqual({
      id: CANVAS,
      type: 'Canvas',
      partOf: { id: MANIFEST, type: 'Manifest' },
    });
    expect(toW3C(record({ scope: 'manifest' }), undefined, ctx).target).toEqual({ id: MANIFEST, type: 'Manifest' });
  });

  it('reads host annotations back as regions, canvases, times or the manifest', () => {
    const shaped = toW3C(record({ canvasId: CANVAS, regionId: 'shape-1' }), rectangle, ctx);
    const { record: imported, region } = recordFromW3C(shaped, ctx);
    expect(imported.scope).toBe('region');
    expect(region?.target.selector.geometry).toMatchObject({ x: 10.5, y: 20, w: 30, h: 40 });

    const timed: Annotation = {
      id: 't',
      type: 'Annotation',
      target: { type: 'SpecificResource', source: CANVAS, selector: { type: 'FragmentSelector', value: 't=5,9' } },
    };
    expect(recordFromW3C(timed, ctx).record.scope).toBe('time');
    expect(recordFromW3C({ id: 'c', type: 'Annotation', target: CANVAS }, ctx).record.scope).toBe('canvas');
    expect(recordFromW3C({ id: 'm', type: 'Annotation', target: MANIFEST }, ctx).record.scope).toBe('manifest');
  });
});

describe('time', () => {
  it('reads media fragments from selectors and URLs', () => {
    expect(timeRange({ source: CANVAS, selector: { value: 't=1.5,3' } })).toEqual({ start: 1.5, end: 3 });
    expect(timeRange(`${CANVAS}#t=12`)).toEqual({ start: 12, end: null });
    expect(timeRange(CANVAS)).toBeNull();
  });

  it('validates a range against the duration', () => {
    expect(validateTime('', '', 100)).toBe('start');
    expect(validateTime('120', '', 100)).toBe('startAfterEnd');
    expect(validateTime('10', '5', 100)).toBe('end');
    expect(validateTime('10', '', 0)).toBeNull();
  });

  it('shows times as clock times, and reads them back', () => {
    expect(formatTime(3725.9)).toBe('1:02:05');
    expect(formatTime(3452)).toBe('57:32');
    expect(formatTime(5)).toBe('0:05');
    expect(formatTime(3452.48, { fraction: true })).toBe('57:32.48');
    expect(formatTime(3452, { fraction: true })).toBe('57:32');
    expect(formatTime(59.9996, { fraction: true })).toBe('1:00');

    expect(parseTime('1:02:05')).toBe(3725);
    expect(parseTime('62:05')).toBe(3725);
    expect(parseTime('3725')).toBe(3725);
    expect(parseTime(' 1:02:05.5 ')).toBe(3725.5);
    expect(parseTime('0:00.125')).toBe(0.125);
    expect(parseTime(formatTime(3452.48, { fraction: true }))).toBe(3452.48);
    for (const bad of ['', 'abc', '1:60', '1:02:60', '1:2:3:4', '-5', '1.5:00', '1::05']) {
      expect(parseTime(bad)).toBeNull();
    }
  });
});

describe('IIIF helpers', () => {
  it('detects the media kind from the first canvas, v3 and v2', () => {
    const v3 = (type: string) => ({ items: [{ items: [{ items: [{ body: { type } }] }] }] });
    expect(mediaKindOf(v3('Sound'))).toBe('audio');
    expect(mediaKindOf(v3('Video'))).toBe('video');
    expect(mediaKindOf(v3('Image'))).toBe('image');
    expect(mediaKindOf({ sequences: [{ canvases: [{ images: [{ resource: { '@type': 'dctypes:Image' } }] }] }] })).toBe(
      'image',
    );
  });

  it('scales image pixels to canvas units', () => {
    const canvas = { width: 1000, height: 500, items: [{ items: [{ body: { type: 'Image', width: 4000, height: 2000 } }] }] };
    expect(canvasScale(canvas)).toEqual({ sx: 0.25, sy: 0.25 });
  });
});

describe('export', () => {
  it('reports draft identifiers, and is publishable once everything has an HTTP id', () => {
    const draft = exportAnnotationPage([{ id: 'urn:uuid:1', type: 'Annotation', target: CANVAS }], { manifestId: MANIFEST });
    expect(draft.page).toMatchObject({ type: 'AnnotationPage', partOf: [{ id: MANIFEST, type: 'Manifest' }] });
    expect(draft.unresolvedIdentities).toEqual(['urn:uuid:1']);
    expect(isPublishable(draft)).toBe(false);

    const ready = exportAnnotationPage([{ id: 'https://example.org/a/1', type: 'Annotation', target: CANVAS }], {
      pageId: 'https://example.org/page/1',
    });
    expect(isPublishable(ready)).toBe(true);
  });
});
