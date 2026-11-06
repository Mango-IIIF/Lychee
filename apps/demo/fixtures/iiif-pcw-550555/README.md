# Margaret Young — Voices from the Factory Floor (PCW 550555)

Open [the viewer](http://localhost:5173/?item=pcw-550555), [the manifest](http://localhost:5173/iiif-pcw-550555/manifest.json), or the [readable transcript](http://localhost:5173/iiif-pcw-550555/transcript-en.txt).

The original [PCW interview](https://www.peoplescollection.wales/items/550555) is a 54:42 MP3. It is played from PCW's existing audio URL. This item does not use Mux.

The cover uses exactly the image URL requested by the user. Its [catalogue record](https://www.peoplescollection.wales/items/550561) describes a Corgi Hosiery factory photograph from the early 1950s, credits copyright/ownership to Margaret Young and identifies the photographer as unknown. Both that photo and the recording are listed under the Creative Archive Licence. Recording copyright is Women's Archive Wales 2014.

The [original project notes](https://www.lleisiaumenywodffatri.cymru/uploads/VSW065.2.pdf), linked from [the PCW story](https://www.peoplescollection.wales/story/575525), provide the recording date (3 September 2014), interviewer (Catrin Stevens) and the timestamped index. They are detailed English notes, not a verbatim transcript. The catalogue says employment began in 1958; those notes say 1959. That discrepancy is recorded in provenance.json.

## Editorial status

The English transcript is generated locally with faster-whisper large-v3-turbo, using CPU int8 and batched inference. It is **unreviewed**. The initial small-model language detection was unreliable; the larger model identified English, consistent with the original English interview notes. Production transcription uses English explicitly. No translation is presented.

A small set of name/place spellings is normalised using the original project notes; the mappings and counts are recorded in provenance.json. This does not constitute full checking against the audio. No speaker diarisation is performed, so passages can contain both interviewer and interviewee speech.

The 14 chapter start times come from the original notes. Their concise labels are adapted for browsing and still need alignment review. The 18 annotations include timed text tags and Wikidata links for knitwear and Ammanford/Rhydaman. Broad subject ranges follow the original index and should not be treated as word-level mentions. Recording-wide catalogue tags and links appear in the Annotations/Explore tabs and are omitted from inline transcript badges.

## Resources

- manifest.json — IIIF Presentation 3 audio manifest, with the cover as thumbnail and accompanying/placeholder image Canvas.
- transcript-annotations.json — timed supplementing TextualBody annotations.
- transcript-en.vtt — machine-generated timed transcript.
- transcript-en.txt — readable transcript with timecodes.
- annotations.json — suggested subject tags and links, credited to fictional demo users (`Person` creators at peoplescollection.wales, user 4567 being the demo's signed-in Jane Jones); the software that drafted them is their `generator`.
- enrichment.json — editable chapter titles/start times, annotation mappings and spelling normalisations.
- provenance.json — sources, duration, language, model and review status.

## Rebuilding and hosting

To regenerate transcription, install scripts/requirements-transcription.txt in a Python virtual environment and run scripts/transcribe-pcw-550555.py. Models and temporary audio stay under ignored .tools/. Transcription runs locally. The script checkpoints progress and resumes from the last completed segment.

Then regenerate the manifest resources:

```sh
python3 scripts/build-pcw-550555-manifest.py
```

The generator uses cached raw ASR when available and the included transcript otherwise. It writes generated files, so apply editorial corrections to your retained source data before rebuilding. The cover and chapter/annotation configuration remain in enrichment.json.

For another origin, use:

```sh
python3 scripts/build-pcw-550555-manifest.py --base-url https://YOUR-HOST/iiif-pcw-550555
```

Serve the files together with suitable JSON/VTT MIME types and CORS headers if needed. npm run build includes this directory. The original coalfield demo and PCW video remain available in the item switcher.
