import type { ViewerConfig } from '@mango-iiif/iiif-viewer/core';
import type { AuthorityEndpointConfig } from '@mango-iiif/annotation';

/** Which annotations a user may modify (`all`, `own`, or `none`). */
export type AnnotationPermissionScope = 'all' | 'own' | 'none';

/**
 * UI-level editing and deleting permissions for the current user.
 * Hosts should map their own roles (admin, content owner, volunteer, …) onto
 * these capabilities and enforce the same rules server-side.
 */
export interface AnnotationPermissions {
  /**
   * Which annotations the user can edit:
   * - `'all'`: any annotation (admins / content owners), including others' and unattributed ones
   * - `'own'`: only the user's own annotations (session drafts + matching `userId`)
   * - `'none'`: no annotations can be edited
   */
  edit?: AnnotationPermissionScope;
  /**
   * Which annotations the user can delete:
   * - `'all'`: any annotation, including manifest-loaded ones (emits `annotationDelete`)
   * - `'own'`: the user's own annotations, including manifest-loaded ones matching `userId`
   * - `'none'`: nothing can be deleted
   *
   * Defaults to matching `edit` when `permissions` is provided.
   */
  delete?: AnnotationPermissionScope;
  /**
   * Whether manifest annotations without a `creator` can be edited/deleted when
   * the scope is `'own'`. Always allowed when scope is `'all'`.
   * Defaults to `false` when `permissions` is configured.
   */
  editUnattributed?: boolean;
}

/**
 * Which annotations are shown in the sidebar list and on the image canvas:
 * - `'all'` (default): show every annotation (with Your / All tabs when `userId` is set)
 * - `'own'`: show only the signed-in user's annotations
 */
export type AnnotationVisibility = 'all' | 'own';

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
     * shows it (the default), `closed` offers it on the toolbar, `off` hides it.
     */
    gallery?: 'off' | 'closed' | 'open';
    /** Offer Auto Select (SAM2, WebGPU, ~40 MB model on first use). Default true. */
    autoSelect?: boolean;
    /**
     * The signed-in user's id, ideally a URI. New annotations get it as their
     * `creator`, and the annotation list splits into Your annotations (theirs,
     * made here or with this creator) and All annotations (unless `visibility: 'own'`).
     */
    userId?: string;
    /**
     * Optional display name for the signed-in user. Written as `creator.name` on
     * new annotations alongside `userId`.
     */
    userName?: string;
    /**
     * Editing and deleting permissions for the signed-in user (e.g.
     * `{ edit: 'all', delete: 'all' }` for admins/content owners, or
     * `{ edit: 'own', delete: 'own' }` for volunteers).
     */
    permissions?: AnnotationPermissions;
    /**
     * Which annotations are visible in the sidebar and on the image canvas:
     * `'all'` (default) or `'own'` (only annotations belonging to `userId`).
     */
    visibility?: AnnotationVisibility;
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
    /**
     * Maximum number of chapter levels that can be authored in Contents.
     * Defaults to 2. Deeper levels already present in a manifest are preserved.
     */
    contentsLevels?: number;
  };
};
