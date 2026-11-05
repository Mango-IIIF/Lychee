<script lang="ts">
  import { ListIndentDecrease, ListIndentIncrease, Play, Plus, Trash2 } from '@lucide/svelte';
  import { t } from '../core/i18n';
  import {
    addChapterAt,
    addSection,
    findSection,
    indentSection,
    newSection,
    outdentSection,
    removeSection,
    sectionPath,
    sortByTime,
    updateSection,
    type Section,
    type SectionProblem,
  } from '../annotations/structures';
  import { formatTime, parseTime } from '../annotations/time';

  /**
   * A recording's chapters: an outline to pick one from, and the one picked to
   * edit. They take the place of the player's own Chapters tab, and keep to the
   * order they play in.
   */
  interface Props {
    languages: string[];
    language: string;
    sections: Section[];
    /** The chapter being edited. */
    selectedId: string | null;
    /** The item's recordings in order. */
    canvases: { id: string; label: string }[];
    currentCanvasId: string | null;
    currentTime: number;
    playbackReady: boolean;
    problems: SectionProblem[];
    /** Changed since the last save. */
    dirty: boolean;
    status?: string;
    onchange: (sections: Section[]) => void;
    onplay: (section: Section) => void;
    onsave: () => void;
  }

  let {
    languages,
    language = $bindable(),
    sections,
    selectedId = $bindable(),
    canvases,
    currentCanvasId,
    currentTime,
    playbackReady,
    problems,
    dirty,
    status = '',
    onchange,
    onplay,
    onsave,
  }: Props = $props();

  let canvasIds = $derived(canvases.map((canvas) => canvas.id));
  let blocking = $derived(problems.some((problem) => problem.level === 'error'));
  let path = $derived(selectedId ? sectionPath(sections, selectedId) : []);
  let selected = $derived(path.at(-1));
  let own = $derived(selected ? problems.filter((problem) => problem.sectionId === selected.id) : []);
  /* Chapters with errors, other than this one, to go and fix. */
  let elsewhere = $derived(
    [...new Set(problems.filter((p) => p.level === 'error' && p.sectionId !== selectedId).map((p) => p.sectionId))]
      .map((id) => findSection(sections, id))
      .filter((section): section is Section => Boolean(section)),
  );

  $effect(() => {
    if (selectedId && !selected) selectedId = null;
  });

  /* A chapter is a place to jump to, so the playhead is taken to the second. */
  const now = () => Math.round(currentTime);

  const commit = (next: Section[]) => onchange(sortByTime(next, canvasIds));
  const change = (id: string, fn: (section: Section) => Section) => commit(updateSection(sections, id, fn));

  const titleOf = (section: Section) => section.label[language] ?? '';
  /** The title to show for a chapter: this language's, another's, or "untitled". */
  const nameOf = (section: Section) =>
    titleOf(section).trim() ||
    Object.values(section.label).find((text) => text.trim()) ||
    $t('annotate.contents.chapter.untitled');
  const otherTitle = (section: Section) =>
    Object.entries(section.label).find(([lang, text]) => lang !== language && text.trim())?.[1] ?? '';

  const setTitle = (section: Section, value: string) =>
    change(section.id, (s) => ({ ...s, label: { ...s.label, [language]: value } }));

  const setTime = (section: Section, field: 'start' | 'end', value: number | null) => {
    unreadable = { ...unreadable, [field]: false };
    change(section.id, (s) => (s.time ? { ...s, time: { ...s.time, [field]: field === 'start' ? (value ?? 0) : value } } : s));
  };

  /* Fields holding text that isn't a time; the chapter keeps its last good one. */
  let unreadable: { start?: boolean; end?: boolean } = $state({});
  $effect(() => {
    void selectedId;
    unreadable = {};
  });

  const typeTime = (section: Section, field: 'start' | 'end', input: HTMLInputElement) => {
    const text = input.value.trim();
    const value = text === '' ? (field === 'start' ? 0 : null) : parseTime(text);
    unreadable = { ...unreadable, [field]: value === null && text !== '' };
    if (value === null && text !== '') return;
    setTime(section, field, value);
    /* Shown back the usual way, so `3725` reads `1:02:05`. */
    input.value = value === null ? '' : formatTime(value, { fraction: true });
  };

  const addAtPlayhead = () => {
    if (!currentCanvasId) return;
    const result = addChapterAt(sections, currentCanvasId, now(), canvasIds);
    onchange(result.sections);
    selectedId = result.id;
  };

  const addInside = (section: Section) => {
    const child = newSection();
    commit(addSection(sections, child, section.id));
    selectedId = child.id;
  };

  const remove = (section: Section) => {
    commit(removeSection(sections, section.id));
    selectedId = null;
  };

  let siblingIndex = $derived.by(() => {
    if (!selected) return -1;
    const siblings = path.length > 1 ? path[path.length - 2].children : sections;
    return siblings.findIndex((s) => s.id === selected.id);
  });
  let canIndent = $derived(
    siblingIndex > 0 && !(path.length > 1 ? path[path.length - 2].children : sections)[siblingIndex - 1]?.locked,
  );
</script>

<section class="chapters" aria-label={$t('annotate.contents.label')}>
  <p class="chapters__hint">{$t('annotate.contents.chapter.hint')}</p>

  {#if languages.length > 1}
    <div class="chapters__languages" role="tablist" aria-label={$t('annotate.sidebar.language')}>
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

  {#if !sections.length}
    <p class="chapters__muted">{$t('annotate.contents.chapter.empty')}</p>
  {:else}
    <nav class="chapters__outline" aria-label={$t('annotate.contents.chapter.outline')}>
      {@render outline(sections)}
    </nav>
  {/if}

  {#if selected}
    {@const chapter = selected}
    <div class="chapters__card" class:chapters__card--problem={own.some((p) => p.level === 'error')}>
      {#if path.length > 1}
        <nav class="chapters__path" aria-label={$t('annotate.contents.chapter.path')}>
          {#each path.slice(0, -1) as parent (parent.id)}
            <button type="button" onclick={() => (selectedId = parent.id)}>{nameOf(parent)}</button>
            <span aria-hidden="true">›</span>
          {/each}
        </nav>
      {/if}

      {#if chapter.locked}
        <p class="chapters__name">{nameOf(chapter)}</p>
        <p class="chapters__muted">{$t('annotate.contents.locked')}</p>
      {:else}
        <input
          class="chapters__title"
          type="text"
          value={titleOf(chapter)}
          placeholder={otherTitle(chapter) || $t('annotate.contents.chapter.title')}
          aria-label={$t('annotate.contents.chapter.title')}
          oninput={(event) => setTitle(chapter, event.currentTarget.value)}
        />

        {#if chapter.children.length}
          <p class="chapters__muted">{$t('annotate.contents.chapter.group')}</p>
        {:else if chapter.time}
          {@const time = chapter.time}
          <div class="chapters__times">
            <label>
              {$t('annotate.contents.start')}
              <input
                type="text"
                inputmode="decimal"
                placeholder="0:00"
                value={formatTime(time.start, { fraction: true })}
                aria-invalid={unreadable.start ? 'true' : undefined}
                onchange={(event) => typeTime(chapter, 'start', event.currentTarget)}
              />
            </label>
            <button
              type="button"
              class="chapters__small"
              disabled={!playbackReady || time.canvasId !== currentCanvasId}
              onclick={() => setTime(chapter, 'start', now())}>{$t('annotate.contents.chapter.startHere')}</button
            >
            <label>
              {$t('annotate.contents.end')}
              <input
                type="text"
                inputmode="decimal"
                value={time.end == null ? '' : formatTime(time.end, { fraction: true })}
                placeholder={$t('annotate.contents.toEnd')}
                aria-invalid={unreadable.end ? 'true' : undefined}
                onchange={(event) => typeTime(chapter, 'end', event.currentTarget)}
              />
            </label>
            <button
              type="button"
              class="chapters__small"
              disabled={!playbackReady || time.canvasId !== currentCanvasId}
              onclick={() => setTime(chapter, 'end', now())}>{$t('annotate.contents.chapter.endHere')}</button
            >
          </div>
          {#if unreadable.start || unreadable.end}
            <p class="chapters__problem">{$t('annotate.contents.chapter.timeFormat')}</p>
          {/if}
        {/if}
      {/if}

      <div class="chapters__actions">
        <button type="button" onclick={() => onplay(chapter)}>
          <Play size={15} aria-hidden="true" />
          {$t('annotate.contents.chapter.play')}
        </button>
        {#if !chapter.locked}
          <button
            type="button"
            title={$t('annotate.contents.chapter.addInside')}
            aria-label={$t('annotate.contents.chapter.addInside')}
            onclick={() => addInside(chapter)}
          >
            <Plus size={15} aria-hidden="true" />
          </button>
        {/if}
        <button
          type="button"
          title={$t('annotate.contents.chapter.indent')}
          aria-label={$t('annotate.contents.chapter.indent')}
          disabled={!canIndent}
          onclick={() => commit(indentSection(sections, chapter.id))}
        >
          <ListIndentIncrease size={15} aria-hidden="true" />
        </button>
        <button
          type="button"
          title={$t('annotate.contents.chapter.outdent')}
          aria-label={$t('annotate.contents.chapter.outdent')}
          disabled={path.length < 2}
          onclick={() => commit(outdentSection(sections, chapter.id))}
        >
          <ListIndentDecrease size={15} aria-hidden="true" />
        </button>
        <button
          type="button"
          title={$t('annotate.contents.chapter.delete')}
          aria-label={$t('annotate.contents.chapter.delete')}
          onclick={() => remove(chapter)}
        >
          <Trash2 size={15} aria-hidden="true" />
        </button>
      </div>

      {#each own as problem, n (n)}
        <p class="chapters__problem" class:chapters__problem--warning={problem.level === 'warning'}>
          {$t(`annotate.contents.problems.${problem.kind}`)}
        </p>
      {/each}
    </div>
  {/if}

  {#if elsewhere.length}
    <div class="chapters__attention">
      <p class="chapters__muted">{$t('annotate.contents.chapter.attention')}</p>
      {#each elsewhere as section (section.id)}
        <button type="button" class="chapters__small" onclick={() => (selectedId = section.id)}>{nameOf(section)}</button>
      {/each}
    </div>
  {/if}

  <div class="chapters__footer">
    <button type="button" class="chapters__add" disabled={!currentCanvasId} onclick={addAtPlayhead}>
      <Plus size={16} aria-hidden="true" />
      {$t('annotate.contents.chapter.addAt', { time: formatTime(currentTime) })}
    </button>
    <button type="button" class="chapters__save" disabled={!dirty || blocking} onclick={onsave}>
      {$t('annotate.contents.save')}
    </button>
  </div>
  {#if blocking}
    <p class="chapters__muted">{$t('annotate.contents.fixFirst')}</p>
  {:else if status}
    <p class="chapters__muted" role="status">{status}</p>
  {/if}
</section>

{#snippet outline(list: Section[])}
  <ol>
    {#each list as section (section.id)}
      <li>
        <button
          type="button"
          class="chapters__row"
          class:chapters__row--problem={problems.some((p) => p.sectionId === section.id && p.level === 'error')}
          aria-current={section.id === selectedId ? 'true' : undefined}
          onclick={() => {
            selectedId = section.id;
            onplay(section);
          }}
        >
          <time>{section.time ? formatTime(section.time.start) : ''}</time>
          <span>{nameOf(section)}</span>
        </button>
        {#if section.children.length}
          {@render outline(section.children)}
        {/if}
      </li>
    {/each}
  </ol>
{/snippet}

<style>
  .chapters {
    display: flex;
    flex-direction: column;
    gap: 14px;
    min-height: 0;
    color: var(--viewer-text);
    font-size: 14px;
  }

  .chapters__hint,
  .chapters__muted {
    margin: 0;
    color: var(--viewer-muted);
    font-size: 13px;
    line-height: 1.4;
  }

  .chapters__languages {
    display: flex;
    gap: 4px;
  }

  .chapters__languages button {
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

  .chapters__languages button.active {
    border-color: var(--anno-accent);
    background: var(--anno-accent);
    color: var(--anno-on-accent);
  }

  .chapters__outline ol {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .chapters__outline ol ol {
    margin-top: 2px;
    padding-left: 14px;
    border-left: 2px solid var(--anno-dashed);
  }

  .chapters__row {
    display: flex;
    gap: 10px;
    width: 100%;
    padding: 6px 8px;
    border: 1px solid transparent;
    border-radius: 6px;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .chapters__row time {
    flex: none;
    min-width: 4.5em;
    color: var(--viewer-muted);
    font-variant-numeric: tabular-nums;
  }

  .chapters__row:hover {
    background: var(--anno-tint);
  }

  .chapters__row[aria-current='true'] {
    border-color: var(--anno-accent);
    background: var(--anno-tint);
  }

  .chapters__row--problem span {
    color: var(--viewer-danger);
  }

  .chapters__card {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px;
    border: 1px solid var(--viewer-panel-border);
    border-radius: 8px;
    background: var(--anno-raised);
  }

  .chapters__card--problem {
    border-color: var(--viewer-danger);
  }

  .chapters__path {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
    color: var(--viewer-muted);
    font-size: 12px;
  }

  .chapters__path button {
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    text-decoration: underline;
    cursor: pointer;
  }

  .chapters__name {
    margin: 0;
    font-weight: 600;
  }

  input {
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

  .chapters__title {
    width: 100%;
    font-weight: 600;
  }

  .chapters__times {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: end;
    gap: 8px;
  }

  .chapters__times label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
    color: var(--viewer-muted);
    font-size: 12px;
  }

  .chapters__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 2px;
  }

  .chapters__actions button,
  .chapters__small {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    min-height: 32px;
    padding: 0 8px;
    border: 1px solid transparent;
    border-radius: 6px;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: 12px;
    cursor: pointer;
  }

  .chapters__small {
    border-color: var(--anno-input-border);
  }

  .chapters__actions button:hover:not(:disabled),
  .chapters__small:hover:not(:disabled) {
    background: var(--anno-tint);
  }

  button:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .chapters__problem {
    margin: 0;
    color: var(--viewer-danger);
    font-size: 12px;
  }

  .chapters__problem--warning {
    color: var(--viewer-muted);
  }

  .chapters__attention {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }

  .chapters__attention .chapters__muted {
    width: 100%;
  }

  .chapters__footer {
    display: flex;
    gap: 8px;
  }

  .chapters__add,
  .chapters__save {
    display: inline-flex;
    flex: 1;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: 36px;
    border-radius: 8px;
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }

  .chapters__add {
    border: 1px dashed var(--anno-dashed);
    background: transparent;
    color: inherit;
  }

  .chapters__save {
    border: none;
    background: var(--anno-accent);
    color: var(--anno-on-accent);
  }
</style>
