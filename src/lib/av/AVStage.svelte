<script lang="ts">
  import { onDestroy } from 'svelte';
  import { t } from '../core/i18n';
  import { annotationText, bodiesOf, motivationsOf, targetSource } from '../annotations/model';
  import { canvasesOf, idOf, label } from '../annotations/iiif';
  import { formatTime, timeRange } from '../annotations/time';
  import type { Annotation } from '../annotations/types';
  import type { RampHandle, RampPlayback } from './ramp';

  /**
   * Audio and video: RAMP plays one canvas at a time, and the recording's own
   * transcript, chapters and annotations sit underneath it.
   */
  interface Props {
    manifest: Record<string, unknown>;
    kind: 'audio' | 'video';
    existing: Annotation[];
    canvasIndex?: number;
    playback?: RampPlayback;
    language?: string;
  }

  let {
    manifest,
    kind,
    existing,
    canvasIndex = $bindable(0),
    playback = $bindable({ time: 0, duration: 0, ready: false, playing: false, error: false }),
    language = 'en',
  }: Props = $props();

  let canvases = $derived(canvasesOf(manifest));
  let canvas = $derived(canvases[canvasIndex] ?? canvases[0]);
  let canvasId = $derived(idOf(canvas));
  let title = $derived(label(manifest.label, language));
  let cover = $derived(idOf((manifest.thumbnail as unknown[] | undefined)?.[0]));
  /* The video's shape, so its box can be sized to leave room for the controls. */
  let aspect = $derived(
    Number(canvas?.width) > 0 && Number(canvas?.height) > 0
      ? Number(canvas.width) / Number(canvas.height)
      : 16 / 9,
  );

  let host: HTMLDivElement | null = $state(null);
  let ramp: RampHandle | null = null;
  let loadError = $state('');

  /* RAMP gets the manifest with only the current canvas, so its own navigation can't drift from ours. */
  $effect(() => {
    const element = host;
    const current = canvas;
    if (!element || !current) return;
    const single = { ...manifest, items: [current], structures: [] };
    let cancelled = false;
    let handle: RampHandle | null = null;
    playback = { time: 0, duration: Number(current.duration) || 0, ready: false, playing: false, error: false };
    import('./ramp')
      .then(({ mountRamp }) => {
        if (cancelled) return;
        handle = mountRamp(element, single, Number(current.duration) || 0, (next) => (playback = next));
        ramp = handle;
      })
      .catch((error: unknown) => {
        if (!cancelled) loadError = String(error instanceof Error ? error.message : error);
      });
    return () => {
      cancelled = true;
      handle?.destroy();
      if (ramp === handle) ramp = null;
    };
  });

  onDestroy(() => ramp?.destroy());

  export const seek = (time: number): void => ramp?.seek(time);

  type Tab = 'transcript' | 'chapters' | 'annotations';
  let tab = $state<Tab>('transcript');
  let query = $state('');

  const onCanvas = (annotation: Annotation) => targetSource(annotation.target) === canvasId;
  /* Caption files are RAMP's to show; they have no text to list here. */
  const isCaptionFile = (annotation: Annotation) =>
    bodiesOf(annotation).some((body) => body.format === 'text/vtt');
  const isTranscript = (annotation: Annotation) =>
    motivationsOf(annotation).includes('supplementing') && Boolean(timeRange(annotation.target));

  let transcript = $derived(existing.filter((a) => onCanvas(a) && isTranscript(a) && !isCaptionFile(a)));
  let others = $derived(existing.filter((a) => onCanvas(a) && !isTranscript(a) && !isCaptionFile(a)));
  let rows = $derived(
    transcript.filter((a) => annotationText(a).toLowerCase().includes(query.trim().toLowerCase())),
  );

  type Range = { id?: string; label?: unknown; items?: Range[]; type?: string };
  let chapters = $derived(
    ((manifest.structures as Range[] | undefined) ?? [])
      .flatMap((range) => range.items ?? [])
      .filter((range) => range.type === 'Range'),
  );

  /* The passage being heard: the last one started, until the next begins or it ends. */
  let activeId = $derived.by(() => {
    let current: string | null = null;
    for (const annotation of rows) {
      const range = timeRange(annotation.target);
      if (!range || range.start > playback.time) continue;
      if (range.end == null || playback.time < range.end) current = annotation.id;
    }
    return current;
  });

  /* While playing, keep the passage being heard at the top of the transcript. Paused, leave it where the user scrolled. */
  let transcriptList: HTMLDivElement | null = $state(null);
  $effect(() => {
    const list = transcriptList;
    const id = activeId;
    if (!list || !id || !playback.playing) return;
    const row = list.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`);
    // The list is the rows' offset parent, so offsetTop is already within it.
    if (row) list.scrollTo({ top: row.offsetTop, behavior: 'smooth' });
  });
</script>

<div class="av-stage" data-kind={kind} style:--av-aspect={aspect}>
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

  <div class="av-stage__player">
    {#if kind === 'audio'}
      <div class="av-stage__cover">
        {#if cover}<img src={cover} alt="" />{/if}
        <div>
          <span class="av-stage__eyebrow">{$t('annotate.av.recordingKind')}</span>
          <h2>{title}</h2>
        </div>
      </div>
    {/if}
    <div class="av-stage__ramp" bind:this={host}></div>
  </div>

  <p class="av-stage__status">
    {$t('annotate.av.position')} <strong>{formatTime(playback.time)}</strong>
    <span>/ {formatTime(playback.duration)}</span>
  </p>
  {#if playback.error || loadError}
    <p class="av-stage__error" role="alert">{$t('annotate.av.loadError')}</p>
  {/if}

  <div class="av-stage__tabs" role="group" aria-label={$t('annotate.av.details')}>
    {#each ['transcript', 'chapters', 'annotations'] as const as name (name)}
      <button type="button" aria-pressed={tab === name} onclick={() => (tab = name)}>
        {$t(`annotate.av.tabs.${name}`)}
      </button>
    {/each}
  </div>

  <div class="av-stage__details">
    {#if tab === 'transcript'}
      <label class="av-stage__search">
        {$t('annotate.av.findInTranscript')}
        <input type="search" bind:value={query} />
      </label>
      <div class="av-stage__list" bind:this={transcriptList}>
        {#each rows as annotation (annotation.id)}
          {@const range = timeRange(annotation.target)}
          <button
            type="button"
            data-id={annotation.id}
            class:active={annotation.id === activeId}
            aria-current={annotation.id === activeId ? 'true' : undefined}
            disabled={!range || !playback.ready}
            onclick={() => range && seek(range.start)}
          >
            <time>{formatTime(range?.start)}</time>
            <span>{annotationText(annotation)}</span>
          </button>
        {:else}
          <p>{$t('annotate.av.noTranscript')}</p>
        {/each}
      </div>
    {:else if tab === 'chapters'}
      <div class="av-stage__list">
        {#each chapters as chapter, index (chapter.id ?? index)}
          {@const range = timeRange(chapter.items?.[0])}
          <button type="button" disabled={!range || !playback.ready} onclick={() => range && seek(range.start)}>
            <time>{formatTime(range?.start)}</time>
            <span>{label(chapter.label, language)}</span>
          </button>
        {:else}
          <p>{$t('annotate.av.noChapters')}</p>
        {/each}
      </div>
    {:else}
      <div class="av-stage__list">
        {#each others as annotation (annotation.id)}
          {@const range = timeRange(annotation.target)}
          <button type="button" disabled={!range || !playback.ready} onclick={() => range && seek(range.start)}>
            <time>{range ? formatTime(range.start) : '—'}</time>
            <span>{annotationText(annotation) || label(annotation.label, language)}</span>
          </button>
        {:else}
          <p>{$t('annotate.av.noAnnotations')}</p>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  /*
   * Player, status and tabs keep their size; the list below takes what is left
   * and scrolls on its own. Only when even that can't fit does the whole stage
   * scroll, so the player is never squashed and its controls never clipped.
   */
  .av-stage {
    display: flex;
    flex-direction: column;
    gap: 12px;
    height: 100%;
    min-height: 0;
    padding: 16px 20px;
    overflow: auto;
    box-sizing: border-box;
    color: var(--viewer-text);
    container-type: size;
  }

  .av-stage > :global(*) {
    flex-shrink: 0;
  }

  .av-stage__select,
  .av-stage__search {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 13px;
    font-weight: 600;
  }

  select,
  input {
    height: 36px;
    padding: 0 10px;
    border: 1px solid var(--viewer-panel-border);
    border-radius: 6px;
    background: var(--viewer-well-bg);
    color: inherit;
    font: inherit;
    font-weight: 400;
  }

  .av-stage__player {
    width: 100%;
    overflow: hidden;
    border-radius: 10px;
    background: #000;
  }

  .av-stage[data-kind='audio'] .av-stage__player {
    background: var(--viewer-panel);
  }

  /* Video a little under full width, centred, so the transcript gets more room. */
  .av-stage[data-kind='video'] .av-stage__player {
    align-self: center;
    width: 80%;
  }

  /* On a narrow stage it needs the full width for its controls. */
  @container (max-width: 560px) {
    .av-stage[data-kind='video'] .av-stage__player {
      width: 100%;
    }
  }

  /*
   * RAMP's theme fixes its player at 490 x 270px at least, wider than a phone or
   * a narrow stage, so the control bar runs off the edge. Let it follow the box.
   */
  .av-stage__ramp :global(.video-js.vjs-theme-ramp) {
    min-width: 0;
    min-height: 0;
  }

  .av-stage__ramp :global(.video-js.vjs-theme-ramp.vjs-audio-only-mode) {
    min-height: 40px;
  }

  /*
   * Video.js sizes a fluid player with a rule it adds to the document head,
   * which doesn't reach into the editor's shadow root. Give it the video's shape.
   */
  .av-stage[data-kind='video'] .av-stage__ramp :global(.video-js.vjs-fluid) {
    height: auto;
    padding-top: 0;
    aspect-ratio: var(--av-aspect);
  }

  /* Narrow: drop the controls least needed there, so the rest fit on one row. */
  @container (max-width: 480px) {
    .av-stage__ramp :global(.vjs-picture-in-picture-control),
    .av-stage__ramp :global(.vjs-volume-panel) {
      display: none;
    }
  }

  .av-stage__cover {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 16px;
  }

  .av-stage__cover img {
    width: 96px;
    height: 96px;
    border-radius: 8px;
    object-fit: cover;
  }

  .av-stage__cover h2 {
    margin: 4px 0 0;
    font-family: Georgia, 'Times New Roman', serif;
    font-size: 22px;
    font-weight: 400;
  }

  .av-stage__eyebrow {
    color: var(--viewer-muted);
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .av-stage__status {
    margin: 0;
    font-size: 14px;
  }

  .av-stage__status span {
    color: var(--viewer-muted);
  }

  .av-stage__error {
    margin: 0;
    color: var(--viewer-danger);
    font-size: 14px;
  }

  .av-stage__tabs {
    display: flex;
    gap: 4px;
    padding: 4px;
    border-radius: 8px;
    background: var(--viewer-well-bg);
  }

  .av-stage__tabs button {
    flex: 1;
    height: 34px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--viewer-muted);
    font: inherit;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
  }

  .av-stage__tabs button[aria-pressed='true'] {
    background: var(--viewer-panel-strong);
    color: var(--viewer-text);
  }

  .av-stage__details {
    display: flex;
    flex: 1 0 200px;
    flex-direction: column;
    gap: 10px;
    min-height: 0;
  }

  .av-stage__list {
    display: flex;
    position: relative;
    flex: 1 1 0;
    flex-direction: column;
    gap: 2px;
    min-height: 120px;
    overflow: auto;
  }

  .av-stage__list button {
    display: grid;
    grid-template-columns: 72px 1fr;
    gap: 10px;
    padding: 8px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: 14px;
    line-height: 1.45;
    text-align: left;
    cursor: pointer;
  }

  .av-stage__list button:hover:not(:disabled) {
    background: var(--viewer-well-bg);
  }

  .av-stage__list button.active {
    background: var(--anno-tint);
  }

  .av-stage__list button.active time {
    color: var(--anno-accent);
    font-weight: 600;
  }

  .av-stage__list button:disabled {
    cursor: default;
  }

  .av-stage__list time {
    color: var(--viewer-muted);
    font-variant-numeric: tabular-nums;
  }

  .av-stage__list p {
    margin: 0;
    color: var(--viewer-muted);
    font-size: 14px;
  }
</style>
