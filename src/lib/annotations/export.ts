/**
 * Standards-shaped export: an AnnotationPage a host can store and any
 * conformant consumer can read.
 *
 * Whether it is ready to publish is reported, not decided: drafts carry
 * `urn:uuid:` identifiers until a host assigns HTTP(S) ones.
 */

import { annotationPage, type Annotation, type AnnotationPage } from '@mango-iiif/annotation';
import type { Range } from './structures';

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

/**
 * A batch of session changes for hosts (e.g. a CMS such as Drupal) that validate
 * and persist annotation actions on an explicit Save or Submit.
 *
 * Each item in `created` and `updated` is a standard W3C Annotation (no custom
 * action properties mixed into the W3C JSON); `deleted` lists identifiers removed
 * from the manifest or host store.
 */
export type AnnotationChangeset = {
  manifestId: string;
  /** New annotations created during this session (draft `urn:uuid:` ids until the host assigns HTTP(S) ids). */
  created: Annotation[];
  /** Existing annotations modified during this session (keep their original ids). */
  updated: Annotation[];
  /** Identifiers of existing annotations deleted during this session. */
  deleted: string[];
  /** Saved table of contents Ranges, included when changed during this session. */
  structures?: Range[];
  /** True when the saved table of contents differs from what was loaded. */
  structuresChanged: boolean;
  /** True when any annotation was created, updated, or deleted, or the table of contents changed. */
  hasChanges: boolean;
};

export type BuildChangesetOptions = {
  manifestId: string;
  userAnnotations: readonly Annotation[];
  modifiedExistingIds: readonly string[];
  deletedExistingIds: readonly string[];
  structures?: readonly Range[];
  structuresChanged?: boolean;
};

export const buildChangeset = ({
  manifestId,
  userAnnotations,
  modifiedExistingIds,
  deletedExistingIds,
  structures,
  structuresChanged = false,
}: BuildChangesetOptions): AnnotationChangeset => {
  const updatedIds = new Set(modifiedExistingIds);
  const created: Annotation[] = [];
  const updated: Annotation[] = [];
  for (const annotation of userAnnotations) {
    const { '@context': _context, ...clean } = annotation;
    if (updatedIds.has(annotation.id)) updated.push(clean as Annotation);
    else created.push(clean as Annotation);
  }
  const deleted = [...new Set(deletedExistingIds)];
  const hasChanges = created.length > 0 || updated.length > 0 || deleted.length > 0 || structuresChanged;
  return {
    manifestId,
    created,
    updated,
    deleted,
    ...(structuresChanged && structures ? { structures: [...structures] } : {}),
    structuresChanged,
    hasChanges,
  };
};
