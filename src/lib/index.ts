export { default as AnnotationEditor } from './host/AnnotationEditor.svelte';
export { default as AnnotationBrowserTable } from './table/AnnotationBrowserTable.svelte';
export type { TableRow } from './table/types';
export {
  exportAnnotationPage,
  exportStructures,
  isPublishable,
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
export type { Annotation, AnnotationBody, AnnotationPage, AnnotationTarget } from './annotations/types';
export type { AuthorityEndpointConfig } from './authorities/types';
export type { AnnotateConfig } from './core/types/config';
