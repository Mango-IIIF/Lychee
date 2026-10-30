# Mango Annotate

[![npm](https://img.shields.io/npm/v/@mango-iiif/annotate)](https://www.npmjs.com/package/@mango-iiif/annotate)
[![CI](https://github.com/Mango-IIIF/annotate/actions/workflows/ci.yml/badge.svg)](https://github.com/Mango-IIIF/annotate/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A IIIF annotation editor for [Mango](https://github.com/Mango-IIIF/Mango), built
on [`@mango-iiif/iiif-viewer`](https://www.npmjs.com/package/@mango-iiif/iiif-viewer).

Draw rectangles, points, polygons, freehand shapes and lines on a IIIF canvas,
describe them in several languages, organise them into coloured layers, and
export them as a standards-shaped W3C Web Annotation `AnnotationPage`.

## Fastest start: standalone website

```html
<script type="module" src="https://unpkg.com/@mango-iiif/annotate/src/dist/mango-annotation-editor.js"></script>

<mango-annotation-editor
  manifest-id="https://iiif.io/api/cookbook/recipe/0005-image-service/manifest.json"
  config='{"annotations":{"languages":["en","cy"]}}'
></mango-annotation-editor>
```

The standalone bundle includes the viewer and its styles.

## Install from npm

```bash
npm install @mango-iiif/annotate @mango-iiif/iiif-viewer svelte
```

Custom element:

```js
import "@mango-iiif/annotate/element";
```

Svelte component:

```svelte
<script>
  import { AnnotationEditor } from "@mango-iiif/annotate";
  import "@mango-iiif/iiif-viewer/style.css";
  import "@mango-iiif/annotate/style.css";
</script>

<AnnotationEditor manifestId="https://example.org/iiif/manifest.json" />
```

### Package entry points

| Entry                              | Contents                                                                   |
| ---------------------------------- | -------------------------------------------------------------------------- |
| `@mango-iiif/annotate`             | `AnnotationEditor`, `AnnotationWorkspace`, `AnnotationEditorLayer`, export and repository helpers |
| `@mango-iiif/annotate/element`     | `<mango-annotation-editor>`                                                |
| `@mango-iiif/annotate/style.css`   | Editor styles (the viewer's live in `@mango-iiif/iiif-viewer/style.css`)   |

## The element

`<mango-annotation-editor>` takes `manifest-id`, `config` (viewer config JSON
plus an `annotations` block) and `plugins` (viewer plugins for the stage).

It exposes the embedded viewer's navigation on the element — `getViewBox`,
`setViewBox`, `getZoom`, `setZoom`, `zoomIn`, `zoomOut`, `goHome`, `panTo`,
`getCanvasIndex`, `setCanvasByIndex`, `getCanvasId`, `getManifestId`,
`setManifest`, `getState` — plus `getAnnotations`, `getUserAnnotations`,
`addAnnotation`, `setAnnotations`, `removeAnnotation`, `getViewer()` for the
full viewer API, and `on`/`off` for events.

### Config

```js
editor.config = {
  language: "en",
  theme: "dark", // dark, light, sepia, midnight or ringo
  annotations: {
    languages: ["en", "cy"], // authoring languages offered by the language switch
  },
};
```

### Saving annotations

Mango does not choose an annotation storage or authentication service for you.
The **Download annotation draft** button downloads the user's annotations as an
`AnnotationPage`, and dispatches the same document to the host:

```js
editor.addEventListener("exportAnnotationPage", async (event) => {
  const { page, publicationValid, unresolvedIdentities } = event.detail;
  await fetch("/api/annotations", {
    method: "PUT",
    headers: { "Content-Type": "application/ld+json" },
    body: JSON.stringify(page),
  });
});
```

`publicationValid` is false until every annotation and the page have HTTP(S)
identifiers; `unresolvedIdentities` lists the ones still carrying local draft
ids. The older `exportAnnotations` event (resolved annotations rather than
JSON-LD) still fires for one deprecation cycle.

Viewer events — `pageChange`, `annotationCreate`, `annotationUpdate`,
`annotationSave`, `annotationsChange` and the rest — are dispatched as DOM events on the element
too. See the [wiki](wiki/Events.md) for the full list.

## How it fits together

`AnnotationEditor` mounts the viewer's `ViewerCore` headless, from
`@mango-iiif/iiif-viewer/core`, with the viewer's own annotation overlay turned
off. The editor layer draws and edits shapes on the viewer's OpenSeadragon
canvas instead, and the workspace panels sit around the stage.

The viewer owns the annotations — the manifest's and the user's own — so edits
go through the viewer API (`updateAnnotation`, `replaceAnnotation`,
`commitAnnotation`). The editor owns only what the viewer has no notion of: the
unsaved draft, the edit transaction that Cancel restores, undo history, layers
and the active drawing tool.

## Development

The viewer is linked from a sibling checkout (`"@mango-iiif/iiif-viewer":
"file:../Mango"`), so build it first:

```bash
(cd ../Mango && npm ci && npm run build:dist)
npm ci
npm run dev
```

`npm run dev` serves the editor demos in `apps/demo` at http://localhost:5173.

```bash
npm run build:dist   # library, custom element and type declarations in src/dist
npm run build:demo   # build:dist, then copy src/dist into apps/demo/dist
npm test             # unit tests
npm run test:e2e     # Playwright, against the built demo
npm run lint
npm run i18n:check
```

## License

Mango Annotate is available under the [MIT License](LICENSE).
