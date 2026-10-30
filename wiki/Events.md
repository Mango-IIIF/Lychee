# Events

Every event is dispatched on `<mango-annotation-editor>` as a DOM
`CustomEvent`, with the payload in `event.detail`. The same viewer events can be
subscribed to with `editor.on(name, handler)`, which returns an unsubscribe
function.

## Export events

| Event                  | Payload                                                                                                                  | Purpose                                                            |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `exportAnnotationPage` | `page`, `draftValid`, `publicationValid`, `valid`, `excludedPrivateFields`, `unresolvedIdentities`, `unresolvedPageIdentity` | The user asked to export. `page` is a W3C `AnnotationPage`.         |
| `exportAnnotations`    | `{ annotations: ResolvedAnnotation[] }`                                                                                  | Deprecated: the same export as resolved annotations, not JSON-LD.  |

Persist the export in the host application:

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

## Annotation events

These come from the embedded viewer, which holds the annotations.

| Event               | Payload                                               | Purpose                                            |
| ------------------- | ----------------------------------------------------- | -------------------------------------------------- |
| `annotationsChange` | `{ annotations: ResolvedAnnotation[] }`               | The current canvas's annotations changed.          |
| `annotationCreate`  | `{ annotation: unknown }`                             | An annotation was added, including a saved draft.  |
| `annotationUpdate`  | `{ annotationId, patch }`                             | An annotation was edited.                          |
| `annotationSave`    | `{ annotationId, annotation }`                        | Edits to an annotation were committed as one save. |
| `annotationDelete`  | `{ annotationId: string }`                            | An annotation was deleted.                         |

`addAnnotation` and `removeAnnotation` fire alongside `annotationCreate` and
`annotationDelete` for compatibility; prefer the `annotation…` family.
| `annotationSelect`  | `id`, optional `annotation`, optional `preventZoom`   | An annotation was selected.                        |
| `annotationClear`   | `void`                                                | The selection was cleared.                         |

## Navigation events

`manifestChange`, `pageChange`, `mediaChange`, `zoomChange` and
`viewBoxChange` are the viewer's own; see the
[viewer's event reference](https://github.com/Mango-IIIF/Mango/wiki/Event-Handling).
