export { default as AnnotationEditor } from './host/AnnotationEditor.svelte';
export { default as AnnotationBrowserTable } from './table/AnnotationBrowserTable.svelte';
export type { TableRow } from './table/types';
export { exportAnnotationPage, isPublishable, type ExportResult } from './annotations/export';
export {
  adoptAssignedId,
  createHostRepository,
  RepositoryError,
  type AnnotationHostCallbacks,
  type AnnotationRepository,
} from './annotations/repository';
export type { Annotation, AnnotationBody, AnnotationPage, AnnotationTarget } from './annotations/types';
export type { AuthorityEndpointConfig } from './authorities/types';
export type { AnnotateConfig } from './core/types/config';
