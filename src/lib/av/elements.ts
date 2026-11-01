/*
 * @mango-iiif/iiif-viewer bundles an older @mango-iiif/av, which registers some
 * of the same tags (mango-av-chapters, mango-av-transcript) as soon as the
 * viewer loads. Whichever copy defines a tag first owns it, so the panels inside
 * our player would be the old ones. Ours take their own tags wherever a default
 * already belongs to the other copy.
 */

const PREFIX = 'mango-annotate-av';

/** Defines the media element and its parts; resolves to the tag to render. */
export const loadAVMedia = async (): Promise<string> => {
  const [media, player, chapters, transcript, annotations, captions] = await Promise.all([
    import('@mango-iiif/av/media'),
    import('@mango-iiif/av/player'),
    import('@mango-iiif/av/chapters'),
    import('@mango-iiif/av/transcript'),
    import('@mango-iiif/av/annotations'),
    import('@mango-iiif/av/captions'),
  ]);
  // Each is a no-op for an element that already got its default tag.
  player.defineMangoAVPlayer(`${PREFIX}-player`);
  chapters.defineMangoAVChapters(`${PREFIX}-chapters`);
  transcript.defineMangoAVTranscript(`${PREFIX}-transcript`);
  annotations.defineMangoAVAnnotations(`${PREFIX}-annotations`);
  captions.defineMangoAVCaptions(`${PREFIX}-captions`);

  if (customElements.get('mango-av-media') === media.MangoAVMediaElement) return 'mango-av-media';
  media.defineMangoAVMedia(`${PREFIX}-media`);
  return `${PREFIX}-media`;
};
