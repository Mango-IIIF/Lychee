# W3C and IIIF support

## Reading

The editor shows the annotations the viewer resolves from the manifest and lets
people edit them alongside their own. That includes:

- Canvas targets and `SpecificResource` targets;
- spatial `xywh` fragments;
- points and SVG polygons;
- text and image bodies, including parallel `TextualBody` translations; and
- external AnnotationPages referenced from a Canvas.

Editing a manifest annotation copies it into the user's own set; the manifest
itself is never changed.

## Writing

Exports are W3C Web Annotation `AnnotationPage` documents:

- the motivation is `commenting` unless the author picks another; `painting` is
  only offered in expert mode, because it tells IIIF clients the annotation is
  the canvas content;
- layer colours are written as a `styleClass` plus an annotation stylesheet,
  which survives a round trip, rather than an inline style, which does not;
- new annotations carry local draft identifiers until the host assigns HTTP(S)
  ones. The export reports which identifiers are still unresolved, and
  `publicationValid` stays false until there are none.

## What Mango does not do

Mango does not provide an annotation server. The host application must
authenticate, authorise, convert where necessary, and persist what the editor
exports.

Do not assume arbitrary Web Annotation graphs round-trip without loss. Test
multiple bodies, custom motivations and purposes, selectors, stylesheets, and
extension properties before using the editor on them.
