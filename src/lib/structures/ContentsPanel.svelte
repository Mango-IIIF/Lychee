<script lang="ts">
  import {
    ArrowDown,
    ArrowUp,
    CircleAlert,
    ListIndentDecrease,
    ListIndentIncrease,
    Pencil,
    Plus,
    Trash2,
  } from '@lucide/svelte';
  import { t } from '../core/i18n';
  import {
    addChapterAt,
    addSection,
    flattenSections,
    indentSection,
    moveSection,
    newSection,
    outdentSection,
    pageSpan,
    removeSection,
    sortByTime,
    spanFrom,
    updateSection,
    type Section,
    type SectionProblem,
  } from '../annotations/structures';
  import { formatTime, parseTime } from '../annotations/time';

  /**
   * The table of contents, the same for a book and a recording: an outline of
   * chapters to go to, each with an edit button that opens it in place. A
   * chapter goes to its own pages (a book) or span (a recording), holds
   * chapters inside it, or both; a heading only holds them. A recording's
   * chapters keep to the order they play in.
   */
  interface Props {
    kind: 'image' | 'av';
    languages: string[];
    /** The language titles are shown in, in the outline. */
    language: string;
    sections: Section[];
    /** The chapter open for editing. */
    editingId?: string | null;
    /** The item's pages or recordings, in order. */
    canvases: { id: string; label: string }[];
    currentCanvasId: string | null;
    currentTime?: number;
    playbackReady?: boolean;
    problems: SectionProblem[];
    /** Changed since the last save. */
    dirty: boolean;
    status?: string;
    onchange: (sections: Section[]) => void;
    /** Shows a chapter's page, or plays it from its start. */
    ongo: (section: Section) => void;
    onsave: () => void;
  }

  let {
    kind,
    languages,
    language,
    sections,
    editingId = $bindable(null),
    canvases,
    currentCanvasId,
    currentTime = 0,
    playbackReady = false,
    problems,
    dirty,
    status = '',
    onchange,
    ongo,
    onsave,
  }: Props = $props();

  let canvasIds = $derived(canvases.map((canvas) => canvas.id));
  let canvasLabels = $derived(new Map(canvases.map((canvas) => [canvas.id, canvas.label])));
  let blocking = $derived(problems.some((problem) => problem.level === 'error'));
  const problemsOf = (id: string) => problems.filter((problem) => problem.sectionId === id);
  const hasError = (id: string) => problems.some((p) => p.sectionId === id && p.level === 'error');

  $effect(() => {
    if (editingId && !flattenSections(sections).some(({ section }) => section.id === editingId)) editingId = null;
  });

  /** The innermost chapter showing now: the page in view, or the span playing. */
  let currentId = $derived.by(() => {
    if (!currentCanvasId) return null;
    const showing = flattenSections(sections).filter(({ section }) =>
      kind === 'image'
        ? section.pages.includes(currentCanvasId)
        : section.time?.canvasId === currentCanvasId &&
          currentTime >= section.time.start &&
          (section.time.end == null || currentTime < section.time.end),
    );
    return showing.at(-1)?.section.id ?? null;
  });

  /* A chapter is a place to jump to, so the playhead is taken to the second. */
  const now = () => Math.round(currentTime);

  /* A recording's chapters keep to the order they play in; a book's to the order they are put in. */
  const commit = (next: Section[]) => onchange(kind === 'av' ? sortByTime(next, canvasIds) : next);
  const change = (id: string, fn: (section: Section) => Section) => commit(updateSection(sections, id, fn));

  /* ---------------------------------------------------------- titles */

  /** The title to show for a chapter: this language's, another's, or "untitled". */
  const nameOf = (section: Section) =>
    section.label[language]?.trim() ||
    Object.values(section.label).find((text) => text.trim()) ||
    $t('annotate.contents.untitled');

  /** The authoring languages, then any other the chapter came with, so none is hidden. */
  const titleLanguages = (section: Section) => [
    ...languages,
    ...Object.keys(section.label).filter((code) => !languages.includes(code)),
  ];

  const languageName = (code: string) => {
    if (code === 'none') return $t('annotate.contents.noLanguage');
    try {
      return new Intl.DisplayNames([code], { type: 'language' }).of(code) ?? code;
    } catch {
      return code;
    }
  };

  const setTitle = (section: Section, code: string, value: string) =>
    change(section.id, (s) => ({ ...s, label: { ...s.label, [code]: value } }));

  /* ---------------------------------------------------------- where it goes */

  /** Where the outline says a chapter goes: its pages, or where it starts. */
  const whereOf = (section: Section) => {
    if (section.time) return formatTime(section.time.start);
    if (!section.pages.length) return '';
    const first = canvasLabels.get(section.pages[0]) ?? '';
    return section.pages.length > 1 ? `${first}–${canvasLabels.get(section.pages.at(-1)!) ?? ''}` : first;
  };

  const isHeading = (section: Section) => !section.pages.length && !section.time;

  const setHeadingOnly = (section: Section, headingOnly: boolean) => {
    unreadable = {};
    if (headingOnly) return change(section.id, (s) => ({ ...s, pages: [], time: undefined }));
    const canvasId = currentCanvasId ?? canvasIds[0];
    if (!canvasId) return;
    change(section.id, (s) =>
      kind === 'image' ? { ...s, pages: [canvasId] } : { ...s, time: spanFrom(sections, canvasId, now()) },
    );
  };

  const setPages = (section: Section, from: string, to: string) =>
    change(section.id, (s) => ({ ...s, pages: pageSpan(canvasIds, from, to) }));

  const setTime = (section: Section, field: 'start' | 'end', value: number | null) => {
    unreadable = { ...unreadable, [field]: false };
    change(section.id, (s) => (s.time ? { ...s, time: { ...s.time, [field]: field === 'start' ? (value ?? 0) : value } } : s));
  };

  /* Fields holding text that isn't a time; the chapter keeps its last good one. */
  let unreadable: { start?: boolean; end?: boolean } = $state({});
  $effect(() => {
    void editingId;
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

  /* ---------------------------------------------------------- adding */

  /** A new chapter starts on the page in view, or at the playhead. */
  const fresh = (): Section =>
    newSection(
      !currentCanvasId
        ? {}
        : kind === 'image'
          ? { pages: [currentCanvasId] }
          : { time: spanFrom(sections, currentCanvasId, now()) },
    );

  const add = () => {
    if (kind === 'image') {
      const chapter = fresh();
      commit(addSection(sections, chapter));
      editingId = chapter.id;
      return;
    }
    if (!currentCanvasId) return;
    const result = addChapterAt(sections, currentCanvasId, now(), canvasIds);
    onchange(result.sections);
    editingId = result.id;
  };

  const addInside = (section: Section) => {
    const child = fresh();
    commit(addSection(sections, child, section.id));
    editingId = child.id;
  };

  const remove = (section: Section) => {
    commit(removeSection(sections, section.id));
    editingId = null;
  };

  const toggle = (section: Section) => (editingId = editingId === section.id ? null : section.id);

  /** Puts the cursor in a chapter's first field when it opens. */
  const focusFirst = (node: HTMLElement) => {
    node.querySelector<HTMLElement>('input, select, button')?.focus({ preventScroll: true });
    node.scrollIntoView?.({ block: 'nearest' });
  };
</script>

<section class="toc" aria-label={$t('annotate.contents.label')}>
  <p class="toc__muted">{$t(`annotate.contents.hint.${kind}`)}</p>

  {#if sections.length}
    <nav aria-label={$t('annotate.contents.outline')}>
      {@render tree(sections, 0)}
    </nav>
  {:else}
    <p class="toc__muted">{$t('annotate.contents.empty')}</p>
  {/if}

  <div class="toc__footer">
    <button type="button" class="toc__add" disabled={kind === 'av' && !currentCanvasId} onclick={add}>
      <Plus size={16} aria-hidden="true" />
      {kind === 'image' ? $t('annotate.contents.add.image') : $t('annotate.contents.add.av', { time: formatTime(currentTime) })}
    </button>
    <button type="button" class="toc__save" disabled={!dirty || blocking} onclick={onsave}>
      {$t('annotate.contents.save')}
    </button>
  </div>
  {#if blocking}
    <p class="toc__muted">{$t('annotate.contents.fixFirst')}</p>
  {:else if status}
    <p class="toc__muted" role="status">{status}</p>
  {/if}
</section>

{#snippet tree(list: Section[], depth: number)}
  <ol class="toc__tree">
    {#each list as section, index (section.id)}
      {@const name = nameOf(section)}
      {@const open = editingId === section.id}
      <li>
        <div
          class="toc__row"
          class:toc__row--open={open}
          class:toc__row--current={currentId === section.id}
          class:toc__row--problem={hasError(section.id)}
        >
          <button
            type="button"
            class="toc__go"
            aria-current={currentId === section.id ? 'location' : undefined}
            title={$t(`annotate.contents.go.${kind}`, { title: name })}
            onclick={() => ongo(section)}
          >
            <span class="toc__where">{whereOf(section)}</span>
            <span class="toc__name">{name}</span>
            {#if hasError(section.id)}
              <CircleAlert size={14} aria-hidden="true" />
              <span class="toc__sr">({$t('annotate.contents.needsFix')})</span>
            {/if}
          </button>
          <button
            type="button"
            class="toc__icon"
            aria-expanded={open}
            aria-label={$t('annotate.contents.edit', { title: name })}
            title={$t('annotate.contents.edit', { title: name })}
            onclick={() => toggle(section)}
          >
            <Pencil size={14} aria-hidden="true" />
          </button>
        </div>
        {#if open}
          {@render editor(section, index, list.length, depth)}
        {/if}
        {#if section.children.length}
          {@render tree(section.children, depth + 1)}
        {/if}
      </li>
    {/each}
  </ol>
{/snippet}

{#snippet editor(section: Section, index: number, siblings: number, depth: number)}
  {@const own = problemsOf(section.id)}
  <div class="toc__editor" class:toc__editor--problem={own.some((p) => p.level === 'error')} use:focusFirst>
    {#if section.locked}
      <p class="toc__muted">{$t('annotate.contents.locked')}</p>
    {:else}
      <div class="toc__titles">
        {#each titleLanguages(section) as code (code)}
          <label class="toc__field">
            <span>{$t('annotate.contents.titleIn', { language: languageName(code) })}</span>
            <input
              class="toc__title"
              type="text"
              lang={code === 'none' ? undefined : code}
              value={section.label[code] ?? ''}
              oninput={(event) => setTitle(section, code, event.currentTarget.value)}
            />
          </label>
        {/each}
      </div>

      <label class="toc__check">
        <input
          type="checkbox"
          checked={isHeading(section)}
          onchange={(event) => setHeadingOnly(section, event.currentTarget.checked)}
        />
        {$t(`annotate.contents.headingOnly.${kind}`)}
      </label>

      {#if isHeading(section)}
        {#if !section.children.length}
          <p class="toc__muted">{$t('annotate.contents.headingHint')}</p>
        {/if}
      {:else if kind === 'image'}
        <div class="toc__targets">
          <label class="toc__field">
            <span>{$t('annotate.contents.from')}</span>
            <select
              value={section.pages[0] ?? ''}
              onchange={(event) => setPages(section, event.currentTarget.value, section.pages.at(-1) ?? event.currentTarget.value)}
            >
              {#each canvases as canvas (canvas.id)}
                <option value={canvas.id}>{canvas.label}</option>
              {/each}
            </select>
          </label>
          <label class="toc__field">
            <span>{$t('annotate.contents.to')}</span>
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
            class="toc__small"
            disabled={!currentCanvasId}
            onclick={() => currentCanvasId && setPages(section, currentCanvasId, currentCanvasId)}
            >{$t('annotate.contents.thisPage')}</button
          >
        </div>
      {:else if section.time}
        {@const time = section.time}
        <div class="toc__times">
          <label class="toc__field">
            <span>{$t('annotate.contents.start')}</span>
            <input
              type="text"
              inputmode="decimal"
              placeholder="0:00"
              value={formatTime(time.start, { fraction: true })}
              aria-invalid={unreadable.start ? 'true' : undefined}
              onchange={(event) => typeTime(section, 'start', event.currentTarget)}
            />
          </label>
          <button
            type="button"
            class="toc__small"
            disabled={!playbackReady || time.canvasId !== currentCanvasId}
            onclick={() => setTime(section, 'start', now())}>{$t('annotate.contents.startHere')}</button
          >
          <label class="toc__field">
            <span>{$t('annotate.contents.end')}</span>
            <input
              type="text"
              inputmode="decimal"
              value={time.end == null ? '' : formatTime(time.end, { fraction: true })}
              placeholder={$t('annotate.contents.toEnd')}
              aria-invalid={unreadable.end ? 'true' : undefined}
              onchange={(event) => typeTime(section, 'end', event.currentTarget)}
            />
          </label>
          <button
            type="button"
            class="toc__small"
            disabled={!playbackReady || time.canvasId !== currentCanvasId}
            onclick={() => setTime(section, 'end', now())}>{$t('annotate.contents.endHere')}</button
          >
        </div>
        {#if unreadable.start || unreadable.end}
          <p class="toc__problem">{$t('annotate.contents.timeFormat')}</p>
        {/if}
      {/if}
    {/if}

    {#each own as problem, n (n)}
      <p class="toc__problem" class:toc__problem--warning={problem.level === 'warning'}>
        {$t(`annotate.contents.problems.${problem.kind}`)}
      </p>
    {/each}

    <div class="toc__actions">
      {#if !section.locked}
        <button
          type="button"
          class="toc__icon"
          title={$t('annotate.contents.addInside')}
          aria-label={$t('annotate.contents.addInside')}
          onclick={() => addInside(section)}
        >
          <Plus size={15} aria-hidden="true" />
        </button>
      {/if}
      {#if kind === 'image'}
        <button
          type="button"
          class="toc__icon"
          title={$t('annotate.contents.up')}
          aria-label={$t('annotate.contents.up')}
          disabled={index === 0}
          onclick={() => commit(moveSection(sections, section.id, -1))}
        >
          <ArrowUp size={15} aria-hidden="true" />
        </button>
        <button
          type="button"
          class="toc__icon"
          title={$t('annotate.contents.down')}
          aria-label={$t('annotate.contents.down')}
          disabled={index === siblings - 1}
          onclick={() => commit(moveSection(sections, section.id, 1))}
        >
          <ArrowDown size={15} aria-hidden="true" />
        </button>
      {/if}
      <button
        type="button"
        class="toc__icon"
        title={$t('annotate.contents.indent')}
        aria-label={$t('annotate.contents.indent')}
        disabled={index === 0}
        onclick={() => commit(indentSection(sections, section.id))}
      >
        <ListIndentIncrease size={15} aria-hidden="true" />
      </button>
      <button
        type="button"
        class="toc__icon"
        title={$t('annotate.contents.outdent')}
        aria-label={$t('annotate.contents.outdent')}
        disabled={depth === 0}
        onclick={() => commit(outdentSection(sections, section.id))}
      >
        <ListIndentDecrease size={15} aria-hidden="true" />
      </button>
      <button
        type="button"
        class="toc__icon"
        title={$t('annotate.contents.delete')}
        aria-label={$t('annotate.contents.delete')}
        onclick={() => remove(section)}
      >
        <Trash2 size={15} aria-hidden="true" />
      </button>
      <button type="button" class="toc__small toc__done" onclick={() => (editingId = null)}>
        {$t('annotate.contents.done')}
      </button>
    </div>
  </div>
{/snippet}

<style>
  .toc {
    display: flex;
    flex-direction: column;
    gap: 14px;
    min-height: 0;
    color: var(--viewer-text);
    font-size: 14px;
  }

  .toc__muted {
    margin: 0;
    color: var(--viewer-muted);
    font-size: 13px;
    line-height: 1.4;
  }

  .toc__tree {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .toc__tree .toc__tree {
    margin-top: 2px;
    padding-left: 14px;
    border-left: 2px solid var(--anno-dashed);
  }

  .toc__row {
    display: flex;
    align-items: center;
    gap: 2px;
    border: 1px solid transparent;
    border-radius: 6px;
  }

  .toc__row:hover,
  .toc__row--current {
    background: var(--anno-tint);
  }

  .toc__row--open {
    border-color: var(--anno-accent);
    background: var(--anno-tint);
  }

  .toc__go {
    display: flex;
    flex: 1;
    align-items: center;
    gap: 10px;
    min-width: 0;
    padding: 6px 8px;
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .toc__row--current .toc__name {
    font-weight: 600;
  }

  .toc__where {
    flex: none;
    min-width: 4.5em;
    max-width: 40%;
    overflow: hidden;
    color: var(--viewer-muted);
    font-variant-numeric: tabular-nums;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .toc__name {
    flex: 1;
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .toc__row--problem .toc__go {
    color: var(--viewer-danger);
  }

  .toc__sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }

  .toc__editor {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin: 4px 0 6px;
    padding: 12px;
    border: 1px solid var(--viewer-panel-border);
    border-radius: 8px;
    background: var(--anno-raised);
  }

  .toc__editor--problem {
    border-color: var(--viewer-danger);
  }

  .toc__titles {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .toc__field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }

  .toc__field > span {
    color: var(--viewer-muted);
    font-size: 12px;
  }

  input[type='text'],
  select {
    box-sizing: border-box;
    width: 100%;
    min-width: 0;
    height: 32px;
    padding: 0 8px;
    border: 1px solid var(--anno-input-border);
    border-radius: 6px;
    background: var(--viewer-well-bg);
    color: inherit;
    font: inherit;
  }

  .toc__title {
    font-weight: 600;
  }

  .toc__check {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    cursor: pointer;
  }

  .toc__targets {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 8px;
  }

  .toc__targets .toc__field {
    flex: 1 1 90px;
  }

  .toc__times {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: end;
    gap: 8px;
  }

  .toc__actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 2px;
  }

  .toc__icon,
  .toc__small {
    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;
    gap: 4px;
    min-width: 30px;
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

  .toc__small {
    border-color: var(--anno-input-border);
  }

  .toc__done {
    margin-left: auto;
  }

  .toc__icon:hover:not(:disabled),
  .toc__small:hover:not(:disabled) {
    background: var(--anno-tint);
  }

  button:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .toc__problem {
    margin: 0;
    color: var(--viewer-danger);
    font-size: 12px;
  }

  .toc__problem--warning {
    color: var(--viewer-muted);
  }

  .toc__footer {
    display: flex;
    gap: 8px;
  }

  .toc__add,
  .toc__save {
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

  .toc__add {
    border: 1px dashed var(--anno-dashed);
    background: transparent;
    color: inherit;
  }

  .toc__save {
    border: none;
    background: var(--anno-accent);
    color: var(--anno-on-accent);
  }
</style>
