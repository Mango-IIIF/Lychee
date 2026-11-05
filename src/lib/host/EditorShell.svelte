<script lang="ts">
  import { onMount, type Snippet } from 'svelte';
  import { Expand, Shrink } from '@lucide/svelte';
  import { createViewerFullscreenController, isIPadLikeDevice } from '@mango-iiif/iiif-viewer/core';
  import { t } from '../core/i18n';
  import { isTheme } from './themes';

  /**
   * The editor's frame: the themed root, the title row and the fullscreen
   * control. The palette lives here because the editor chrome sits outside the
   * embedded viewer, so it cannot inherit the viewer's own tokens.
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

  let resolvedTheme = $derived(isTheme(theme?.toLowerCase()) ? theme.toLowerCase() : 'dark');
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
    align-items: flex-start;
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
    gap: 10px;
  }

  .viewer__fullscreen-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    border: 1px solid var(--viewer-panel-border);
    border-radius: var(--viewer-chrome-radius);
    background: var(--viewer-panel);
    color: var(--viewer-text);
    width: 34px;
    height: 34px;
    cursor: pointer;
    z-index: 10;
    line-height: 1;
    font-size: 16px;
  }

  .viewer__fullscreen-btn--labelled {
    width: auto;
    padding-inline: 10px;
    border-color: transparent;
    background: transparent;
    font-size: 13px;
  }

  .viewer__fullscreen-btn :global(svg) {
    width: 18px;
    height: 18px;
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
    --viewer-bg: #0f141b;
    --viewer-surface: #151d26;
    --viewer-panel: #121922;
    --viewer-panel-strong: #1b242e;
    --viewer-panel-border: rgba(255, 255, 255, 0.08);
    --viewer-text: #e8edf4;
    --viewer-muted: #9aa6b2;
    --viewer-accent: #ff4fa2;
    --viewer-accent-2: #2ac7ff;
    --viewer-accent-tools: #a3e635;
    --viewer-stage: #111720;
    --viewer-stage-glow: rgba(42, 199, 255, 0.12);
    --viewer-stage-tail: #0b0f14;
    --viewer-dock-button-bg: rgba(15, 20, 27, 0.95);
    --viewer-dock-button-border: rgba(255, 255, 255, 0.12);
    --viewer-dock-tooltip-bg: rgba(10, 14, 19, 0.95);
    --viewer-dock-active-border: rgba(42, 199, 255, 0.58);
    --viewer-dock-active-ring: rgba(42, 199, 255, 0.22);
    --viewer-dock-active-chip-text: #06141d;
    --viewer-dock-button-shadow: 0 12px 24px rgba(0, 0, 0, 0.35);
    --viewer-dock-active-shadow-base: 0 12px 24px rgba(0, 0, 0, 0.35);
    --viewer-gallery-bg: rgba(10, 14, 19, 0.85);
    --viewer-gallery-item-bg: rgba(18, 25, 34, 0.85);
    --viewer-gallery-item-border: rgba(255, 255, 255, 0.08);
    --viewer-gallery-thumb-bg: rgba(255, 255, 255, 0.06);
    --viewer-gallery-close-bg: rgba(255, 255, 255, 0.1);
    --viewer-gallery-active-ring: rgba(42, 199, 255, 0.2);
    --viewer-close-button-size: 28px;
    /* Corner radius of the viewer's chrome: shell, rail, side panel and stage.
       Sidebar buttons, the floating toolbar and panel content keep their own
       rounding. */
    --viewer-chrome-radius: 0;
    --viewer-close-button-radius: var(--viewer-chrome-radius);
    --viewer-close-button-border: rgba(255, 255, 255, 0.18);
    --viewer-close-button-bg: rgba(255, 255, 255, 0.1);
    --viewer-close-button-hover-bg: rgba(255, 255, 255, 0.16);
    --viewer-close-button-hover-border: rgba(255, 255, 255, 0.34);
    --viewer-close-button-color: var(--viewer-text);
    --viewer-close-button-glyph-size: 15px;
    --viewer-close-button-focus-ring: rgba(42, 199, 255, 0.55);
    --viewer-stage-bottom-bg: rgba(12, 16, 22, 0.72);
    --viewer-toolbar-separator: rgba(255, 255, 255, 0.14);
    --viewer-toolbar-group-border: rgba(255, 255, 255, 0.1);
    --viewer-toolbar-group-bg: transparent;
    --viewer-toolbar-button-bg: rgba(255, 255, 255, 0.03);
    --viewer-toolbar-button-hover-bg: rgba(255, 255, 255, 0.08);
    --viewer-toolbar-value-text: rgba(230, 236, 246, 0.96);
    --viewer-toolbar-value-bg: transparent;
    --viewer-search-input-bg: rgba(10, 14, 19, 0.8);
    --viewer-search-clear-bg: rgba(255, 255, 255, 0.1);
    --viewer-search-item-bg: rgba(255, 255, 255, 0.06);
    --viewer-search-item-hover-bg: rgba(255, 255, 255, 0.1);
    --viewer-search-focus: rgba(42, 199, 255, 0.65);
    --viewer-control-rail-bg: linear-gradient(
      180deg,
      rgba(20, 28, 37, 0.92) 0%,
      rgba(14, 20, 29, 0.92) 100%
    );

    /*
     * Story chrome runs its own palette rather than reusing `--viewer-accent`:
     * the story viewer is a presentation surface with its own identity, and the
     * two accents are deliberately different in the default theme. Every theme
     * below restates this block, so a story never inherits a palette that was
     * only contrast-checked against viewer chrome. The story components consume
     * these with the dark values as literal fallbacks, so they still render
     * standalone (tests, storybook) outside a themed `.viewer`.
     */
    --story-shell-bg: linear-gradient(180deg, #10161e 0%, #0b1118 100%);
    --story-line: rgba(255, 255, 255, 0.14);
    --story-text: #edf5ff;
    --story-muted: #d8dee9;
    --story-accent: #9a57ff;
    --story-accent-2: #4bc6ff;
    --story-accent-text: #be8dff;
    --story-accent-text-hover: #d8bcff;
    --story-control-bg: rgba(8, 17, 32, 0.6);
    --story-control-border: rgba(255, 255, 255, 0.24);
    --story-control-hover-bg: rgba(255, 255, 255, 0.12);
    --story-track-bg: rgba(255, 255, 255, 0.2);
    --story-track-border: rgba(255, 255, 255, 0.15);
    --story-active-ring: rgba(64, 171, 245, 0.84);
    --story-active-halo: rgba(227, 240, 255, 0.42);
    --story-error: #ffb3c1;
    --story-note-bg: rgba(255, 255, 255, 0.92);
    --story-note-text: #2b2520;
    --story-label-bg: rgba(20, 16, 12, 0.82);
    --story-label-text: #ffffff;

    /*
     * Status colours and the story builder's accent. These carry meaning rather
     * than decoration, so each theme restates them at a lightness that reads on
     * its own panels — the dark theme's pale pinks and greens vanish on a light
     * surface. Tints and washes are mixed from these at the use site.
     */
    --viewer-danger: #ffb8b8;
    --viewer-success: #72cea4;
    --viewer-warning: #e8b85f;
    --story-builder-accent: #b4551f;
    --story-builder-accent-hover: #a8480f;
    /*
     * Sunken surfaces — inputs, scrub tracks, timeline wells. These sit *below*
     * their panel, so they cannot be mixed from `--viewer-text` the way raised
     * fills are: on a dark theme that would lighten them. Each theme states its
     * own recess instead.
     */
    --viewer-well-bg: rgba(5, 10, 16, 0.35);
    --viewer-focus-ring: rgba(42, 199, 255, 0.7);

    display: grid;
    grid-template-rows: auto 1fr;
    gap: 16px;
    box-sizing: border-box;
    height: 100%;
    max-height: none;
    min-height: 0;
    overflow: hidden;
    padding: 20px;
    border-radius: var(--viewer-chrome-radius);
    background: radial-gradient(120% 120% at 10% 0%, #1d2632 0%, #111720 55%, #0b0f14 100%);
    color: var(--viewer-text);
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
    border: 1px solid #1c2530;
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
    padding-inline: 20px;
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

  .viewer[data-theme='light'] {
    --viewer-bg: #f3f5f8;
    --viewer-surface: #f7f8fb;
    --viewer-panel: #e9edf3;
    --viewer-panel-strong: #dde4ed;
    --viewer-panel-border: rgba(34, 48, 65, 0.12);
    --viewer-text: #223041;
    --viewer-muted: #586576;
    --viewer-accent: #53719c;
    --viewer-accent-2: #357f99;
    --viewer-stage: #f3f5f8;
    --viewer-stage-glow: rgba(108, 174, 199, 0.16);
    --viewer-stage-tail: #ffffff;
    --viewer-dock-button-bg: rgba(248, 251, 255, 0.96);
    --viewer-dock-button-border: rgba(34, 48, 65, 0.2);
    --viewer-dock-tooltip-bg: rgba(241, 246, 252, 0.97);
    --viewer-dock-active-border: rgba(21, 159, 206, 0.65);
    --viewer-dock-active-ring: rgba(42, 199, 255, 0.18);
    --viewer-dock-active-chip-text: #16435a;
    --viewer-dock-button-shadow: 0 10px 20px rgba(34, 48, 65, 0.18);
    --viewer-dock-active-shadow-base: 0 10px 20px rgba(34, 48, 65, 0.2);
    --viewer-gallery-bg: rgba(242, 246, 252, 0.92);
    --viewer-gallery-item-bg: rgba(255, 255, 255, 0.92);
    --viewer-gallery-item-border: rgba(34, 48, 65, 0.14);
    --viewer-gallery-thumb-bg: rgba(224, 232, 241, 0.72);
    --viewer-gallery-close-bg: rgba(255, 255, 255, 0.92);
    --viewer-gallery-active-ring: rgba(108, 174, 199, 0.26);
    --viewer-close-button-border: rgba(34, 48, 65, 0.2);
    --viewer-close-button-bg: rgba(255, 255, 255, 0.92);
    --viewer-close-button-hover-bg: rgba(233, 240, 248, 0.96);
    --viewer-close-button-hover-border: rgba(34, 48, 65, 0.3);
    --viewer-close-button-color: #223041;
    --viewer-close-button-focus-ring: var(--viewer-focus-ring);
    --viewer-stage-bottom-bg: rgba(241, 245, 251, 0.86);
    --viewer-toolbar-separator: rgba(34, 48, 65, 0.16);
    --viewer-toolbar-group-border: rgba(34, 48, 65, 0.16);
    --viewer-toolbar-group-bg: transparent;
    --viewer-toolbar-button-bg: rgba(255, 255, 255, 0.84);
    --viewer-toolbar-button-hover-bg: rgba(124, 150, 190, 0.2);
    --viewer-toolbar-value-text: #223041;
    --viewer-toolbar-value-bg: transparent;
    --viewer-search-input-bg: rgba(255, 255, 255, 0.92);
    --viewer-search-clear-bg: rgba(124, 150, 190, 0.2);
    --viewer-search-item-bg: rgba(255, 255, 255, 0.78);
    --viewer-search-item-hover-bg: rgba(124, 150, 190, 0.22);
    --viewer-search-focus: var(--viewer-focus-ring);
    --viewer-control-rail-bg: linear-gradient(
      180deg,
      rgba(241, 245, 251, 0.95) 0%,
      rgba(229, 236, 245, 0.95) 100%
    );
    --story-shell-bg: linear-gradient(180deg, #ffffff 0%, #eaf0f8 100%);
    --story-line: rgba(34, 48, 65, 0.14);
    --story-text: #1d2a3a;
    --story-muted: #56677d;
    --story-accent: #6d3bd4;
    --story-accent-2: #1f8fc4;
    --story-accent-text: #5a2fbd;
    --story-accent-text-hover: #43219a;
    --story-control-bg: rgba(255, 255, 255, 0.88);
    --story-control-border: rgba(34, 48, 65, 0.22);
    --story-control-hover-bg: rgba(109, 59, 212, 0.12);
    --story-track-bg: rgba(34, 48, 65, 0.14);
    --story-track-border: rgba(34, 48, 65, 0.12);
    --story-active-ring: rgba(31, 143, 196, 0.72);
    --story-active-halo: rgba(34, 48, 65, 0.24);
    --story-error: #b3243c;
    --story-note-bg: rgba(255, 255, 255, 0.95);
    --story-note-text: #1d2a3a;
    --story-label-bg: rgba(29, 42, 58, 0.86);
    --story-label-text: #ffffff;
    --viewer-danger: #b3243c;
    --viewer-success: #1d7a52;
    --viewer-warning: #8a5a00;
    --story-builder-accent: #b4551f;
    --story-builder-accent-hover: #93430f;
    --viewer-well-bg: rgba(34, 48, 65, 0.07);
    --viewer-focus-ring: #0b6fa4;
    border-color: #dbe2eb;
    box-shadow: var(--viewer-frame-shadow, none);
    background: radial-gradient(135% 135% at 10% 0%, #e6f1ff 0%, #f5faff 45%, #ffffff 100%);
  }

  .viewer[data-theme='sepia'] {
    --viewer-bg: #eee4d2;
    --viewer-surface: #f7f0e3;
    --viewer-panel: #e8dcc6;
    --viewer-panel-strong: #dac9aa;
    --viewer-panel-border: rgba(76, 58, 35, 0.16);
    --viewer-text: #3d3023;
    --viewer-muted: #67563f;
    --viewer-accent: #a86f46;
    --viewer-accent-2: #2f858b;
    --viewer-accent-tools: #66864a;
    --viewer-stage: #f4ecde;
    --viewer-stage-glow: rgba(47, 133, 139, 0.13);
    --viewer-stage-tail: #fffaf0;
    --viewer-dock-button-bg: rgba(255, 250, 240, 0.94);
    --viewer-dock-button-border: rgba(76, 58, 35, 0.2);
    --viewer-dock-tooltip-bg: rgba(250, 243, 230, 0.97);
    --viewer-dock-active-border: rgba(47, 133, 139, 0.68);
    --viewer-dock-active-ring: rgba(47, 133, 139, 0.2);
    --viewer-dock-active-chip-text: #173f42;
    --viewer-dock-button-shadow: 0 10px 20px rgba(76, 58, 35, 0.16);
    --viewer-dock-active-shadow-base: 0 10px 20px rgba(76, 58, 35, 0.18);
    --viewer-gallery-bg: rgba(244, 236, 222, 0.94);
    --viewer-gallery-item-bg: rgba(255, 250, 240, 0.94);
    --viewer-gallery-item-border: rgba(76, 58, 35, 0.15);
    --viewer-gallery-thumb-bg: rgba(224, 210, 185, 0.72);
    --viewer-gallery-close-bg: rgba(255, 250, 240, 0.94);
    --viewer-gallery-active-ring: rgba(47, 133, 139, 0.24);
    --viewer-close-button-border: rgba(76, 58, 35, 0.2);
    --viewer-close-button-bg: rgba(255, 250, 240, 0.94);
    --viewer-close-button-hover-bg: rgba(239, 227, 207, 0.96);
    --viewer-close-button-hover-border: rgba(76, 58, 35, 0.32);
    --viewer-close-button-color: #3d3023;
    --viewer-close-button-focus-ring: var(--viewer-focus-ring);
    --viewer-stage-bottom-bg: rgba(241, 231, 212, 0.88);
    --viewer-toolbar-separator: rgba(76, 58, 35, 0.16);
    --viewer-toolbar-group-border: rgba(76, 58, 35, 0.16);
    --viewer-toolbar-group-bg: transparent;
    --viewer-toolbar-button-bg: rgba(255, 250, 240, 0.86);
    --viewer-toolbar-button-hover-bg: rgba(47, 133, 139, 0.15);
    --viewer-toolbar-value-text: #3d3023;
    --viewer-toolbar-value-bg: transparent;
    --viewer-search-input-bg: rgba(255, 250, 240, 0.94);
    --viewer-search-clear-bg: rgba(47, 133, 139, 0.14);
    --viewer-search-item-bg: rgba(255, 250, 240, 0.78);
    --viewer-search-item-hover-bg: rgba(47, 133, 139, 0.16);
    --viewer-search-focus: var(--viewer-focus-ring);
    --viewer-control-rail-bg: linear-gradient(
      180deg,
      rgba(241, 231, 212, 0.96) 0%,
      rgba(229, 214, 188, 0.96) 100%
    );
    --story-shell-bg: linear-gradient(180deg, #f9f3e7 0%, #e8dbc2 100%);
    --story-line: rgba(76, 58, 35, 0.18);
    --story-text: #3d3023;
    --story-muted: #6b5a44;
    --story-accent: #a8562a;
    --story-accent-2: #2f858b;
    --story-accent-text: #8d451f;
    --story-accent-text-hover: #6d3415;
    --story-control-bg: rgba(255, 250, 240, 0.9);
    --story-control-border: rgba(76, 58, 35, 0.24);
    --story-control-hover-bg: rgba(168, 86, 42, 0.14);
    --story-track-bg: rgba(76, 58, 35, 0.16);
    --story-track-border: rgba(76, 58, 35, 0.14);
    --story-active-ring: rgba(47, 133, 139, 0.74);
    --story-active-halo: rgba(76, 58, 35, 0.26);
    --story-error: #a32b26;
    --story-note-bg: rgba(255, 250, 240, 0.95);
    --story-note-text: #3d3023;
    --story-label-bg: rgba(61, 48, 35, 0.86);
    --story-label-text: #fffaf0;
    --viewer-danger: #a32b26;
    --viewer-success: #2f6b4a;
    --viewer-warning: #7a5410;
    --story-builder-accent: #a8562a;
    --story-builder-accent-hover: #8a4319;
    --viewer-well-bg: rgba(76, 58, 35, 0.09);
    --viewer-focus-ring: #1b6b70;
    border-color: #d8c7aa;
    box-shadow: var(--viewer-frame-shadow, none);
    background: radial-gradient(135% 135% at 10% 0%, #f5ead7 0%, #eee4d2 48%, #e5d7bf 100%);
  }

  .viewer[data-theme='midnight'] {
    --viewer-bg: #07111f;
    --viewer-surface: #0a1728;
    --viewer-panel: #0c192a;
    --viewer-panel-strong: #13263d;
    --viewer-panel-border: rgba(126, 180, 235, 0.15);
    --viewer-text: #edf6ff;
    --viewer-muted: #91a7bf;
    --viewer-accent: #a78bfa;
    --viewer-accent-2: #38bdf8;
    --viewer-accent-tools: #5eead4;
    --viewer-stage: #050d18;
    --viewer-stage-glow: rgba(56, 189, 248, 0.15);
    --viewer-stage-tail: #020711;
    --viewer-dock-button-bg: rgba(7, 17, 31, 0.96);
    --viewer-dock-tooltip-bg: rgba(3, 10, 20, 0.97);
    --viewer-control-rail-bg: linear-gradient(
      180deg,
      rgba(12, 29, 48, 0.96) 0%,
      rgba(5, 15, 28, 0.96) 100%
    );
    --story-shell-bg: linear-gradient(180deg, #0b1b30 0%, #040c18 100%);
    --story-line: rgba(126, 180, 235, 0.18);
    --story-text: #edf6ff;
    --story-muted: #a8bdd6;
    --story-accent: #a78bfa;
    --story-accent-2: #38bdf8;
    --story-accent-text: #c4b1ff;
    --story-accent-text-hover: #ddd0ff;
    --story-control-bg: rgba(5, 15, 28, 0.72);
    --story-control-border: rgba(126, 180, 235, 0.28);
    --story-control-hover-bg: rgba(126, 180, 235, 0.14);
    --story-track-bg: rgba(126, 180, 235, 0.2);
    --story-track-border: rgba(126, 180, 235, 0.16);
    --story-active-ring: rgba(56, 189, 248, 0.82);
    --story-active-halo: rgba(199, 226, 255, 0.4);
    --story-error: #ff9db0;
    --viewer-danger: #ff9db0;
    --viewer-success: #5eead4;
    --viewer-warning: #fbbf24;
    /*
     * Deep rather than bright: these accents are button fills carrying white
     * labels, so the fill has to stay dark enough to clear 4.5:1 against white.
     * A lighter orange reads better against the midnight panel but drops the
     * label to ~2.4:1.
     */
    --story-builder-accent: #c2410c;
    --story-builder-accent-hover: #d4550f;
    --viewer-well-bg: rgba(3, 8, 16, 0.45);
    border-color: #142b46;
    box-shadow: var(--viewer-frame-shadow, none);
    background: radial-gradient(130% 130% at 8% 0%, #142a46 0%, #07111f 50%, #020711 100%);
  }

  /*
   * Ringo — the Yellow Submarine theme. A light-family palette (see the
   * `[data-theme='ringo']` entries in the `:is()` lists elsewhere in the
   * codebase, which it joins alongside light and sepia): yellow hull, sea-blue
   * secondary, Pepperland pink accent. The stage stays a pale cream rather than
   * going sea-blue, because stage overlays draw `--viewer-text` on top of it and
   * a dark stage under dark text is unreadable.
   */
  .viewer[data-theme='ringo'] {
    --viewer-bg: #ffd60a;
    --viewer-surface: #ffe987;
    --viewer-panel: #ffe15c;
    --viewer-panel-strong: #ffcf1f;
    --viewer-panel-border: rgba(74, 48, 0, 0.24);
    --viewer-text: #2e2000;
    --viewer-muted: #6d5200;
    --viewer-accent: #a8232b;
    --viewer-accent-2: #0072c6;
    --viewer-accent-tools: #00875a;
    --viewer-stage: #fff6c2;
    /* Warm, not the sea blue: a blue glow over the cream stage mixes to green. */
    --viewer-stage-glow: rgba(168, 35, 43, 0.1);
    --viewer-stage-tail: #fffdf0;
    --viewer-dock-button-bg: rgba(255, 250, 214, 0.96);
    --viewer-dock-button-border: rgba(74, 48, 0, 0.24);
    --viewer-dock-tooltip-bg: rgba(255, 247, 199, 0.97);
    --viewer-dock-active-border: rgba(168, 35, 43, 0.7);
    --viewer-dock-active-ring: rgba(168, 35, 43, 0.2);
    --viewer-dock-active-chip-text: #5a0723;
    --viewer-dock-button-shadow: 0 10px 20px rgba(74, 48, 0, 0.22);
    --viewer-dock-active-shadow-base: 0 10px 20px rgba(74, 48, 0, 0.24);
    --viewer-gallery-bg: rgba(255, 243, 176, 0.94);
    --viewer-gallery-item-bg: rgba(255, 252, 226, 0.94);
    --viewer-gallery-item-border: rgba(74, 48, 0, 0.18);
    --viewer-gallery-thumb-bg: rgba(240, 214, 120, 0.72);
    --viewer-gallery-close-bg: rgba(255, 252, 226, 0.94);
    --viewer-gallery-active-ring: rgba(0, 114, 198, 0.26);
    --viewer-close-button-border: rgba(74, 48, 0, 0.24);
    --viewer-close-button-bg: rgba(255, 252, 226, 0.94);
    --viewer-close-button-hover-bg: rgba(255, 238, 160, 0.96);
    --viewer-close-button-hover-border: rgba(74, 48, 0, 0.36);
    --viewer-close-button-color: #2e2000;
    --viewer-close-button-focus-ring: var(--viewer-focus-ring);
    --viewer-stage-bottom-bg: rgba(255, 244, 184, 0.88);
    --viewer-toolbar-separator: rgba(74, 48, 0, 0.2);
    --viewer-toolbar-group-border: rgba(74, 48, 0, 0.2);
    --viewer-toolbar-group-bg: transparent;
    /*
     * The transport controls are filled in the submarine's trim red with a pale
     * hull-yellow glyph, rather than being pale chips on the yellow panel. The
     * readout text beside them stays dark, because it sits on the panel itself
     * and not on a button.
     */
    --viewer-toolbar-button-bg: rgba(156, 43, 34, 0.94);
    --viewer-toolbar-button-hover-bg: rgba(124, 32, 25, 0.98);
    --viewer-toolbar-button-color: #fff4b8;
    --viewer-toolbar-value-text: #2e2000;
    /* The left navigation matches the transport controls: red fittings on the
       yellow hull. Active is a deeper red with a pale hull-yellow edge, since a
       sea-blue ring would read as a different system on top of the red. */
    --viewer-nav-button-bg: rgba(156, 43, 34, 0.94);
    --viewer-nav-button-hover-bg: rgba(124, 32, 25, 0.98);
    --viewer-nav-button-hover-border: rgba(74, 48, 0, 0.4);
    --viewer-nav-button-border: rgba(74, 48, 0, 0.28);
    --viewer-nav-button-color: #fff4b8;
    --viewer-nav-button-active-bg: rgba(124, 32, 25, 0.98);
    --viewer-nav-button-active-border: #fff4b8;
    --viewer-toolbar-value-bg: transparent;
    --viewer-search-input-bg: rgba(255, 252, 226, 0.94);
    --viewer-search-clear-bg: rgba(168, 35, 43, 0.16);
    --viewer-search-item-bg: rgba(255, 252, 226, 0.78);
    --viewer-search-item-hover-bg: rgba(168, 35, 43, 0.18);
    --viewer-search-focus: var(--viewer-focus-ring);
    /* Flat surfaces. The only gradient Ringo keeps is the stage wash behind the
       image, which OSDViewer builds from --viewer-stage-glow/-stage/-stage-tail. */
    --viewer-control-rail-bg: rgba(255, 225, 92, 0.96);
    --story-shell-bg: #ffe15c;
    --story-line: rgba(74, 48, 0, 0.22);
    --story-text: #2e2000;
    --story-muted: #6d5200;
    --story-accent: #a8232b;
    --story-accent-2: #0072c6;
    --story-accent-text: #8c1f1a;
    --story-accent-text-hover: #701712;
    --story-control-bg: rgba(255, 249, 214, 0.9);
    --story-control-border: rgba(74, 48, 0, 0.28);
    --story-control-hover-bg: rgba(168, 35, 43, 0.14);
    --story-track-bg: rgba(74, 48, 0, 0.18);
    --story-track-border: rgba(74, 48, 0, 0.14);
    --story-active-ring: rgba(0, 114, 198, 0.8);
    --story-active-halo: rgba(74, 48, 0, 0.26);
    --story-error: #a3123c;
    --story-note-bg: rgba(255, 250, 219, 0.95);
    --story-note-text: #2e2000;
    --story-label-bg: rgba(46, 32, 0, 0.86);
    --story-label-text: #fff4b8;
    --viewer-danger: #a3123c;
    --viewer-success: #00694a;
    --viewer-warning: #7a4b00;
    --story-builder-accent: #9c2b22;
    --story-builder-accent-hover: #8c1f1a;
    --viewer-well-bg: rgba(74, 48, 0, 0.1);
    --viewer-focus-ring: #0056a3;
    border-color: #e0a800;
    box-shadow: var(--viewer-frame-shadow, none);
    background: var(--viewer-bg);
  }
  :global(.viewer :is(button, input, select, textarea):focus-visible) {
    outline: 2px solid var(--viewer-focus-ring, rgba(42, 199, 255, 0.7));
    outline-offset: 2px;
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
