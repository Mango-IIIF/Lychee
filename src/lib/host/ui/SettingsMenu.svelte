<script lang="ts">
  import { Check, Settings } from '@lucide/svelte';
  import { t } from '../../core/i18n';
  import { THEMES, type Theme } from '../themes';

  /** The header's settings: for now, the viewer colour, from Mango's themes. */
  interface Props {
    theme: Theme;
    onthemechange: (theme: Theme) => void;
  }

  let { theme, onthemechange }: Props = $props();

  let open = $state(false);
  let root: HTMLDivElement | null = $state(null);
  const menuId = `anno-settings-${Math.random().toString(36).slice(2)}`;

  /* Close on a click elsewhere or Escape, wherever the editor's shadow root sits. */
  $effect(() => {
    if (!open || !root) return;
    const element = root;
    const onpointer = (event: PointerEvent) => {
      if (!event.composedPath().includes(element)) open = false;
    };
    const onkey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      open = false;
      element.querySelector<HTMLButtonElement>('.anno-settings__button')?.focus();
    };
    document.addEventListener('pointerdown', onpointer, true);
    document.addEventListener('keydown', onkey);
    return () => {
      document.removeEventListener('pointerdown', onpointer, true);
      document.removeEventListener('keydown', onkey);
    };
  });

  /* Mango's own theme names, so the editor and viewer agree. */
  const themeName = (id: Theme) => $t(`workspace.theme${id[0].toUpperCase()}${id.slice(1)}`);
</script>

<div class="anno-settings" bind:this={root}>
  <button
    type="button"
    class="anno-settings__button"
    aria-expanded={open}
    aria-controls={menuId}
    aria-label={$t('annotate.settings.label')}
    title={$t('annotate.settings.label')}
    onclick={() => (open = !open)}
  >
    <Settings aria-hidden="true" />
  </button>

  {#if open}
    <div class="anno-settings__menu" id={menuId}>
      <span class="anno-settings__heading" id={`${menuId}-colour`}>{$t('annotate.settings.colour')}</span>
      <div role="radiogroup" aria-labelledby={`${menuId}-colour`}>
        {#each THEMES as option (option.id)}
          <button
            type="button"
            role="radio"
            aria-checked={theme === option.id}
            class="anno-settings__theme"
            onclick={() => onthemechange(option.id)}
          >
            <span
              class="anno-settings__swatch"
              style:background={option.background}
              style:box-shadow={`inset -10px 0 0 ${option.accent}`}
              aria-hidden="true"
            ></span>
            <span>{themeName(option.id)}</span>
            {#if theme === option.id}<Check size={16} aria-hidden="true" />{/if}
          </button>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .anno-settings {
    position: relative;
  }

  .anno-settings__button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--viewer-text);
    cursor: pointer;
  }

  .anno-settings__button:hover,
  .anno-settings__button[aria-expanded='true'] {
    background: var(--viewer-toolbar-button-hover-bg, rgba(127, 127, 127, 0.15));
  }

  .anno-settings__button :global(svg) {
    width: 18px;
    height: 18px;
  }

  .anno-settings__menu {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    z-index: 40;
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 200px;
    padding: 10px;
    border: 1px solid var(--viewer-panel-border);
    border-radius: 10px;
    background: var(--anno-surface, var(--viewer-panel));
    box-shadow: var(--viewer-dock-button-shadow, 0 12px 24px rgba(0, 0, 0, 0.3));
    color: var(--viewer-text);
  }

  .anno-settings__heading {
    padding: 0 4px;
    color: var(--viewer-muted);
    font-size: 12px;
    font-weight: 600;
  }

  [role='radiogroup'] {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .anno-settings__theme {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: 14px;
    text-align: left;
    cursor: pointer;
  }

  .anno-settings__theme:hover {
    background: var(--anno-tint, rgba(127, 127, 127, 0.12));
  }

  .anno-settings__theme span:nth-child(2) {
    flex: 1;
  }

  .anno-settings__swatch {
    width: 28px;
    height: 20px;
    border: 1px solid rgba(127, 127, 127, 0.4);
    border-radius: 4px;
  }
</style>
