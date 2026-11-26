import { creatorIds, type Annotation } from '@mango-iiif/annotation';
import type {
  AnnotationPermissionScope,
  AnnotationPermissions,
  AnnotationVisibility,
} from '../core/types/config';

export interface PermissionOptions {
  userId?: string;
  permissions?: AnnotationPermissions;
  visibility?: AnnotationVisibility;
}

export interface ResolvedAnnotationPolicy {
  readonly userId: string | undefined;
  readonly edit: AnnotationPermissionScope;
  /** `undefined` when `permissions` was omitted completely: preserves legacy "drafts only" delete behaviour. */
  readonly delete: AnnotationPermissionScope | undefined;
  readonly editUnattributed: boolean;
  readonly visibility: AnnotationVisibility;
  /** True when the annotation belongs to the current user (session record or matching `userId`). */
  isMine(annotation: Annotation, isSessionRecord: boolean): boolean;
  /** True when the annotation should be shown in the sidebar and on the canvas. */
  isVisible(annotation: Annotation, isSessionRecord: boolean): boolean;
  /** True when the current user may edit this annotation. */
  canEdit(annotation: Annotation, isSessionRecord: boolean): boolean;
  /** True when the current user may delete this annotation. */
  canDelete(annotation: Annotation, isSessionRecord: boolean): boolean;
}

const VALID_SCOPES = new Set<AnnotationPermissionScope>(['all', 'own', 'none']);

const normaliseScope = (
  value: unknown,
  fallback: AnnotationPermissionScope,
): AnnotationPermissionScope =>
  typeof value === 'string' && VALID_SCOPES.has(value as AnnotationPermissionScope)
    ? (value as AnnotationPermissionScope)
    : fallback;

const hasCreator = (annotation: Annotation): boolean => {
  if (annotation.creator == null) return false;
  if (Array.isArray(annotation.creator)) return annotation.creator.length > 0;
  return true;
};

/**
 * Resolves the UI editing, deleting, and visibility rules for the signed-in user.
 *
 * - Without `permissions`: preserves legacy defaults (edit own + unattributed; delete session records only).
 * - With `permissions`: explicit role-based control (`delete` defaults to matching `edit`,
 *   and `editUnattributed` defaults to `false` so volunteers cannot edit unattributed manifest items).
 * - `visibility: 'own'` restricts both the sidebar list and image canvas to the current user's annotations.
 */
export const resolveAnnotationPolicy = (
  options: PermissionOptions = {},
): ResolvedAnnotationPolicy => {
  const userId = options.userId?.trim() || undefined;
  const raw = options.permissions;
  const hasExplicitPermissions = raw !== undefined;

  const edit: AnnotationPermissionScope = normaliseScope(raw?.edit, 'own');
  const deleteScope: AnnotationPermissionScope | undefined = hasExplicitPermissions
    ? normaliseScope(raw?.delete, edit)
    : undefined;
  const editUnattributed = raw?.editUnattributed ?? !hasExplicitPermissions;
  const visibility: AnnotationVisibility = options.visibility === 'own' ? 'own' : 'all';

  const isMine = (annotation: Annotation, isSessionRecord: boolean): boolean =>
    isSessionRecord || Boolean(userId && creatorIds(annotation).includes(userId));

  const isVisible = (annotation: Annotation, isSessionRecord: boolean): boolean =>
    visibility === 'all' || isMine(annotation, isSessionRecord);

  const matchesScope = (
    scope: AnnotationPermissionScope,
    annotation: Annotation,
    isSessionRecord: boolean,
  ): boolean => {
    if (scope === 'all') return true;
    if (scope === 'none') return false;
    return isMine(annotation, isSessionRecord) || (editUnattributed && !hasCreator(annotation));
  };

  const canEdit = (annotation: Annotation, isSessionRecord: boolean): boolean =>
    matchesScope(edit, annotation, isSessionRecord);

  const canDelete = (annotation: Annotation, isSessionRecord: boolean): boolean => {
    if (deleteScope === undefined) return isSessionRecord;
    return matchesScope(deleteScope, annotation, isSessionRecord);
  };

  return {
    userId,
    edit,
    delete: deleteScope,
    editUnattributed,
    visibility,
    isMine,
    isVisible,
    canEdit,
    canDelete,
  };
};
