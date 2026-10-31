# PCW 574604 — Danny Frisby, British Army Veteran

Open [the local video view](http://localhost:5173/?item=pcw-574604) or [the IIIF manifest](http://localhost:5173/iiif-pcw-574604/manifest.json).

The video is streamed directly from the public Mux HLS playback URL embedded on [the original PCW item](https://www.peoplescollection.wales/items/574604). No Mux API key is required for this public playback ID. The manifest uses the stable stream.mux.com URL, not expiring CDN segment links. The stream's video duration is 846.64 seconds (14:06.64), with a 1280×720 rendition.

Copyright: Veteran Films. PCW lists the Creative Archive Licence, creator/owner Veteran Films, uploader Veterans Digital & Oral History Project and upload date 26 April 2017. The recording date was not established. The source content advisory is carried into the manifest and interface.

## Editorial status

- English transcript: 146 detected-speech segments, generated locally with faster-whisper 1.2.1, base.en, int8 CPU. **Unreviewed**, with recognition errors and approximate timings. No speaker diarisation or verification was performed. Music, silence, on-screen titles and closing credits are not described.
- Chapters: eight **suggested** semantic divisions based on that draft transcript. These are new additions, not chapters supplied by PCW.
- Annotations: nine **suggested** tags/links. Timed relevance and text associations need review. British Army, Bosnia and Herzegovina, United Nations, Northern Ireland and Wales link to Wikidata identities checked on 19 October 2026. Danny Frisby and the PCW source link apply to the whole item and are catalogue-level descriptions, not word-level annotations.
- English WebVTT is linked as a supplementing annotation for player captions and as a downloadable rendering. Timed TextualBody transcript annotations are provided separately.

See provenance.json for details. Suggested does not mean verified historical evidence.

## Files and hosting

manifest.json, transcript-en.vtt, transcript-en-annotations.json, annotations.json and provenance.json are served together. Both the dev server and production build include this directory.

IDs currently use http://localhost:5173/iiif-pcw-574604. Rebase before publishing:

```sh
python3 scripts/build-pcw-manifest.py --base-url https://YOUR-HOST/iiif-pcw-574604
```

This rebuild uses the ignored .tools/pcw/asr-draft.json when available, or the included timed transcript when the ASR cache is absent. Edit/review the transcript and generator inputs before publishing corrections; rerunning the generator overwrites these generated JSON/VTT files.

To regenerate the ASR draft, create a Python virtual environment, install scripts/requirements-transcription.txt and run scripts/transcribe-pcw.py. Model weights and the temporary audio download stay under ignored .tools/. The ASR runs locally; no audio is sent to a transcription service. Model downloads require network access. This environment needs the existing HTTP proxy also set as HTTPS_PROXY; localhost must be in NO_PROXY.

The local app supports this dataset with ?item=pcw-574604 and retains the fictional coalfield demonstration at /. A deployment on another host must rebase manifest IDs. Signed/private Mux playback would need a separate server-side token flow.
