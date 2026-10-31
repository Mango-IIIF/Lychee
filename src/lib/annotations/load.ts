import { annotationPageRefs, idOf } from './iiif';
import type { Annotation } from './types';

type Json = Record<string, unknown>;

const itemsOf = (page: Json): Annotation[] => {
  const items = (page.items ?? page.resources) as unknown;
  return Array.isArray(items)
    ? (items as Json[]).filter((item) => item && typeof item === 'object' && (item.target || item.on)) as Annotation[]
    : [];
};

/**
 * The manifest's own annotations: embedded pages as they are, referenced pages
 * fetched. A page that fails to load is skipped, not fatal — the editor is
 * still usable without the source's annotations.
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
    .flatMap((page) => (page ? itemsOf(page) : []))
    .filter((annotation) => {
      const id = idOf(annotation);
      if (!id || seen.has(id)) return !id;
      seen.add(id);
      return true;
    });
};
