<script lang="ts">
  import { ImageOff } from '@lucide/svelte';
  import { t } from '../core/i18n';

  /**
   * A strip of page thumbnails under the stage. Mango draws its own gallery only
   * with its chrome on, and the editor runs the viewer without it.
   */
  interface Props {
    pages: { id: string; label: string; thumbnail: string | null }[];
    selectedIndex: number;
    /** Pages with at least one of the user's annotations. */
    annotatedIds: Set<string>;
    onselect: (index: number) => void;
  }

  let { pages, selectedIndex, annotatedIds, onselect }: Props = $props();

  let buttons: HTMLButtonElement[] = $state([]);

  /* Keep the current page in view as it changes, without moving the page itself. */
  $effect(() => {
    buttons[selectedIndex]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });

  const onkeydown = (event: KeyboardEvent, index: number) => {
    const next = event.key === 'ArrowRight' ? index + 1 : event.key === 'ArrowLeft' ? index - 1 : -1;
    if (next < 0 || next >= pages.length) return;
    event.preventDefault();
    buttons[next]?.focus();
  };
</script>

<nav class="gallery-strip" aria-label={$t('annotate.gallery.label')}>
  {#each pages as page, index (page.id)}
    <button
      type="button"
      bind:this={buttons[index]}
      class:active={index === selectedIndex}
      aria-current={index === selectedIndex ? 'page' : undefined}
      aria-label={$t('annotate.gallery.page', { n: index + 1, label: page.label })}
      title={page.label}
      onclick={() => onselect(index)}
      onkeydown={(event) => onkeydown(event, index)}
    >
      {#if page.thumbnail}
        <img src={page.thumbnail} alt="" loading="lazy" />
      {:else}
        <ImageOff size={20} aria-hidden="true" />
      {/if}
      <span class="gallery-strip__n">{index + 1}</span>
      {#if annotatedIds.has(page.id)}
        <span class="gallery-strip__dot" title={$t('annotate.gallery.annotated')}></span>
      {/if}
    </button>
  {/each}
</nav>

<style>
  .gallery-strip {
    display: flex;
    gap: 8px;
    padding: 8px 12px;
    overflow-x: auto;
    border-top: 1px solid var(--viewer-panel-border);
    background: var(--anno-surface);
    scrollbar-width: thin;
  }

  button {
    position: relative;
    display: grid;
    flex: 0 0 auto;
    place-items: center;
    width: 64px;
    height: 80px;
    padding: 0;
    overflow: hidden;
    border: 2px solid transparent;
    border-radius: 6px;
    background: var(--viewer-well-bg);
    color: var(--viewer-muted);
    cursor: pointer;
  }

  button:hover {
    border-color: var(--viewer-panel-border);
  }

  button.active {
    border-color: var(--anno-accent);
  }

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .gallery-strip__n {
    position: absolute;
    right: 3px;
    bottom: 3px;
    padding: 0 4px;
    border-radius: 3px;
    background: rgba(0, 0, 0, 0.6);
    color: #fff;
    font-size: 10px;
    line-height: 16px;
  }

  .gallery-strip__dot {
    position: absolute;
    top: 4px;
    right: 4px;
    width: 9px;
    height: 9px;
    border: 1px solid #fff;
    border-radius: 50%;
    background: #f59e0b;
  }
</style>
