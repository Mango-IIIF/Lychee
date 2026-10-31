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

## Export

| Event                  | Payload                                                                      |
| ---------------------- | ---------------------------------------------------------------------------- |
| `exportAnnotationPage` | `page`, `publicationValid`, `unresolvedIdentities`, `unresolvedPageIdentity` |

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
