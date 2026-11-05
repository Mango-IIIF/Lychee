<script lang="ts">
  import { ChevronDown } from '@lucide/svelte';
  import { t } from '../../core/i18n';
  import type { ExportKind } from '../../annotations/export';

  /**
   * The header's download: one button while there is only one thing to
   * download, a menu of annotations, contents or both once there are two.
   */
  interface Props {
    /** The kinds the host allows. */
    kinds: ExportKind[];
    annotationCount: number;
    /** A table of contents has been saved. */
    hasStructures: boolean;
    /** The table of contents has changes that are not saved, and so not downloaded. */
    structuresUnsaved?: boolean;
    onexport: (include: ExportKind[]) => void;
  }

  let { kinds, annotationCount, hasStructures, structuresUnsaved = false, onexport }: Props = $props();

  let open = $state(false);
  let root: HTMLDivElement | null = $state(null);
  const menuId = `anno-export-${Math.random().toString(36).slice(2)}`;

  let offerAnnotations = $derived(kinds.includes('annotations'));
  let offerStructures = $derived(kinds.includes('structures') && hasStructures);
  let asMenu = $derived(offerAnnotations && offerStructures);

  const choose = (include: ExportKind[]) => {
    open = false;
    onexport(include);
  };

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
      element.querySelector<HTMLButtonElement>('.anno-export__button')?.focus();
    };
    document.addEventListener('pointerdown', onpointer, true);
    document.addEventListener('keydown', onkey);
    return () => {
      document.removeEventListener('pointerdown', onpointer, true);
      document.removeEventListener('keydown', onkey);
    };
  });
</script>

<div class="anno-export" bind:this={root}>
  {#if asMenu}
    <button
      type="button"
      class="anno-export__button"
      aria-expanded={open}
      aria-controls={menuId}
      aria-haspopup="menu"
      onclick={() => (open = !open)}
    >
      {$t('annotate.export.menu')}
      <ChevronDown size={16} aria-hidden="true" />
    </button>
    {#if open}
      <div class="anno-export__menu" id={menuId} role="menu">
        <button type="button" role="menuitem" disabled={!annotationCount} onclick={() => choose(['annotations'])}>
          {$t('annotate.export.annotations', { count: annotationCount })}
        </button>
        <button type="button" role="menuitem" onclick={() => choose(['structures'])}>
          {$t('annotate.export.structuresItem')}
        </button>
        <button type="button" role="menuitem" onclick={() => choose(['annotations', 'structures'])}>
          {$t('annotate.export.both')}
        </button>
        {#if structuresUnsaved}
          <p class="anno-export__note">{$t('annotate.export.unsaved')}</p>
        {/if}
      </div>
    {/if}
  {:else if offerStructures}
    <button type="button" class="anno-export__button" onclick={() => choose(['structures'])}>
      {$t('annotate.export.structures')}
    </button>
  {:else}
    <button
      type="button"
      class="anno-export__button"
      disabled={!offerAnnotations || !annotationCount}
      onclick={() => choose(['annotations'])}
    >
      {$t('annotate.export.button', { count: annotationCount })}
    </button>
  {/if}
</div>

<style>
  .anno-export {
    position: relative;
  }

  .anno-export__button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
    border: none;
    border-radius: 8px;
    background: var(--anno-accent);
    color: var(--anno-on-accent);
    font-family: inherit;
    font-weight: 600;
    cursor: pointer;
  }

  .anno-export__button:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .anno-export__menu {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    z-index: 40;
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 240px;
    padding: 6px;
    border: 1px solid var(--viewer-panel-border);
    border-radius: 10px;
    background: var(--anno-surface, var(--viewer-panel));
    box-shadow: var(--viewer-dock-button-shadow, 0 12px 24px rgba(0, 0, 0, 0.3));
    color: var(--viewer-text);
  }

  [role='menuitem'] {
    padding: 8px 10px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: 14px;
    text-align: left;
    cursor: pointer;
  }

  [role='menuitem']:hover:not(:disabled) {
    background: var(--anno-tint, rgba(127, 127, 127, 0.12));
  }

  [role='menuitem']:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .anno-export__note {
    margin: 4px 10px 2px;
    color: var(--viewer-muted);
    font-size: 12px;
    line-height: 1.3;
  }
</style>
