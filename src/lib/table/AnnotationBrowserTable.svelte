<script lang="ts">
  import { t } from '../core/i18n';
  import type { TableRow } from './types';

  interface Props {
    rows?: TableRow[];
    activeId?: string | null;
    onselect?: ((detail: { id: string }) => void) | undefined;
    /** Collapsed, only the toolbar shows, so the stage keeps the height. */
    open?: boolean;
    ontoggle?: (() => void) | undefined;
  }

  let { rows = [], activeId = null, onselect = undefined, open = true, ontoggle = undefined }: Props =
    $props();

  let query = $state('');
  let originFilter = $state<'' | 'mine' | 'source'>('');
  let sortBy = $state<'document' | 'title' | 'motivation' | 'where'>('document');

  /*
   * How many rows are put in the DOM at once. A page with ten thousand
   * annotations would otherwise produce ten thousand rows in a panel that
   * shows a dozen; the window grows as the user reaches the bottom.
   */
  const PAGE_SIZE = 200;
  let windowSize = $state(PAGE_SIZE);

  const matched = $derived.by(() => {
    const q = query.trim().toLowerCase();
    const filtered = rows.filter((row) => {
      if (originFilter && row.origin !== originFilter) return false;
      if (!q) return true;
      return `${row.id} ${row.title} ${row.text} ${row.motivation}`.toLowerCase().includes(q);
    });
    const key = sortBy;
    if (key === 'document') return filtered;
    // Copied before sorting: the incoming array is the caller's state.
    return [...filtered].sort((a, b) => a[key].localeCompare(b[key]));
  });

  const visible = $derived(matched.slice(0, windowSize));

  // A new search starts at the top of its own results.
  $effect(() => {
    void query;
    void originFilter;
    void sortBy;
    windowSize = PAGE_SIZE;
  });

  const handleScroll = (event: Event) => {
    const element = event.currentTarget as HTMLElement;
    const remaining = element.scrollHeight - element.scrollTop - element.clientHeight;
    if (remaining < 240 && windowSize < matched.length) {
      windowSize = Math.min(windowSize + PAGE_SIZE, matched.length);
    }
  };
</script>

<section class="annotation-table">
  <div class="annotation-table__toolbar">
    <button
      type="button"
      class="annotation-table__toggle"
      aria-expanded={open}
      aria-label={open ? $t('annotate.table.hide') : $t('annotate.table.show')}
      title={open ? $t('annotate.table.hide') : $t('annotate.table.show')}
      onclick={() => ontoggle?.()}
    >
      {open ? '▾' : '▸'}
    </button>
    <span class="annotation-table__title">{$t('annotate.table.heading', { count: rows.length })}</span>
    {#if open}
      <input
        class="annotation-table__search"
        type="search"
        bind:value={query}
        placeholder={$t('annotate.table.search')}
        aria-label={$t('annotate.table.search')}
      />
      <select class="annotation-table__filter" bind:value={originFilter} aria-label={$t('annotate.table.filter')}>
        <option value="">{$t('annotate.table.origin.all')}</option>
        <option value="mine">{$t('annotate.table.origin.mine')}</option>
        <option value="source">{$t('annotate.table.origin.source')}</option>
      </select>
      <select class="annotation-table__filter" bind:value={sortBy} aria-label={$t('annotate.table.sortBy')}>
        <option value="document">{$t('annotate.table.sort.document')}</option>
        <option value="title">{$t('annotate.table.sort.title')}</option>
        <option value="motivation">{$t('annotate.table.sort.motivation')}</option>
        <option value="where">{$t('annotate.table.sort.where')}</option>
      </select>
    {/if}
  </div>

  {#if open}
    <div class="annotation-table__wrap" onscroll={handleScroll}>
      <table>
        <thead>
          <tr>
            <th>{$t('annotate.table.columns.title')}</th>
            <th>{$t('annotate.table.columns.text')}</th>
            <th>{$t('annotate.table.columns.motivation')}</th>
            <th>{$t('annotate.table.columns.where')}</th>
            <th>{$t('annotate.table.columns.origin')}</th>
          </tr>
        </thead>
        <tbody>
          {#each visible as row (row.id)}
            <!--
              The first cell holds a real button rather than the row carrying a
              click handler: a `tr` with `onclick` cannot be reached by keyboard.
            -->
            <tr class:active={row.id === activeId}>
              <td>
                <button
                  type="button"
                  class="annotation-table__select"
                  aria-pressed={row.id === activeId}
                  aria-label={$t('annotate.table.select', { annotation: row.title || row.text || row.id })}
                  title={row.id}
                  onclick={() => onselect?.({ id: row.id })}
                >
                  {row.title || '-'}
                </button>
              </td>
              <td title={row.text || undefined}>{row.text || '-'}</td>
              <td>{row.motivation || '-'}</td>
              <td>{row.where}</td>
              <td>{$t(`annotate.table.origin.${row.origin}`)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    <p class="annotation-table__count" aria-live="polite">
      {$t('annotate.table.count', { shown: visible.length, total: matched.length })}
    </p>
  {/if}
</section>

<style>
  .annotation-table {
    display: grid;
    gap: 8px;
    min-height: 0;
    padding: 10px 20px;
    border-top: 1px solid var(--viewer-panel-border);
    background: var(--anno-surface);
    color: var(--viewer-text);
  }
  .annotation-table__toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }
  .annotation-table__title {
    font-size: 13px;
    font-weight: 600;
  }
  .annotation-table__toggle {
    min-width: 32px;
    min-height: 32px;
    border: 1px solid var(--viewer-panel-border);
    border-radius: 8px;
    background: transparent;
    color: var(--viewer-text);
    cursor: pointer;
  }
  .annotation-table__search {
    flex: 1;
    min-width: 120px;
  }
  .annotation-table__search,
  .annotation-table__filter {
    box-sizing: border-box;
    min-height: 32px;
    padding: 6px 8px;
    border: 1px solid var(--viewer-panel-border);
    border-radius: 8px;
    background: var(--anno-raised);
    color: var(--viewer-text);
    font: inherit;
    font-size: 12px;
  }
  .annotation-table__wrap {
    min-height: 0;
    max-height: 220px;
    overflow: auto;
  }
  .annotation-table__count {
    margin: 0;
    color: var(--viewer-muted);
    font-size: 11px;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }
  th,
  td {
    max-width: 320px;
    padding: 8px 10px;
    overflow: hidden;
    border-bottom: 1px solid var(--viewer-panel-border);
    text-align: left;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  tr.active {
    background: var(--anno-tint);
  }
  .annotation-table__select {
    width: 100%;
    min-height: 24px;
    margin: 0;
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  /* Inside a scrolling table, an inset outline can't be clipped by the container. */
  .annotation-table__select:focus-visible {
    border-radius: 4px;
    outline: 2px solid var(--viewer-focus-ring, #2ac7ff);
    outline-offset: -2px;
  }
  tr.active .annotation-table__select {
    font-weight: 600;
  }
</style>
