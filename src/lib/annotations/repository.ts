/**
 * The persistence contract.
 *
 * The editor does not know how a host stores annotations, and should not: the
 * same editor runs against a static file, a repository's own API, and a IIIF
 * annotation server. What it does know is the shape of the conversation —
 * pages are loaded, annotations are created, updated and deleted, a create may
 * come back with a different identifier than it went out with, and an update
 * may lose a race.
 *
 * Plain W3C JSON in both directions, so a host can wire this to `fetch`, a
 * framework's data layer or an in-memory test store without importing anything
 * from Mango.
 */

import type { Annotation, AnnotationPage } from './types';

/** Why a repository call failed, in terms the UI can act on. */
export type RepositoryErrorKind =
  /** The host rejected the change; retrying unchanged will fail again. */
  | 'rejected'
  /** Someone else changed it first. The user has to choose what to keep. */
  | 'conflict'
  /** The caller is not permitted to do this. */
  | 'forbidden'
  /** Transport failed. Retrying may work. */
  | 'network'
  /** The request was abandoned. */
  | 'cancelled';

export class RepositoryError extends Error {
  constructor(
    readonly kind: RepositoryErrorKind,
    message: string,
    /** The version the server holds, when it told us. */
    readonly serverVersion?: string,
  ) {
    super(message);
    this.name = 'RepositoryError';
  }

  get retryable(): boolean {
    return this.kind === 'network';
  }
}

/** An annotation as stored, with whatever the host uses for optimistic locking. */
export type StoredAnnotation = {
  annotation: Annotation;
  /** ETag or revision. Passed back on update so the host can detect conflicts. */
  version?: string;
};

export type AnnotationRepository = {
  loadPage(pageId: string, options?: { signal?: AbortSignal }): Promise<AnnotationPage>;
  listPages(canvasId: string, options?: { signal?: AbortSignal }): Promise<string[]>;
  /**
   * The returned annotation is authoritative: a host that mints identifiers
   * server-side returns one carrying the assigned id.
   */
  create(annotation: Annotation, options?: { pageId?: string; signal?: AbortSignal }): Promise<StoredAnnotation>;
  update(annotation: Annotation, options?: { version?: string; signal?: AbortSignal }): Promise<StoredAnnotation>;
  delete(annotationId: string, options?: { version?: string; signal?: AbortSignal }): Promise<void>;
};

/** What a host implements. Every callback is optional; a missing one is reported as `forbidden`. */
export type AnnotationHostCallbacks = {
  loadPage?: (pageId: string, signal?: AbortSignal) => Promise<unknown>;
  listPages?: (canvasId: string, signal?: AbortSignal) => Promise<string[]>;
  create?: (
    annotation: Annotation,
    context: { pageId?: string; signal?: AbortSignal },
  ) => Promise<{ annotation?: Annotation; id?: string; version?: string } | void>;
  update?: (
    annotation: Annotation,
    context: { version?: string; signal?: AbortSignal },
  ) => Promise<{ annotation?: Annotation; version?: string } | void>;
  delete?: (annotationId: string, context: { version?: string; signal?: AbortSignal }) => Promise<void>;
};

// A declaration rather than a const arrow: TypeScript only narrows past a
// `never`-returning call when the callee's type is known from a declaration.
function unsupported(operation: string): never {
  throw new RepositoryError('forbidden', `The host does not support ${operation}.`);
}

/** Maps whatever a host's stack throws to something the UI can act on. */
const toRepositoryError = (error: unknown): RepositoryError => {
  if (error instanceof RepositoryError) return error;
  if (error instanceof DOMException && error.name === 'AbortError') {
    return new RepositoryError('cancelled', 'The request was cancelled.');
  }
  const status =
    typeof error === 'object' && error !== null && 'status' in error
      ? Number((error as { status: unknown }).status)
      : undefined;
  const message = error instanceof Error ? error.message : String(error);
  if (status === 409 || status === 412) return new RepositoryError('conflict', message);
  if (status === 401 || status === 403) return new RepositoryError('forbidden', message);
  if (status && status >= 400 && status < 500) return new RepositoryError('rejected', message);
  return new RepositoryError('network', message);
};

/** Returning nothing means "what you sent is what I stored". */
const readWriteResult = (
  sent: Annotation,
  result: { annotation?: Annotation; id?: string; version?: string } | void,
): StoredAnnotation => {
  if (!result) return { annotation: sent };
  if (result.annotation) return { annotation: result.annotation, version: result.version };
  if (result.id && result.id !== sent.id) return { annotation: { ...sent, id: result.id }, version: result.version };
  return { annotation: sent, version: result.version };
};

const isPage = (json: unknown): json is AnnotationPage =>
  !!json && typeof json === 'object' && Array.isArray((json as AnnotationPage).items);

export const createHostRepository = (callbacks: AnnotationHostCallbacks): AnnotationRepository => ({
  async loadPage(pageId, options) {
    if (!callbacks.loadPage) unsupported('loading annotation pages');
    try {
      const json = await callbacks.loadPage(pageId, options?.signal);
      if (!isPage(json)) throw new RepositoryError('rejected', 'The page could not be read.');
      return json;
    } catch (error) {
      throw toRepositoryError(error);
    }
  },

  async listPages(canvasId, options) {
    if (!callbacks.listPages) return [];
    try {
      return await callbacks.listPages(canvasId, options?.signal);
    } catch (error) {
      throw toRepositoryError(error);
    }
  },

  async create(annotation, options) {
    if (!callbacks.create) unsupported('creating annotations');
    try {
      return readWriteResult(annotation, await callbacks.create(annotation, { ...options }));
    } catch (error) {
      throw toRepositoryError(error);
    }
  },

  async update(annotation, options) {
    if (!callbacks.update) unsupported('updating annotations');
    try {
      return readWriteResult(annotation, await callbacks.update(annotation, { ...options }));
    } catch (error) {
      throw toRepositoryError(error);
    }
  },

  async delete(annotationId, options) {
    if (!callbacks.delete) unsupported('deleting annotations');
    try {
      await callbacks.delete(annotationId, { ...options });
    } catch (error) {
      throw toRepositoryError(error);
    }
  },
});

/** Swaps a draft identifier for the one the server assigned, across the page. */
export const adoptAssignedId = (page: AnnotationPage, draftId: string, assignedId: string): AnnotationPage =>
  draftId === assignedId
    ? page
    : { ...page, items: page.items.map((item) => (item.id === draftId ? { ...item, id: assignedId } : item)) };
