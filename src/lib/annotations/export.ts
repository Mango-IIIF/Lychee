/**
 * Standards-shaped export: an AnnotationPage a host can store and any
 * conformant consumer can read.
 *
 * Whether it is ready to publish is reported, not decided: drafts carry
 * `urn:uuid:` identifiers until a host assigns HTTP(S) ones.
 */

import { annotationPage } from './model';
import type { Range } from './structures';
import type { Annotation, AnnotationPage } from './types';

export type ExportOptions = {
  /** Public HTTP(S) identifier for the page. Omitted from a draft page when absent. */
  pageId?: string;
  /** Manifest the page is `partOf`. */
  manifestId?: string | null;
};

export type ExportResult = {
  page: AnnotationPage;
  /** Annotations still carrying a draft (non-HTTP) identifier. */
  unresolvedIdentities: string[];
  /** True when the page itself needs a public HTTP(S) identifier. */
  unresolvedPageIdentity: boolean;
  /** Every annotation and the page have HTTP(S) identifiers. */
  publicationValid: boolean;
};

export const isHttpId = (id: unknown): boolean => typeof id === 'string' && /^https?:\/\//.test(id);

export const exportAnnotationPage = (
  annotations: readonly Annotation[],
  options: ExportOptions = {},
): ExportResult => {
  const items = annotations.map(({ '@context': _context, ...annotation }) => annotation as Annotation);
  const unresolvedIdentities = items.filter((a) => !isHttpId(a.id)).map((a) => a.id);
  const unresolvedPageIdentity = !isHttpId(options.pageId);
  return {
    page: annotationPage(items, options.manifestId ?? null, options.pageId),
    unresolvedIdentities,
    unresolvedPageIdentity,
    publicationValid: unresolvedIdentities.length === 0 && !unresolvedPageIdentity,
  };
};

/** True when the page is safe to publish rather than only to store locally. */
export const isPublishable = (result: ExportResult): boolean => result.publicationValid;

/** What an export carries: the user's annotations, the table of contents, or both. */
export type ExportKind = 'annotations' | 'structures';

export const EXPORT_KINDS: readonly ExportKind[] = ['annotations', 'structures'];

/** The kinds a host allows, in a fixed order; none or nothing valid means both. */
export const normaliseExportKinds = (kinds: unknown): ExportKind[] => {
  const wanted = Array.isArray(kinds) ? EXPORT_KINDS.filter((kind) => kinds.includes(kind)) : [];
  return wanted.length ? wanted : [...EXPORT_KINDS];
};

export type StructuresExportResult = {
  /** The Ranges for the manifest's `structures`. */
  structures: Range[];
  /** The Ranges still carrying a draft (non-HTTP) identifier, nested ones too. */
  unresolvedIdentities: string[];
  /** There is a table of contents and every Range has an HTTP(S) identifier. */
  publicationValid: boolean;
};

/** What one export handed the host, by kind. */
export type ExportData = {
  annotations?: ExportResult;
  structures?: StructuresExportResult;
};

const rangeIds = (ranges: readonly Range[]): string[] =>
  ranges.flatMap((range) => [
    range.id,
    ...rangeIds((Array.isArray(range.items) ? range.items : []).filter((item): item is Range => item?.type === 'Range')),
  ]);

/** A saved table of contents: the Ranges for the manifest's `structures`. */
export const exportStructures = (structures: readonly Range[]): StructuresExportResult => {
  const unresolvedIdentities = rangeIds(structures).filter((id) => !isHttpId(id));
  return {
    structures: [...structures],
    unresolvedIdentities,
    publicationValid: structures.length > 0 && unresolvedIdentities.length === 0,
  };
};
