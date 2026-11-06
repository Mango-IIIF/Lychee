<script lang="ts" module>
  export interface AnnotationListItem {
    id: string;
    eyebrow: string;
    title: string;
    text: string;
    /** The creator's name, where the annotation gives one. */
    by?: string;
    /** Show (a shape on the image) or jump (to a time); nothing for a whole image or item. */
    locate?: 'show' | 'jump';
    /** The user's: made here, handed over by the host, or with their `creator`. */
    mine: boolean;
    /** The user's, or the item's with no creator: someone else's cannot be changed. */
    editable: boolean;
    /** Only the user's own records can be deleted; the item's stay with the item. */
    deletable: boolean;
  }
</script>

<script lang="ts">
  import { Eye, Pencil, Play, Trash2 } from '@lucide/svelte';
  import { t } from '../core/i18n';

  /**
   * The annotations on the page or recording, under the sidebar's form. With a user id
   * there are two tabs, Your annotations and All annotations; without one it is a single list.
   */
  interface Props {
    items: AnnotationListItem[];
    kind: 'image' | 'av';
    /** Split into Your annotations and All annotations. */
    split?: boolean;
    selectedId?: string | null;
    onlocate: (id: string) => void;
    onedit: (id: string) => void;
    ondelete: (id: string) => void;
  }

  let { items, kind, split = false, selectedId = null, onlocate, onedit, ondelete }: Props = $props();

  let tab = $state<'mine' | 'all'>('mine');
  let mine = $derived(items.filter((item) => item.mine));
  let shown = $derived(split && tab === 'mine' ? mine : items);
  let empty = $derived(
    $t(`annotate.list.empty.${split && tab === 'mine' ? 'mine' : 'all'}.${kind}`),
  );
</script>

<section class="annotation-list" aria-labelledby={split ? undefined : 'annotation-list-heading'}>
  {#if split}
    <div class="annotation-list__tabs" role="tablist" aria-label={$t('annotate.list.label')}>
      <button
        type="button"
        role="tab"
        aria-selected={tab === 'mine'}
        onclick={() => (tab = 'mine')}>{$t('annotate.list.mine', { count: mine.length })}</button
      >
      <button
        type="button"
        role="tab"
        aria-selected={tab === 'all'}
        onclick={() => (tab = 'all')}>{$t('annotate.list.all', { count: items.length })}</button
      >
    </div>
  {:else}
    <h3 id="annotation-list-heading">{$t('annotate.list.heading', { count: items.length })}</h3>
  {/if}

  <div class="annotation-list__items" role={split ? 'tabpanel' : undefined}>
    {#if !shown.length}
      <p class="anno-muted">{empty}</p>
    {/if}
    {#each shown as item (item.id)}
      <article class="annotation-list__card" class:selected={item.id === selectedId}>
        <span class="annotation-list__eyebrow">
          {item.eyebrow}
          {#if split && item.mine}
            {#if tab === 'all'}
              <span class="annotation-list__badge">{$t('annotate.table.origin.mine')}</span>
            {/if}
          {:else if item.by}
            <span class="annotation-list__by">{item.by}</span>
          {/if}
        </span>
        {#if item.title}<strong>{item.title}</strong>{/if}
        {#if item.text && item.text !== item.title}<p>{item.text}</p>{/if}
        <div class="annotation-list__actions">
          {#if item.locate === 'jump'}
            <button type="button" class="anno-subtle" onclick={() => onlocate(item.id)}>
              <Play size={14} aria-hidden="true" />
              {$t('annotate.cards.jump')}
            </button>
          {:else if item.locate === 'show'}
            <button type="button" class="anno-subtle" onclick={() => onlocate(item.id)}>
              <Eye size={14} aria-hidden="true" />
              {$t('annotate.cards.show')}
            </button>
          {/if}
          {#if item.editable}
            <button type="button" class="anno-subtle" onclick={() => onedit(item.id)}>
              <Pencil size={14} aria-hidden="true" />
              {$t('annotate.cards.edit')}
            </button>
          {/if}
          {#if item.deletable}
            <button type="button" class="anno-subtle" onclick={() => ondelete(item.id)}>
              <Trash2 size={14} aria-hidden="true" />
              {$t('annotate.cards.delete')}
            </button>
          {/if}
        </div>
      </article>
    {/each}
  </div>
</section>

<style>
  .annotation-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 16px 20px 20px;
    border-top: 1px solid var(--viewer-panel-border);
    font-size: 15px;
  }

  h3 {
    margin: 0;
    font-size: 15px;
  }

  .annotation-list__tabs {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 4px;
    padding: 4px;
    border-radius: 8px;
    background: var(--anno-tint);
  }

  .annotation-list__tabs button {
    min-height: 36px;
    padding: 0 8px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--viewer-muted);
    font: inherit;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
  }

  .annotation-list__tabs button[aria-selected='true'] {
    background: var(--anno-raised);
    color: var(--viewer-text);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.18);
  }

  .annotation-list__items {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .annotation-list__card {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 12px;
    border: 1px solid var(--viewer-panel-border);
    border-radius: 8px;
    background: var(--anno-raised);
    font-size: 14px;
  }

  .annotation-list__card.selected {
    border-color: var(--anno-accent);
  }

  .annotation-list__eyebrow {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    color: var(--viewer-muted);
    font-size: 12px;
    font-weight: 600;
  }

  .annotation-list__badge {
    padding: 1px 6px;
    border-radius: 999px;
    background: var(--anno-tint);
    color: var(--viewer-text);
  }

  .annotation-list__by {
    font-weight: 500;
  }

  .annotation-list__by::before {
    content: '· ';
  }

  .annotation-list__card p {
    margin: 0;
    color: var(--viewer-muted);
    line-height: 1.45;
  }

  .annotation-list__actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }
</style>
