<script lang="ts">
  import {
    ArrowDown,
    ArrowUp,
    ListIndentDecrease,
    ListIndentIncrease,
    Locate,
    Plus,
    Trash2,
  } from '@lucide/svelte';
  import { t } from '../core/i18n';
  import {
    addSection,
    indentSection,
    moveSection,
    newSection,
    outdentSection,
    pageSpan,
    removeSection,
    updateSection,
    type Section,
    type SectionProblem,
  } from '../annotations/structures';

  /**
   * A book's table of contents, whole: sections nest, and each one without
   * subsections covers a run of pages. Recordings use ChapterPanel.
   */
  interface Props {
    languages: string[];
    language: string;
    sections: Section[];
    /** The item's pages in order. */
    canvases: { id: string; label: string }[];
    currentCanvasId: string | null;
    problems: SectionProblem[];
    /** Changed since the last save. */
    dirty: boolean;
    status?: string;
    onchange: (sections: Section[]) => void;
    onjump: (section: Section) => void;
    onsave: () => void;
  }

  let {
    languages,
    language = $bindable(),
    sections,
    canvases,
    currentCanvasId,
    problems,
    dirty,
    status = '',
    onchange,
    onjump,
    onsave,
  }: Props = $props();

  let canvasIds = $derived(canvases.map((canvas) => canvas.id));
  let blocking = $derived(problems.some((problem) => problem.level === 'error'));
  const problemsOf = (id: string) => problems.filter((problem) => problem.sectionId === id);

  /** A new section starts on the current page. */
  const fresh = (): Section => newSection({ pages: currentCanvasId ? [currentCanvasId] : [] });

  const change = (id: string, fn: (section: Section) => Section) => onchange(updateSection(sections, id, fn));

  const setTitle = (section: Section, value: string) =>
    change(section.id, (s) => ({ ...s, label: { ...s.label, [language]: value } }));

  const setPages = (section: Section, from: string, to: string) =>
    change(section.id, (s) => ({ ...s, pages: pageSpan(canvasIds, from, to) }));

  const titleOf = (section: Section) =>
    section.label[language] ?? '';
  /** A title written in another language, shown as a hint while this one is empty. */
  const otherTitle = (section: Section) =>
    Object.entries(section.label).find(([lang, text]) => lang !== language && text.trim())?.[1] ?? '';
</script>

<section class="contents" aria-label={$t('annotate.contents.label')}>
  <p class="contents__hint">{$t('annotate.contents.hint')}</p>

  {#if languages.length > 1}
    <div class="contents__languages" role="tablist" aria-label={$t('annotate.sidebar.language')}>
      {#each languages as code (code)}
        <button
          type="button"
          role="tab"
          aria-selected={code === language}
          class:active={code === language}
          onclick={() => (language = code)}>{code}</button
        >
      {/each}
    </div>
  {/if}

  {#if sections.length}
    <ol class="contents__tree">
      {#each sections as section, index (section.id)}
        {@render node(section, index, sections.length, 0)}
      {/each}
    </ol>
  {:else}
    <p class="contents__empty">{$t('annotate.contents.empty')}</p>
  {/if}

  <div class="contents__footer">
    <button type="button" class="contents__add" onclick={() => onchange(addSection(sections, fresh()))}>
      <Plus size={16} aria-hidden="true" />
      {$t('annotate.contents.add')}
    </button>
    <button type="button" class="contents__save" disabled={!dirty || blocking} onclick={onsave}>
      {$t('annotate.contents.save')}
    </button>
  </div>
  {#if blocking}
    <p class="contents__status">{$t('annotate.contents.fixFirst')}</p>
  {:else if status}
    <p class="contents__status" role="status">{status}</p>
  {/if}
</section>

{#snippet node(section: Section, index: number, siblings: number, depth: number)}
  {@const own = problemsOf(section.id)}
  <li class="contents__item">
    <div class="contents__row" class:contents__row--problem={own.some((p) => p.level === 'error')}>
      {#if section.locked}
        <p class="contents__name">{titleOf(section) || otherTitle(section)}</p>
        <p class="contents__empty">{$t('annotate.contents.locked')}</p>
      {:else}
        <input
          class="contents__title"
          type="text"
          value={titleOf(section)}
          placeholder={otherTitle(section) || $t('annotate.contents.title')}
          aria-label={$t('annotate.contents.title')}
          oninput={(event) => setTitle(section, event.currentTarget.value)}
        />
      {/if}

      {#if !section.children.length && !section.locked}
        <div class="contents__targets">
          <label>
            {$t('annotate.contents.from')}
            <select
              value={section.pages[0] ?? ''}
              onchange={(event) => setPages(section, event.currentTarget.value, section.pages.at(-1) ?? event.currentTarget.value)}
            >
              {#each canvases as canvas (canvas.id)}
                <option value={canvas.id}>{canvas.label}</option>
              {/each}
            </select>
          </label>
          <label>
            {$t('annotate.contents.to')}
            <select
              value={section.pages.at(-1) ?? ''}
              onchange={(event) => setPages(section, section.pages[0] ?? event.currentTarget.value, event.currentTarget.value)}
            >
              {#each canvases as canvas (canvas.id)}
                <option value={canvas.id}>{canvas.label}</option>
              {/each}
            </select>
          </label>
          <button
            type="button"
            class="contents__small"
            disabled={!currentCanvasId}
            onclick={() => currentCanvasId && setPages(section, currentCanvasId, currentCanvasId)}
            >{$t('annotate.contents.thisPage')}</button
          >
        </div>
      {/if}

      <div class="contents__actions">
        <button type="button" title={$t('annotate.contents.jump')} aria-label={$t('annotate.contents.jump')} onclick={() => onjump(section)}>
          <Locate size={15} aria-hidden="true" />
        </button>
        {#if !section.locked}
          <button
            type="button"
            title={$t('annotate.contents.addInside')}
            aria-label={$t('annotate.contents.addInside')}
            onclick={() => onchange(addSection(sections, section.children.length ? fresh() : newSection(), section.id))}
          >
            <Plus size={15} aria-hidden="true" />
          </button>
        {/if}
        <button type="button" title={$t('annotate.contents.up')} aria-label={$t('annotate.contents.up')} disabled={index === 0} onclick={() => onchange(moveSection(sections, section.id, -1))}>
          <ArrowUp size={15} aria-hidden="true" />
        </button>
        <button type="button" title={$t('annotate.contents.down')} aria-label={$t('annotate.contents.down')} disabled={index === siblings - 1} onclick={() => onchange(moveSection(sections, section.id, 1))}>
          <ArrowDown size={15} aria-hidden="true" />
        </button>
        <button type="button" title={$t('annotate.contents.indent')} aria-label={$t('annotate.contents.indent')} disabled={index === 0} onclick={() => onchange(indentSection(sections, section.id))}>
          <ListIndentIncrease size={15} aria-hidden="true" />
        </button>
        <button type="button" title={$t('annotate.contents.outdent')} aria-label={$t('annotate.contents.outdent')} disabled={depth === 0} onclick={() => onchange(outdentSection(sections, section.id))}>
          <ListIndentDecrease size={15} aria-hidden="true" />
        </button>
        <button type="button" title={$t('annotate.contents.delete')} aria-label={$t('annotate.contents.delete')} onclick={() => onchange(removeSection(sections, section.id))}>
          <Trash2 size={15} aria-hidden="true" />
        </button>
      </div>

      {#each own as problem, n (n)}
        <p class="contents__problem" class:contents__problem--warning={problem.level === 'warning'}>
          {$t(`annotate.contents.problems.${problem.kind}`)}
        </p>
      {/each}
    </div>

    {#if section.children.length}
      <ol class="contents__tree">
        {#each section.children as child, childIndex (child.id)}
          {@render node(child, childIndex, section.children.length, depth + 1)}
        {/each}
      </ol>
    {/if}
  </li>
{/snippet}

<style>
  .contents {
    display: flex;
    flex-direction: column;
    gap: 14px;
    min-height: 0;
    color: var(--viewer-text);
    font-size: 14px;
  }

  .contents__hint,
  .contents__empty,
  .contents__status {
    margin: 0;
    color: var(--viewer-muted);
    font-size: 13px;
    line-height: 1.4;
  }

  .contents__languages {
    display: flex;
    gap: 4px;
  }

  .contents__languages button {
    padding: 4px 10px;
    border: 1px solid var(--anno-input-border);
    border-radius: 999px;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: 12px;
    text-transform: uppercase;
    cursor: pointer;
  }

  .contents__languages button.active {
    border-color: var(--anno-accent);
    background: var(--anno-accent);
    color: var(--anno-on-accent);
  }

  .contents__tree {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .contents__tree .contents__tree {
    margin-top: 8px;
    padding-left: 14px;
    border-left: 2px solid var(--anno-dashed);
  }

  .contents__row {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px;
    border: 1px solid var(--viewer-panel-border);
    border-radius: 8px;
    background: var(--anno-raised);
  }

  .contents__row--problem {
    border-color: var(--viewer-danger);
  }

  input,
  select {
    box-sizing: border-box;
    min-width: 0;
    height: 32px;
    padding: 0 8px;
    border: 1px solid var(--anno-input-border);
    border-radius: 6px;
    background: var(--viewer-well-bg);
    color: inherit;
    font: inherit;
  }

  .contents__title {
    width: 100%;
    font-weight: 600;
  }

  .contents__name {
    margin: 0;
    font-weight: 600;
  }

  .contents__targets {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 8px;
  }

  .contents__targets label {
    display: flex;
    flex: 1 1 90px;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
    color: var(--viewer-muted);
    font-size: 12px;
  }

  .contents__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 2px;
  }

  .contents__actions button,
  .contents__small {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    min-height: 30px;
    padding: 0 8px;
    border: 1px solid transparent;
    border-radius: 6px;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: 12px;
    cursor: pointer;
  }

  .contents__small {
    border-color: var(--anno-input-border);
  }

  .contents__actions button:hover:not(:disabled),
  .contents__small:hover:not(:disabled) {
    background: var(--anno-tint);
  }

  button:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .contents__problem {
    margin: 0;
    color: var(--viewer-danger);
    font-size: 12px;
  }

  .contents__problem--warning {
    color: var(--viewer-muted);
  }

  .contents__footer {
    display: flex;
    gap: 8px;
  }

  .contents__add,
  .contents__save {
    display: inline-flex;
    flex: 1;
    align-items: center;
    justify-content: center;
    gap: 6px;
    height: 36px;
    border-radius: 8px;
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }

  .contents__add {
    border: 1px dashed var(--anno-dashed);
    background: transparent;
    color: inherit;
  }

  .contents__save {
    border: none;
    background: var(--anno-accent);
    color: var(--anno-on-accent);
  }
</style>
