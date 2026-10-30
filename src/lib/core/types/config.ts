import type { ViewerConfig } from '@mango-iiif/iiif-viewer/core';

/** The viewer's config, plus the editor's own authoring setup. */
export type AnnotateConfig = ViewerConfig & {
  annotations?: {
    /** Allowed BCP 47 languages shown by the annotation language switch. */
    languages?: string[];
  };
};
