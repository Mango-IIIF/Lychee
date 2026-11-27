export { default as AnnotationEditor } from './host/AnnotationEditor.svelte';
export { default as AnnotationBrowserTable } from './table/AnnotationBrowserTable.svelte';
export type { TableRow } from './table/types';
export {
  buildChangeset,
  exportAnnotationPage,
  exportStructures,
  isPublishable,
  type AnnotationChangeset,
  type BuildChangesetOptions,
  type ExportData,
  type ExportKind,
  type ExportResult,
  type StructuresExportResult,
} from './annotations/export';
export {
  adoptAssignedId,
  createHostRepository,
  RepositoryError,
  type AnnotationHostCallbacks,
  type AnnotationRepository,
} from './annotations/repository';
export { readStructures, toStructures, type Range } from './annotations/structures';
export type {
  Annotation,
  AnnotationBody,
  AnnotationPage,
  AnnotationTarget,
  AuthorityEndpointConfig,
} from '@mango-iiif/annotation';
export {
  resolveAnnotationPolicy,
  type PermissionOptions,
  type ResolvedAnnotationPolicy,
} from './annotations/permissions';
export type {
  AnnotateConfig,
  AnnotationPermissionScope,
  AnnotationPermissions,
  AnnotationVisibility,
} from './core/types/config';
