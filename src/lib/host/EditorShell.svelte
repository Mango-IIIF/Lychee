<script lang="ts">
  import { onMount, type Snippet } from 'svelte';
  import { Expand, Shrink } from '@lucide/svelte';
  import {
    createViewerFullscreenController,
    isIPadLikeDevice,
    resolveViewerTheme,
  } from '@mango-iiif/iiif-viewer/core';
  import '@mango-iiif/iiif-viewer/themes.css';
  import { t } from '../core/i18n';

  /**
   * The editor's frame: the themed root, the title row and the fullscreen
   * control. The canonical `--viewer-*` theme tokens come from Mango's
   * `@mango-iiif/iiif-viewer/themes.css`.
   */
  interface Props {
    theme?: string;
    root?: HTMLDivElement | null;
    title?: Snippet;
    actions?: Snippet;
    children?: Snippet;
  }

  let {
    theme = 'dark',
    root = $bindable(null),
    title = undefined,
    actions = undefined,
    children = undefined,
  }: Props = $props();

  let resolvedTheme = $derived(resolveViewerTheme(theme));
  let isFullscreen = $state(false);
  let isFullscreenFallback = $state(false);

  const getShadowHost = (): Element | null => {
    const node = root?.getRootNode();
    return node instanceof ShadowRoot ? node.host : null;
  };

  const fullscreen = createViewerFullscreenController({
    getRoot: () => root,
    getShadowHost,
    preferFallback: () => typeof navigator !== 'undefined' && isIPadLikeDevice(navigator),
    onChange: ({ active, fallback }) => {
      isFullscreen = active;
      isFullscreenFallback = fallback;
    },
  });

  onMount(() => fullscreen.attach());

  const TEXT_FIELD = 'input:not([type=button], [type=checkbox], [type=radio], [type=range]), textarea, select, [contenteditable]';

  /*
   * Keys typed into the editor's fields stay in the editor. RAMP listens for
   * hotkeys (f, k, m, space, arrows) on the document and skips them only when
   * `document.activeElement` is a field, but inside a shadow root that is the
   * host element, so it would swallow those letters. Stopped at the host, after
   * the editor's own handlers (Svelte's run on the shadow root). Escape and Tab still go out.
   */
  $effect(() => {
    void root;
    const host = getShadowHost();
    if (!host) return;
    const keepInField = (event: Event) => {
      const key = (event as KeyboardEvent).key;
      const target = event.composedPath()[0];
      if (key === 'Escape' || key === 'Tab') return;
      if (target instanceof Element && target.matches(TEXT_FIELD)) event.stopPropagation();
    };
    host.addEventListener('keydown', keepInField);
    return () => host.removeEventListener('keydown', keepInField);
  });
</script>

<div
  class="viewer viewer--annotation-editor"
  class:viewer--fullscreen-fallback={isFullscreenFallback}
  data-theme={resolvedTheme}
  aria-live="polite"
  bind:this={root}
>
  <div class="viewer__top-row">
    <div class="viewer__top-title">
      {@render title?.()}
    </div>

    <div class="viewer__top-actions">
      {@render actions?.()}

      <button
        type="button"
        class="viewer__fullscreen-btn viewer__fullscreen-btn--labelled"
        onclick={() => fullscreen.toggle()}
        aria-label={isFullscreen
          ? $t('viewer.stage.controls.closeFullscreen')
          : $t('viewer.stage.controls.enterFullscreen')}
        title={isFullscreen
          ? $t('viewer.stage.controls.closeFullscreen')
          : $t('viewer.stage.controls.enterFullscreen')}
      >
        {#if isFullscreen}
          <Shrink aria-hidden="true" />
        {:else}
          <Expand aria-hidden="true" />
        {/if}
        <span>
          {isFullscreen
            ? $t('viewer.stage.controls.closeFullscreen')
            : $t('viewer.stage.controls.fullscreen')}
        </span>
      </button>
    </div>
  </div>

  <div class="editor-shell__body">
    {@render children?.()}
  </div>
</div>

<style>
  .viewer__top-row {
    display: flex;
    align-items: center;
    min-width: 0;
    gap: 12px;
  }

  .viewer__top-title {
    display: flex;
    align-items: center;
    gap: 10px;
    flex: 1 1 auto;
    min-width: 0;
  }

  .viewer__top-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    flex: 0 0 auto;
    gap: 8px;
  }

  .viewer__fullscreen-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    border: 1px solid var(--viewer-panel-border);
    border-radius: var(--viewer-control-radius, 6px);
    background: var(--viewer-panel);
    color: var(--viewer-text);
    width: 30px;
    height: 30px;
    cursor: pointer;
    z-index: 10;
    line-height: 1;
    font-size: 14px;
  }

  .viewer__fullscreen-btn--labelled {
    width: auto;
    padding-inline: 8px;
    border-color: transparent;
    background: transparent;
    font-size: 12px;
  }

  .viewer__fullscreen-btn :global(svg) {
    width: 15px;
    height: 15px;
  }

  .editor-shell__body {
    position: relative;
    display: grid;
    grid-template-rows: minmax(0, 1fr);
    height: 100%;
    min-height: 0;
    overflow: hidden;
  }

  .viewer {
    display: grid;
    grid-template-rows: auto 1fr;
    gap: 10px;
    box-sizing: border-box;
    height: 100%;
    max-height: none;
    min-height: 0;
    overflow: hidden;
    padding: 12px;
    border-width: 1px;
    border-style: solid;
    border-radius: var(--viewer-chrome-radius);
    font-family: sans-serif;
    /* Shadow DOM blocks selector leakage, but inherited text properties still
       cross the host boundary. Keep host typography and bidi choices from
       silently rewriting viewer labels or rearranging time values. */
    font-style: normal;
    font-variant: normal;
    font-size: 16px;
    font-weight: 400;
    line-height: normal;
    letter-spacing: normal;
    word-spacing: normal;
    word-break: normal;
    overflow-wrap: normal;
    white-space: normal;
    text-align: left;
    text-indent: 0;
    text-transform: none;
    direction: var(--mango-viewer-direction, ltr);
    box-shadow: var(--viewer-frame-shadow, none);
    container-type: size;
    container-name: mango-viewer;
    position: relative;
  }

  .viewer:fullscreen {
    width: 100vw;
    height: 100vh;
    max-height: 100vh;
    min-height: 0;
    border-radius: 0;
    overscroll-behavior: none;
    touch-action: auto;
  }

  /* The header keeps the shell's inset; the sidebar and stage below it run to
     the shell's edges. */
  .viewer {
    padding-inline: 0;
    padding-bottom: 0;
  }

  .viewer > .viewer__top-row {
    padding-inline: 16px;
  }
  .viewer:-webkit-full-screen {
    width: 100vw;
    height: 100vh;
    max-height: 100vh;
    min-height: 0;
    border-radius: 0;
    overscroll-behavior: none;
    touch-action: auto;
  }

  .viewer.viewer--fullscreen-fallback {
    position: fixed;
    inset: 0;
    z-index: 2147483647;
    width: 100vw;
    height: 100vh;
    height: 100dvh;
    max-height: 100vh;
    max-height: 100dvh;
    min-height: 0;
    border: 0;
    border-radius: 0;
    overscroll-behavior: none;
    touch-action: auto;
  }

  .viewer:fullscreen .editor-shell__body {
    max-height: 100%;
  }

  .viewer:-webkit-full-screen .editor-shell__body {
    max-height: 100%;
  }

  .viewer.viewer--fullscreen-fallback .editor-shell__body {
    max-height: 100%;
  }

  .viewer:fullscreen::backdrop {
    background: #0b0f14;
  }

  @container mango-viewer (max-width: 1024px) {
    .viewer {
      min-height: 0;
      max-height: 100%;
      height: 100%;
      overflow: hidden;
      /* The stage runs to the shell's edges; only the header keeps an inset. */
      padding: 12px 0 0;
      border-radius: var(--viewer-chrome-radius);
      gap: 10px;
    }
  }

  @container mango-viewer (max-width: 700px) {
    /*
     * The editor carries a wide export action. The top row is nowrap with
     * non-shrinking actions, so on a phone the title collapsed to nothing and
     * the button sat on top of it. Give the actions their own line instead.
     */
    .viewer__top-row {
      flex-wrap: wrap;
      row-gap: 8px;
    }

    .viewer__top-actions {
      flex: 1 0 100%;
      justify-content: flex-start;
    }
  }
</style>
