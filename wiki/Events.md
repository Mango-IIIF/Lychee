# Events

Every event is dispatched on `<mango-annotation-editor>` as a DOM
`CustomEvent`, with the payload in `event.detail`.

## Annotation events

| Event               | Payload           | Purpose                                                              |
| ------------------- | ----------------- | -------------------------------------------------------------------- |
| `annotationCreate`  | `{ annotation }`  | The user saved a new annotation (W3C JSON).                          |
| `annotationUpdate`  | `{ annotation }`  | The user saved changes to one.                                       |
| `annotationDelete`  | `{ id }`          | An annotation was deleted, including those removed with their shape. |
| `annotationsChange` | `{ annotations }` | All the user's annotations, after any change.                        |
## Table of contents events

| Event              | Payload                      | Purpose                                                                 |
| ------------------ | ---------------------------- | ----------------------------------------------------------------------- |
| `structuresChange` | `{ structures }`             | The table of contents being written, as IIIF Ranges, after any edit.   |
| `structuresSave`   | `{ structures, manifestId }` | The user saved it: the whole table of contents, for the manifest's `structures`. |

A table of contents is not an annotation and never goes through the annotation
events. Hand the stored form back with `setStructures(ranges)`; see
[Tables of contents](Tables-of-Contents).

## Export

| Event                  | Payload                                                                      |
| ---------------------- | ---------------------------------------------------------------------------- |
| `exportAnnotationPage` | `page`, `publicationValid`, `unresolvedIdentities`, `unresolvedPageIdentity` |
| `exportStructures`     | `structures`, `publicationValid`, `unresolvedIdentities`                     |

The download button offers **Annotations**, **Contents** or **Annotations and
contents** once there is a saved table of contents, whether it came with the
manifest or was saved here. Until then it downloads the annotations, as before.
Each choice fires one event per kind it includes, annotations first, so each
can go to its own endpoint:

- `exportAnnotationPage`: the user's annotations.
- `exportStructures`: the saved table of contents, as `structures` (Ranges for
  the manifest). Unsaved changes are not included.

The downloaded file depends on the choice:

| Choice                   | File                                               | Opens again with           |
| ------------------------ | -------------------------------------------------- | -------------------------- |
| Annotations              | the AnnotationPage                                 | `setAnnotations(page.items)` |
| Contents                 | `{ "structures": [...] }`                          | `setStructures(file.structures)` |
| Annotations and contents | `{ "annotations": AnnotationPage, "structures": [...] }` | both                 |

To send without a file, call `editor.exportToHost(kinds)`, e.g.
`exportToHost(["annotations"])`. It fires the same events and returns
`{ annotations?, structures? }`. With no argument it sends every kind
`config.annotations.export` allows (default: both); that option also limits
what the download offers.

`page` is a W3C `AnnotationPage`, `partOf` the manifest. Persist it in the host:

```js
editor.addEventListener("exportAnnotationPage", async (event) => {
  const response = await fetch("/api/annotations", {
    method: "PUT",
    credentials: "same-origin",
    headers: { "Content-Type": "application/ld+json" },
    body: JSON.stringify(event.detail.page),
  });

  if (!response.ok) {
    showMessage("Annotations could not be saved.");
  }
});
```

Or save each annotation as it is made, with `annotationCreate`,
`annotationUpdate` and `annotationDelete`.

## Settings

| Event         | Payload     | Purpose                                                                                                |
| ------------- | ----------- | ------------------------------------------------------------------------------------------------------ |
| `themeChange` | `{ theme }` | The user picked a viewer colour. The choice is remembered in the browser and wins over `config.theme`. |

## Navigation events

For images, `manifestChange`, `pageChange`, `mediaChange`, `zoomChange` and
`viewBoxChange` come from the embedded viewer, and can also be subscribed to with
`editor.on(name, handler)`; see the
[viewer's event reference](https://github.com/Mango-IIIF/Mango/wiki/Event-Handling).
Audio and video have no embedded viewer.
