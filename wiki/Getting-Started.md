# Getting started

## On a web page

```html
<script type="module" src="https://unpkg.com/@mango-iiif/annotate/src/dist/mango-annotation-editor.js"></script>

<mango-annotation-editor
  manifest-id="https://iiif.io/api/cookbook/recipe/0005-image-service/manifest.json"
  config='{"annotations":{"languages":["en","cy"]}}'
></mango-annotation-editor>
```

| Attribute     | Value                                                         |
| ------------- | ------------------------------------------------------------- |
| `manifest-id` | URL of a IIIF Presentation 2 or 3 manifest                    |
| `config`      | JSON: the viewer's config plus an `annotations` block         |
| `plugins`     | Viewer plugins for the stage (set as a property, not in HTML) |

The element is 720px tall, or the viewport height if that is smaller. Set a
different height with ordinary CSS or the custom property:

```css
mango-annotation-editor {
  --mango-viewer-height: 900px;
}
```

When the annotation list is open the element grows by 230px so the list has a
box of its own rather than taking height off the canvas.

## In an application

```bash
npm install @mango-iiif/annotate @mango-iiif/iiif-viewer svelte
```

```js
import "@mango-iiif/annotate/element";
```

or, in Svelte:

```svelte
<script>
  import { AnnotationEditor } from "@mango-iiif/annotate";
  import "@mango-iiif/iiif-viewer/style.css";
  import "@mango-iiif/annotate/style.css";
</script>

<AnnotationEditor manifestId="https://example.org/iiif/manifest.json" />
```

## Editing

- Pick a tool on the left — Rectangle, Point, Polygon, Freehand or Line — and
  draw on the canvas. Rectangle and Point can also be created at the centre of
  the current view from the keyboard.
- A new shape is a draft until **Save Annotation**. **Cancel** discards a draft,
  or restores an existing annotation to how it was before editing began.
- Undo and redo are on the toolbar and on Ctrl/Cmd+Z and Shift+Ctrl/Cmd+Z, when
  focus is not in a text field.
- Leaving an unsaved edit — selecting another annotation or turning the page —
  asks before discarding it.
- Layers group annotations by colour. Hiding a layer takes its annotations off
  the canvas but leaves them in the list, so they can still be found and moved.
