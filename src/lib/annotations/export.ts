/**
 * Standards-shaped export: an AnnotationPage a host can store and any
 * conformant consumer can read.
 *
 * Whether it is ready to publish is reported, not decided: drafts carry
 * `urn:uuid:` identifiers until a host assigns HTTP(S) ones.
 */

import { annotationPage } from './model';
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
