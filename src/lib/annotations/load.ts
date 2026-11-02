import { annotationPageRefs, idOf } from './iiif';
import { bodiesOf, motivationsOf } from './model';
import { timeRange } from './time';
import type { Annotation } from './types';

type Json = Record<string, unknown>;

const itemsOf = (page: Json): Annotation[] => {
  const items = (page.items ?? page.resources) as unknown;
  return Array.isArray(items)
    ? (items as Json[]).filter((item) => item && typeof item === 'object' && (item.target || item.on)) as Annotation[]
    : [];
};

const TIMED_TEXT = /^(text\/vtt|text\/srt|application\/x-subrip)\b/;

/** A caption or transcript file (WebVTT, SRT) painted onto the media. */
const isTimedTextFile = (annotation: Annotation): boolean =>
  bodiesOf(annotation).some(
    (body) => TIMED_TEXT.test(String(body.format ?? '')) || /\.(vtt|srt)(\?|#|$)/i.test(String(body.id ?? '')),
  );

/**
 * A transcript written out as annotations, one cue each: every item
 * supplements a moment of the recording. The player shows these itself.
 */
const isTranscriptPage = (items: Annotation[]): boolean =>
  items.length > 0 &&
  items.every((item) => motivationsOf(item).includes('supplementing') && timeRange(item.target) !== null);

/** The page's annotations, without transcripts: those belong to the player, not the annotation list. */
const annotationsOf = (page: Json): Annotation[] => {
  const items = itemsOf(page);
  return isTranscriptPage(items) ? [] : items.filter((item) => !isTimedTextFile(item));
};

/**
 * The manifest's own annotations: embedded pages as they are, referenced pages
 * fetched. A page that fails to load is skipped, not fatal — the editor is
 * still usable without the source's annotations. Transcripts (WebVTT files
 * and pages of transcript cues) are left out.
 */
export const loadExistingAnnotations = async (
  manifest: unknown,
  signal?: AbortSignal,
): Promise<Annotation[]> => {
  const pages = await Promise.all(
    annotationPageRefs(manifest).map(async (ref) => {
      if (ref && typeof ref === 'object' && itemsOf(ref as Json).length) return ref as Json;
      const url = idOf(ref);
      if (!url) return null;
      try {
        const response = await fetch(url, { signal });
        return response.ok ? ((await response.json()) as Json) : null;
      } catch {
        return null;
      }
    }),
  );
  const seen = new Set<string>();
  return pages
    .flatMap((page) => (page ? annotationsOf(page) : []))
    .filter((annotation) => {
      const id = idOf(annotation);
      if (!id || seen.has(id)) return !id;
      seen.add(id);
      return true;
    });
};
