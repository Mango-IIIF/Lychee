# Mango Annotate

[![npm](https://img.shields.io/npm/v/@mango-iiif/annotate)](https://www.npmjs.com/package/@mango-iiif/annotate)
[![CI](https://github.com/Mango-IIIF/annotate/actions/workflows/ci.yml/badge.svg)](https://github.com/Mango-IIIF/annotate/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A IIIF annotation editor for [Mango](https://github.com/Mango-IIIF/Mango).

- **Images**: Mango's viewer is the stage; [Annotorious](https://annotorious.dev/)
  draws on it, with the toolset [IMMARKUS](https://github.com/rsimon/immarkus) is
  built from: rectangle, polygon, ellipse, freehand and line, plus Smart Scissors,
  Edge Snap and Auto Select (SAM2, in the browser).
- **Audio and video**: [`@mango-iiif/av`](https://github.com/Mango-IIIF/av)
  plays the recording through [RAMP](https://github.com/samvera-labs/ramp), with
  its transcript, chapters and existing annotations alongside.
  Annotations target a moment or a range.
- **One sidebar for both**: say what the annotation is about, pick what you want
  to do (note, transcribe, tag, identify, highlight, link) and fill in only the
  boxes that need. Text can be written in several languages.
- **Output**: W3C Web Annotations, downloaded or handed to the host as an
  `AnnotationPage`.

## Fastest start: standalone website

```html
<script
  type="module"
  src="https://unpkg.com/@mango-iiif/annotate/src/dist/mango-annotation-editor.js"
></script>

<mango-annotation-editor
  manifest-id="https://iiif.io/api/cookbook/recipe/0005-image-service/manifest.json"
  config='{"theme":"light","annotations":{"languages":["en","cy"]}}'
></mango-annotation-editor>
```

The standalone bundle includes the viewer and its styles. `@mango-iiif/av`
(with React and RAMP) is fetched only when an audio or video manifest is opened, and the Auto Select model
only when that tool is first used.

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

The package ships its smart-tool workers in `src/dist/annotorious/assets/` and
loads them relative to the bundle, so a bundler copies them like any other asset.

### Package entry points

| Entry                            | Contents                                                                               |
| -------------------------------- | -------------------------------------------------------------------------------------- |
| `@mango-iiif/annotate`           | `AnnotationEditor`, `AnnotationBrowserTable`, export and repository helpers, W3C types |
| `@mango-iiif/annotate/element`   | `<mango-annotation-editor>`                                                            |
| `@mango-iiif/annotate/style.css` | Editor styles (the viewer's live in `@mango-iiif/iiif-viewer/style.css`)               |

## Config

`config` is the viewer's config plus an `annotations` block:

```js
editor.config = {
  language: "en", // interface language
  theme: "light", // dark, light, sepia, midnight or ringo; users can change it under Settings
  showSettings: true, // the header's Settings menu (viewer colour)
  annotations: {
    languages: ["en", "cy"], // what annotations are written in; one hides the tabs
    mediaType: "audio", // image | audio | video; detected from the first canvas when absent
    wikidata: true, // offer Wikidata for "Identify"
    authorities: [
      // further sources for "Identify", each a host endpoint
      {
        id: "geonames",
        label: "GeoNames",
        endpoint: "/api/geonames",
        placeholder: "Find a place",
      },
    ],
    ai: { endpoint: "/api/describe" }, // "Suggest with AI" for images, shown only when set
    gallery: "off", // page thumbnails under the image: off, closed (toolbar toggle) or open
    autoSelect: true, // offer Auto Select (WebGPU, ~40 MB model on first use)
    showJson: false, // show the W3C JSON being written
    pageId: undefined, // HTTP(S) id for exported AnnotationPages
  },
};
```

### Endpoints

Credentials stay on the host; the editor only calls URLs it is given.

**Authority** — `GET {endpoint}?q=cardiff`

```json
{
  "results": [
    {
      "id": "2653822",
      "uri": "https://sws.geonames.org/2653822/",
      "label": "Cardiff",
      "description": "Wales"
    }
  ]
}
```

or `{ "error": "message" }` with a non-2xx status.

**AI** — `POST {endpoint}` with `{ imageUrl, region?, context: { title?, canvasLabel?, metadata? } }`.
`imageUrl` is a IIIF Image API crop of the selected area when the image has a
service. The response is `{ model, label_<lang>?, description_<lang>?,
transcription?, transcription_language?, tags?: string[], entities?: [{ name,
kind, authority, search_term, evidence? }] }`; `label` and `description` may
instead be language maps. Suggestions only fill the form, and anything used keeps
the model as the body's `generator`.

`apps/demo/server/api.ts` implements both for the demo (Claude for AI,
GeoNames for places).

## What gets written

| Intent     | Motivation      | Bodies                                                                  |
| ---------- | --------------- | ----------------------------------------------------------------------- |
| Note       | `commenting`    | optional `label` (language map) + one `TextualBody` per language        |
| Transcribe | `supplementing` | one `TextualBody` per language                                          |
| Tag        | `tagging`       | one `TextualBody` per keyword, `purpose: "tagging"`                     |
| Identify   | `identifying`   | one `SpecificResource` per linked entity, `purpose: "identifying"`      |
| Highlight  | `highlighting`  | optional `TextualBody` per language                                     |
| Link       | `linking`       | `SpecificResource` to the linked item, with a `t=` range for recordings |

Targets: an area of an image (`SpecificResource` on the canvas, with an
`xywh=pixel:` fragment or SVG selector in canvas coordinates), a whole canvas,
or a moment or range of a recording (`t=start[,end]`). Several annotations can
share one area; moving the shape moves them all. Annotations about the whole
manifest (from the host or the item) are read, shown and editable, but not
offered for new ones.

## The element

`<mango-annotation-editor>` takes `manifest-id`, `config` and `plugins` (viewer
plugins for the image stage).

Annotations, as W3C JSON: `getAnnotations()` (the current canvas, the
manifest's and the user's), `getUserAnnotations()`, `addAnnotation(a)`,
`setAnnotations(list)` (replaces the user's) and `removeAnnotation(id)`.

Image navigation is on the element as on `<mango-viewer>`: `getViewBox`,
`setViewBox`, `getZoom`, `setZoom`, `zoomIn`, `zoomOut`, `goHome`, `panTo`,
`getCanvasIndex`, `setCanvasByIndex`, `getCanvasId`, `getManifestId`,
`setManifest`, `getState`, `getViewer()` and `on`/`off` for viewer events.

### Events

| Event                  | Detail                                                                     |
| ---------------------- | -------------------------------------------------------------------------- |
| `annotationCreate`     | `{ annotation }`                                                           |
| `annotationUpdate`     | `{ annotation }`                                                           |
| `annotationDelete`     | `{ id }`                                                                   |
| `annotationsChange`    | `{ annotations }` — all the user's annotations                             |
| `exportAnnotationPage` | `{ page, publicationValid, unresolvedIdentities, unresolvedPageIdentity }` |
| `themeChange`          | `{ theme }` — the user picked a viewer colour under Settings               |

```js
editor.addEventListener("exportAnnotationPage", async (event) => {
  await fetch("/api/annotations", {
    method: "PUT",
    headers: { "Content-Type": "application/ld+json" },
    body: JSON.stringify(event.detail.page),
  });
});
```

New annotations have `urn:uuid:` identifiers; `publicationValid` stays false
until the host assigns HTTP(S) ones (see `createHostRepository` and
`adoptAssignedId`). The viewer's navigation events (`pageChange`, `zoomChange`, …)
are dispatched on the element too.

## How it fits together

```
AnnotationEditor            config, annotations, events, export
├─ ImageStage               Mango ViewerCore (no annotation overlay)
│  ├─ annotorious.ts        Auto Select, colours and regions on AnnotoriousEditor
│  └─ AnnotationToolbar     the drawing tools (@mango-iiif/annotation)
├─ AVStage                  <mango-av-media> (@mango-iiif/av), lazily loaded
├─ AnnotationSidebar        the intent-first form, shared by both (@mango-iiif/annotation)
└─ AnnotationBrowserTable   every annotation, the user's and the item's
```

The sidebar, toolbar and Annotorious facade come from `@mango-iiif/annotation`,
and the player from `@mango-iiif/av`. Authority search providers are this
package's own: Wikidata (`src/lib/authorities/wikidata.ts`) and host endpoints
(`endpoint.ts`) are passed to the sidebar as `providers`.

The editor owns the annotations; Mango only shows the image. Shapes and the
annotations about them are stored apart (`src/lib/annotations/store.svelte.ts`),
and W3C is produced from them on demand (`w3c.ts`). The manifest's own
annotation pages are fetched and shown read-only.

Two things to review when upgrading Annotorious, its plugins or Mango:

- `build/smartTools.ts`, carried over from
  [cyw-annotate](https://cyw-annotate.vercel.app), patches the smart-tool plugins: their workers move next
  to the bundle instead of `/assets/` on the site root, the SAM worker loads the
  ONNX runtime (~27 MB) from jsDelivr rather than shipping it, and SAM 0.5.0's
  worker is stopped on destroy. The build fails if upstream no longer matches.
- Annotorious must draw on the same OpenSeadragon copy Mango uses: OSD's viewport
  API branches on `instanceof $.Point`, so points from a second copy are misread
  and no shape can be drawn. Mango leaves `openseadragon` external for this, and
  the element build dedupes it; keep it that way when changing either build.

## Demo and test manifests

`npm run dev` serves `apps/demo` at http://localhost:5173: a catalogue of test
manifests (the NLW Cardiganshire Constabulary register, and two Women's Archive
Wales / Veteran Films recordings with transcripts and chapters), any manifest
URL, and the Wellcome page. `annotation-editor.html` takes `?manifest=`,
`?type=image|audio|video`, `?json=1`, `?gallery=off|closed|open` and `?lang=`.

The recording fixtures in `apps/demo/fixtures` keep their original
`http://localhost:5173/iiif-pcw-*` identifiers; the dev server rebases them onto
itself, and `build:demo` writes `apps/demo/manifests` for `DEMO_BASE_URL` (or the
Vercel URL). Media, IIIF images and Wikidata are external.

To try AI suggestions and GeoNames, copy `apps/demo/.env.example` to `.env` at the
repository root and fill it in; the demo enables them when its API server
reports keys.

## Development

The viewer is linked from a sibling checkout (`"@mango-iiif/iiif-viewer":
"file:../Mango"`), so build it first:

```bash
(cd ../Mango && npm ci && npm run build:dist)
npm ci
npm run dev
```

```bash
npm run build:dist   # library, custom element and type declarations in src/dist
npm run build:demo   # build:dist, then copy into apps/demo
npm test             # unit tests
npm run test:e2e     # Playwright, against the built demo (needs network)
npm run check        # svelte-check
npm run lint
npm run i18n:check
```

Auto Select needs WebGPU (desktop Chrome or Edge), and synthetic clicks don't
start Smart Scissors' edge detection in headless browsers, so check those two by
hand.

## Changes in 0.2

The editor was rebuilt on Annotorious and RAMP:

- removed: layers, undo/redo, the inspector panel, rectangle placement, and the
  `AnnotationWorkspace`, `AnnotationEditorLayer` and `w3cToResolved` exports;
- `@mango-iiif/annotation` and `@mango-iiif/w3c-parser` are no longer used;
- the element's annotation methods take and return W3C annotations rather than
  `ResolvedAnnotation`;
- `annotationCreate`/`Update`/`Delete`/`annotationsChange` now come from the
  editor; `exportAnnotations` and `annotationSave` are gone;
- `exportAnnotationPage` reports `publicationValid`, `unresolvedIdentities` and
  `unresolvedPageIdentity`.

## License

Mango Annotate is available under the [MIT License](LICENSE).
