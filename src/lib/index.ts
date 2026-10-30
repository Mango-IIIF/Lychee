export { default as AnnotationEditor } from './host/AnnotationEditor.svelte';
export { default as AnnotationWorkspace } from './features/annotations/workspace/AnnotationWorkspace.svelte';
export { default as AnnotationEditorLayer } from './features/annotations/AnnotationEditorLayer.svelte';
export { exportAnnotationPage, isPublishable } from './features/annotations/export';
export {
  adoptAssignedId,
  createHostRepository,
  RepositoryError,
} from './features/annotations/repository';
export { w3cToResolved, type ResolvedAnnotation } from '@mango-iiif/iiif-viewer/core';
export type { AnnotateConfig } from './core/types/config';
