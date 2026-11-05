import type { ViewerConfig } from '@mango-iiif/iiif-viewer/core';
import type { AuthorityEndpointConfig } from '../../authorities/types';

/** The viewer's config, plus the editor's own authoring setup. */
export type AnnotateConfig = ViewerConfig & {
  annotations?: {
    /**
     * Languages annotations are written in (BCP 47), shown as tabs in the
     * sidebar. Defaults to the interface `language`; one language hides the tabs.
     */
    languages?: string[];
    /** Which stage to use. Detected from the manifest's first canvas when absent. */
    mediaType?: 'image' | 'audio' | 'video';
    /** Offer Wikidata for "Identify". Default true. */
    wikidata?: boolean;
    /**
     * Further authorities for "Identify", each a host endpoint:
     * `GET {endpoint}?q=` → `{ results: [{ id, uri, label, description? }] }`.
     */
    authorities?: AuthorityEndpointConfig[];
    /**
     * "Suggest with AI" for images, shown only when set. `POST {endpoint}` with
     * `{ imageUrl, region?, context }`; see the README for the response.
     */
    ai?: { endpoint: string };
    /**
     * A strip of page thumbnails under the image, for multi-page items: `open`
     * shows it, `closed` offers it on the toolbar, `off` (the default) hides it.
     */
    gallery?: 'off' | 'closed' | 'open';
    /** Offer Auto Select (SAM2, WebGPU, ~40 MB model on first use). Default true. */
    autoSelect?: boolean;
    /** Show the W3C JSON of the annotation being written. Default false. */
    showJson?: boolean;
    /** HTTP(S) id for exported AnnotationPages; drafts get none. */
    pageId?: string;
    /**
     * What the download and `exportToHost()` may hand over: the user's
     * annotations, the table of contents, or both (the default).
     */
    export?: ('annotations' | 'structures')[];
    /**
     * Offer the Contents tab, for writing the item's table of contents. Default
     * true; turn it off where the host cannot save one, such as for a manifest it does not build.
     */
    contents?: boolean;
  };
};
