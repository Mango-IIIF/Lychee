<script lang="ts" module>
  export interface AVPlayback {
    time: number;
    duration: number;
    /** A player is attached, so it can be seeked. Streams may not load metadata until played. */
    ready: boolean;
    /** Playing now, as opposed to paused or ended. */
    playing: boolean;
    error: boolean;
  }
</script>

<script lang="ts">
  import type { AVPlayerConfig, AVPlayerState, MangoAVMediaElement } from '@mango-iiif/av';
  import { t } from '../core/i18n';
  import { canvasesOf, idOf, label } from '../annotations/iiif';
  import { loadAVMedia } from './elements';

  /**
   * Audio and video: @mango-iiif/av's player (RAMP) plays one canvas at a time,
   * and the recording's own transcript sits underneath it. Annotations are in the
   * editor's list and chapters in its Contents tab, so the player leaves those tabs out.
   */
  interface Props {
    manifest: Record<string, unknown>;
    canvasIndex?: number;
    playback?: AVPlayback;
    language?: string;
    /** The player's own Chapters tab. Off where the editor's Contents tab has the chapters. */
    chapters?: boolean;
  }

  let {
    manifest,
    canvasIndex = $bindable(0),
    playback = $bindable({ time: 0, duration: 0, ready: false, playing: false, error: false }),
    language = 'en',
    chapters = true,
  }: Props = $props();

  let canvases = $derived(canvasesOf(manifest));

  let media: MangoAVMediaElement | null = $state(null);
  /* The element is defined on first use, so image-only pages never load it. */
  let tag = $state('');
  let loadError = $state('');

  $effect(() => {
    loadAVMedia()
      .then((name) => (tag = name))
      .catch((error: unknown) => (loadError = String(error instanceof Error ? error.message : error)));
  });

  /* The editor's list under the player has the annotations, so the player's own tab is left out. */
  let config: AVPlayerConfig = $derived({
    panels: { transcript: true, chapters, annotations: false, metadata: false, supplementalFiles: false },
    controls: { playbackRate: true, pictureInPicture: true, download: false },
    activePanel: 'transcript',
    preferredLanguages: [language, 'none'],
    strings: {
      transcript: $t('annotate.av.tabs.transcript'),
      chapters: $t('annotate.av.tabs.chapters'),
      annotations: $t('annotate.av.tabs.annotations'),
      mediaInformation: $t('annotate.av.details'),
      searchTranscript: $t('annotate.av.findInTranscript'),
      position: $t('annotate.av.position'),
      recording: $t('annotate.av.recordingKind'),
      noTranscript: $t('annotate.av.noTranscript'),
      noChapters: $t('annotate.av.noChapters'),
      noAnnotations: $t('annotate.av.noAnnotations'),
    },
  });

  $effect(() => {
    if (tag && media) media.config = config;
  });

  $effect(() => {
    const element = media;
    const json = manifest;
    if (!tag || !element) return;
    playback = { time: 0, duration: 0, ready: false, playing: false, error: false };
    element.manifest = $state.snapshot(json) as Record<string, unknown>;
  });

  const onState = (state: AVPlayerState) => {
    const controller = media?.controller;
    playback = {
      time: state.currentTime,
      duration: state.duration || Number(canvases[state.canvasIndex]?.duration) || 0,
      ready: Boolean(controller?.media) && state.status !== 'error',
      playing: state.status === 'playing',
      error: state.status === 'error',
    };
    if (state.manifest && state.canvasIndex !== canvasIndex) canvasIndex = state.canvasIndex;
  };

  $effect(() => {
    const controller = tag ? media?.controller : undefined;
    if (!controller) return;
    return controller.on('av-statechange', ({ detail }) => onState(detail));
  });

  /* Our recording picker drives the player. */
  $effect(() => {
    const index = canvasIndex;
    const controller = tag ? media?.controller : undefined;
    if (controller?.manifest && controller.state.canvasIndex !== index) controller.selectCanvas(index);
  });

  export const seek = (time: number): void => media?.controller.seekTo(time);
</script>

<div class="av-stage">
  {#if tag}
    <svelte:element this={tag} class="av-stage__media" bind:this={media}>
      <div slot="header">
        {#if canvases.length > 1}
          <label class="av-stage__select">
            {$t('annotate.av.recording')}
            <select bind:value={canvasIndex}>
              {#each canvases as entry, index (idOf(entry))}
                <option value={index}>{label(entry.label, language) || $t('annotate.av.recordingN', { n: index + 1 })}</option>
              {/each}
            </select>
          </label>
        {/if}
      </div>
      {#if playback.error}
        <p slot="after-player" class="av-stage__error" role="alert">{$t('annotate.av.loadError')}</p>
      {/if}
    </svelte:element>
  {/if}
  {#if loadError}
    <p class="av-stage__error" role="alert">{$t('annotate.av.loadError')}</p>
  {/if}
</div>

<style>
  .av-stage {
    height: 100%;
    min-height: 0;
    padding: 16px 20px;
    overflow: auto;
    box-sizing: border-box;
    color: var(--viewer-text);
  }

  /* The player and its panels follow the editor's theme. Set on the element, past its own :host defaults. */
  .av-stage__media {
    --mango-av-accent: var(--anno-accent);
    --mango-av-accent-contrast: var(--anno-on-accent);
    --mango-av-accent-tint: var(--anno-tint);
    --mango-av-background: var(--anno-surface);
    --mango-av-surface: var(--viewer-well-bg);
    --mango-av-text: var(--viewer-text);
    --mango-av-muted: var(--viewer-muted);
    --mango-av-border: var(--viewer-panel-border);
    --mango-av-danger: var(--viewer-danger);
    --mango-av-font: inherit;

    display: block;
  }

  .av-stage__select {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 12px;
    font-size: 13px;
    font-weight: 600;
  }

  select {
    height: 36px;
    padding: 0 10px;
    border: 1px solid var(--viewer-panel-border);
    border-radius: 6px;
    background: var(--viewer-well-bg);
    color: inherit;
    font: inherit;
    font-weight: 400;
  }

  .av-stage__error {
    margin: 12px 0 0;
    color: var(--viewer-danger);
    font-size: 14px;
  }
</style>
