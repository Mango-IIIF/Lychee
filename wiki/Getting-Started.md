# Getting started

## On a web page

```html
<script
  type="module"
  src="https://unpkg.com/@mango-iiif/lychee/src/dist/mango-annotation-editor.js"
></script>

<mango-annotation-editor
  manifest-id="https://iiif.io/api/cookbook/recipe/0005-image-service/manifest.json"
  config='{"theme":"light","annotations":{"languages":["en","cy"]}}'
></mango-annotation-editor>
```

| Attribute     | Value                                                                  |
| ------------- | ---------------------------------------------------------------------- |
| `manifest-id` | URL of a IIIF Presentation 2 or 3 manifest                             |
| `config`      | JSON: the viewer's config plus an `annotations` block (see the README) |
| `plugins`     | Viewer plugins for the image stage (set as a property, not in HTML)    |

The element is 720px tall, or the viewport height if that is smaller. Set a
different height with ordinary CSS or the custom property:

```css
mango-annotation-editor {
  --mango-viewer-height: 900px;
}
```

## In an application

```bash
npm install @mango-iiif/lychee @mango-iiif/iiif-viewer svelte
```

```js
import "@mango-iiif/lychee/element";
```

or, in Svelte:

```svelte
<script>
  import { AnnotationEditor } from "@mango-iiif/lychee";
  import "@mango-iiif/iiif-viewer/style.css";
  import "@mango-iiif/lychee/style.css";
</script>

<AnnotationEditor manifestId="https://example.org/iiif/manifest.json" />
```

## Editing

- **What is it about?** For images: an area or the whole image.
  "Draw a box" draws one rectangle; the toolbar on the stage has the other shapes
  and the smart tools. For recordings: a start time and an optional end, typed or
  taken from the player.
- **What would you like to do?** Note, Transcribe, Tag, Identify, Highlight or
  Link. Only the boxes that choice needs are shown.
- Text can be written in each configured language; the tabs mark the languages
  that already have text.
- Saved annotations appear under **Your annotations**, with Show or Jump, Edit and
  Delete, and in the list under the stage alongside the item's own.
- Several annotations can be made about one shape. Deleting the shape deletes
  them too.
