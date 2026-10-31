# W3C and IIIF support

## Reading

The editor fetches the AnnotationPages a manifest and its canvases reference (or
embed) and shows them read-only:

- on images, shapes Annotorious can parse — `xywh` fragments and SVG selectors —
  are drawn in grey;
- on recordings, supplementing annotations with a time range form the transcript,
  and the rest are listed with Jump;
- all of them appear in the annotation list.

Caption files (`text/vtt` bodies) are left to RAMP. The manifest is never changed.

## Writing

Each annotation has one motivation, set by what the user chose to do:
`commenting`, `supplementing`, `tagging`, `identifying`, `highlighting` or
`linking`. Text is written as one `TextualBody` per language, with `language`
set; a note's title is the annotation's IIIF `label` language map. Suggestions
from AI keep the model as the body's `generator`.

Targets are canvas coordinates, scaled from the image when the painted image and
the canvas differ in size. A host annotation added with `addAnnotation` is read
back the same way: a time range, a shape, a canvas or the manifest.

New annotations carry `urn:uuid:` identifiers until the host assigns HTTP(S)
ones. The export reports which are still unresolved, and `publicationValid`
stays false until there are none.

## What Mango does not do

Mango does not provide an annotation server. The host application must
authenticate, authorise, convert where necessary, and persist what the editor
exports.

Motivations other than the six above are read as the nearest intent when edited
(`describing` as a note, `transcribing` as a transcription, …) and are written
back with the intent's motivation. Test multiple bodies, custom purposes,
selectors and extension properties before using the editor on them.
