<script lang="ts">
  import {
    ArrowDown,
    ArrowUp,
    Check,
    CircleAlert,
    ListIndentDecrease,
    ListIndentIncrease,
    ListTree,
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
    /** Maximum number of levels that can be authored; existing deeper trees are preserved. */
    maxLevels?: number;
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
    /** Shows a page while an image chapter is being authored. */
    oncanvaschange?: (canvasId: string) => void;
    onsave: () => void;
  }

  let {
    kind,
    maxLevels = 2,
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
    oncanvaschange,
    onsave,
  }: Props = $props();

  /** A newly created chapter stays neutral until typed into, closed, or saved. */
  let freshId = $state<string | null>(null);
  let attemptedSave = $state(false);

  let canvasIds = $derived(canvases.map((canvas) => canvas.id));
  let canvasLabels = $derived(new Map(canvases.map((canvas) => [canvas.id, canvas.label])));
  let blocking = $derived(problems.some((problem) => problem.level === 'error'));

  const showProblem = (id: string) => attemptedSave || id !== freshId;
  const problemsOf = (id: string) => problems.filter((problem) => problem.sectionId === id);
  const visibleProblemsOf = (id: string) => (showProblem(id) ? problemsOf(id) : []);
  const hasVisibleError = (id: string) =>
    showProblem(id) && problems.some((p) => p.sectionId === id && p.level === 'error');
  let visibleBlocking = $derived(
    problems.some((problem) => problem.level === 'error' && showProblem(problem.sectionId)),
  );

  $effect(() => {
    if (editingId && !flattenSections(sections).some(({ section }) => section.id === editingId)) {
      editingId = null;
    }
    if (freshId && editingId !== freshId) {
      freshId = null;
    }
  });

  $effect(() => {
    if (!dirty) attemptedSave = false;
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

  const setTitle = (section: Section, code: string, value: string) => {
    if (section.id === freshId) freshId = null;
    change(section.id, (s) => ({ ...s, label: { ...s.label, [code]: value } }));
  };

  /* ---------------------------------------------------------- where it goes */

  /** Where the outline says a chapter goes: its pages, or where it starts. */
  const whereOf = (section: Section) => {
    if (section.time) return formatTime(section.time.start);
    if (!section.pages.length) return '';
    const first = canvasLabels.get(section.pages[0]) ?? '';
    return section.pages.length > 1 ? `${first} – ${canvasLabels.get(section.pages.at(-1)!) ?? ''}` : first;
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

  const choosePage = (section: Section, field: 'from' | 'to', canvasId: string) => {
    if (field === 'from') setPages(section, canvasId, section.pages.at(-1) ?? canvasId);
    else setPages(section, section.pages[0] ?? canvasId, canvasId);
    oncanvaschange?.(canvasId);
  };

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
    attemptedSave = false;
    if (kind === 'image') {
      const chapter = fresh();
      commit(addSection(sections, chapter));
      freshId = chapter.id;
      editingId = chapter.id;
      return;
    }
    if (!currentCanvasId) return;
    const result = addChapterAt(sections, currentCanvasId, now(), canvasIds);
    onchange(result.sections);
    freshId = result.id;
    editingId = result.id;
  };

  const addInside = (section: Section, depth: number) => {
    if (depth + 1 >= maxLevels) return;
    attemptedSave = false;
    const child = fresh();
    commit(addSection(sections, child, section.id));
    freshId = child.id;
    editingId = child.id;
  };

  /** Number of levels occupied by this chapter and its deepest descendant. */
  const levelsOf = (section: Section): number =>
    1 + (section.children.length ? Math.max(...section.children.map(levelsOf)) : 0);

  const canAddInside = (depth: number) => depth + 1 < maxLevels;
  const canIndent = (section: Section, index: number, depth: number) =>
    index > 0 && depth + levelsOf(section) < maxLevels;

  const indent = (section: Section, index: number, depth: number) => {
    if (!canIndent(section, index, depth)) return;
    commit(indentSection(sections, section.id));
  };

  const remove = (section: Section) => {
    if (freshId === section.id) freshId = null;
    commit(removeSection(sections, section.id));
    editingId = null;
  };

  const toggle = (section: Section) => {
    if (editingId === section.id) {
      closeEditor();
    } else {
      freshId = null;
      editingId = section.id;
    }
  };

  const closeEditor = () => {
    freshId = null;
    editingId = null;
  };

  const handleSave = () => {
    attemptedSave = true;
    freshId = null;
    if (blocking) {
      const firstError = problems.find((p) => p.level === 'error');
      if (firstError) editingId = firstError.sectionId;
      return;
    }
    attemptedSave = false;
    onsave();
  };

  const onTitleKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      closeEditor();
    }
  };

  /** Puts the cursor in a chapter's first input when it opens (or first button if locked). */
  const focusFirst = (node: HTMLElement) => {
    (node.querySelector<HTMLElement>('input, select') ?? node.querySelector<HTMLElement>('button'))?.focus({
      preventScroll: true,
    });
    node.scrollIntoView?.({ block: 'nearest' });
  };
</script>

<section class="toc" aria-label={$t('annotate.contents.label')}>
  {#if !sections.length}
    <div class="toc__empty">
      <p class="toc__empty-prompt">
        <ListTree size={18} aria-hidden="true" />
        <span>{$t(`annotate.contents.hint.${kind}`)}</span>
      </p>
      <button type="button" class="toc__primary" disabled={kind === 'av' && !currentCanvasId} onclick={add}>
        <Plus size={16} aria-hidden="true" />
        {kind === 'image' ? $t('annotate.contents.add.image') : $t('annotate.contents.add.av', { time: formatTime(currentTime) })}
      </button>
    </div>
  {:else}
    <p class="toc__muted">{$t(`annotate.contents.hint.${kind}`)}</p>

    <nav aria-label={$t('annotate.contents.outline')}>
      {@render tree(sections, 0)}
    </nav>

    <button type="button" class="toc__add" disabled={kind === 'av' && !currentCanvasId} onclick={add}>
      <Plus size={15} aria-hidden="true" />
      {kind === 'image' ? $t('annotate.contents.add.image') : $t('annotate.contents.add.av', { time: formatTime(currentTime) })}
    </button>
  {/if}

  {#if dirty}
    <div class="toc__save-bar" class:toc__save-bar--problem={visibleBlocking}>
      <span class="toc__save-note">
        {visibleBlocking ? $t('annotate.contents.fixFirst') : $t('annotate.contents.unsaved')}
      </span>
      <button type="button" class="toc__save" onclick={handleSave}>
        {$t('annotate.contents.save')}
      </button>
    </div>
  {:else if status}
    <p class="toc__status" role="status">
      <Check size={14} aria-hidden="true" />
      {status}
    </p>
  {/if}
</section>

{#snippet tree(list: Section[], depth: number)}
  <ol class="toc__tree">
    {#each list as section, index (section.id)}
      {@const name = nameOf(section)}
      {@const open = editingId === section.id}
      {@const where = whereOf(section)}
      <li>
        {#if !open}
          <div
            class="toc__row"
            class:toc__row--current={currentId === section.id}
            class:toc__row--problem={hasVisibleError(section.id)}
            class:toc__row--parent={section.children.length > 0}
            class:toc__row--heading={isHeading(section)}
          >
            <button
              type="button"
              class="toc__go"
              aria-current={currentId === section.id ? 'location' : undefined}
              title={$t(`annotate.contents.go.${kind}`, { title: name })}
              onclick={() => ongo(section)}
            >
              <span class="toc__name-row">
                <span class="toc__name">{name}</span>
                {#if hasVisibleError(section.id)}
                  <CircleAlert size={14} aria-hidden="true" />
                  <span class="toc__sr">({$t('annotate.contents.needsFix')})</span>
                {/if}
              </span>
              {#if where || isHeading(section)}
                <span class="toc__where">{where || $t('annotate.contents.headingBadge')}</span>
              {/if}
            </button>
            <div class="toc__row-actions">
              {#if kind === 'image' && list.length > 1}
                <button
                  type="button"
                  class="toc__icon toc__row-reorder"
                  title={$t('annotate.contents.up')}
                  aria-label={$t('annotate.contents.up')}
                  disabled={index === 0}
                  onclick={() => commit(moveSection(sections, section.id, -1))}
                >
                  <ArrowUp size={13} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  class="toc__icon toc__row-reorder"
                  title={$t('annotate.contents.down')}
                  aria-label={$t('annotate.contents.down')}
                  disabled={index === list.length - 1}
                  onclick={() => commit(moveSection(sections, section.id, 1))}
                >
                  <ArrowDown size={13} aria-hidden="true" />
                </button>
              {/if}
              <button
                type="button"
                class="toc__icon"
                aria-expanded="false"
                aria-label={$t('annotate.contents.edit', { title: name })}
                title={$t('annotate.contents.edit', { title: name })}
                onclick={() => toggle(section)}
              >
                <Pencil size={14} aria-hidden="true" />
              </button>
            </div>
          </div>
        {:else}
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
  {@const own = visibleProblemsOf(section.id)}
  <div class="toc__card" class:toc__card--problem={own.some((p) => p.level === 'error')} use:focusFirst>
    <div class="toc__card-head">
      <span class="toc__card-eyebrow">
        {section.id === freshId ? $t('annotate.contents.editingNew') : $t('annotate.contents.editingChapter')}
      </span>
      <button
        type="button"
        class="toc__icon toc__delete"
        title={$t('annotate.contents.delete')}
        aria-label={$t('annotate.contents.delete')}
        onclick={() => remove(section)}
      >
        <Trash2 size={14} aria-hidden="true" />
      </button>
    </div>

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
              placeholder={$t('annotate.contents.titlePlaceholder')}
              value={section.label[code] ?? ''}
              oninput={(event) => setTitle(section, code, event.currentTarget.value)}
              onkeydown={onTitleKeydown}
            />
          </label>
        {/each}
      </div>

      {#if isHeading(section)}
        {#if !section.children.length}
          <p class="toc__muted">{$t('annotate.contents.headingHint')}</p>
        {/if}
      {:else if kind === 'image'}
        <div class="toc__page-rows">
          <div class="toc__page-row">
            <label class="toc__field">
              <span>{$t('annotate.contents.from')}</span>
              <select
                value={section.pages[0] ?? ''}
                onchange={(event) => choosePage(section, 'from', event.currentTarget.value)}
              >
                {#each canvases as canvas (canvas.id)}
                  <option value={canvas.id}>{canvas.label}</option>
                {/each}
              </select>
            </label>
            <button
              type="button"
              class="toc__small"
              disabled={!currentCanvasId || section.pages[0] === currentCanvasId}
              title={$t('annotate.contents.useCurrentPage')}
              aria-label={`${$t('annotate.contents.from')}: ${$t('annotate.contents.useCurrentPage')}`}
              onclick={() => currentCanvasId && setPages(section, currentCanvasId, section.pages.at(-1) ?? currentCanvasId)}
            >
              {$t('annotate.contents.useCurrent')}
            </button>
          </div>
          <div class="toc__page-row">
            <label class="toc__field">
              <span>{$t('annotate.contents.to')}</span>
              <select
                value={section.pages.at(-1) ?? ''}
                onchange={(event) => choosePage(section, 'to', event.currentTarget.value)}
              >
                {#each canvases as canvas (canvas.id)}
                  <option value={canvas.id}>{canvas.label}</option>
                {/each}
              </select>
            </label>
            <button
              type="button"
              class="toc__small"
              disabled={!currentCanvasId || section.pages.at(-1) === currentCanvasId}
              title={$t('annotate.contents.useCurrentPage')}
              aria-label={`${$t('annotate.contents.to')}: ${$t('annotate.contents.useCurrentPage')}`}
              onclick={() => currentCanvasId && setPages(section, section.pages[0] ?? currentCanvasId, currentCanvasId)}
            >
              {$t('annotate.contents.useCurrent')}
            </button>
          </div>
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

      <label class="toc__check">
        <input
          type="checkbox"
          checked={isHeading(section)}
          onchange={(event) => setHeadingOnly(section, event.currentTarget.checked)}
        />
        {$t(`annotate.contents.headingOnly.${kind}`)}
      </label>
    {/if}

    {#each own as problem, n (n)}
      <p class="toc__problem" class:toc__problem--warning={problem.level === 'warning'}>
        {$t(`annotate.contents.problems.${problem.kind}`)}
      </p>
    {/each}

    <div class="toc__actions">
      {#if !section.locked && canAddInside(depth)}
        <button
          type="button"
          class="toc__small"
          title={$t('annotate.contents.addInside')}
          aria-label={$t('annotate.contents.addInside')}
          onclick={() => addInside(section, depth)}
        >
          <Plus size={13} aria-hidden="true" />
          {$t('annotate.contents.addSub')}
        </button>
      {/if}
      {#if kind === 'image' && siblings > 1}
        <button
          type="button"
          class="toc__icon"
          title={$t('annotate.contents.up')}
          aria-label={$t('annotate.contents.up')}
          disabled={index === 0}
          onclick={() => commit(moveSection(sections, section.id, -1))}
        >
          <ArrowUp size={14} aria-hidden="true" />
        </button>
        <button
          type="button"
          class="toc__icon"
          title={$t('annotate.contents.down')}
          aria-label={$t('annotate.contents.down')}
          disabled={index === siblings - 1}
          onclick={() => commit(moveSection(sections, section.id, 1))}
        >
          <ArrowDown size={14} aria-hidden="true" />
        </button>
      {/if}
      {#if canIndent(section, index, depth)}
        <button
          type="button"
          class="toc__icon"
          title={$t('annotate.contents.indent')}
          aria-label={$t('annotate.contents.indent')}
          onclick={() => indent(section, index, depth)}
        >
          <ListIndentIncrease size={14} aria-hidden="true" />
        </button>
      {/if}
      {#if depth > 0}
        <button
          type="button"
          class="toc__icon"
          title={$t('annotate.contents.outdent')}
          aria-label={$t('annotate.contents.outdent')}
          onclick={() => commit(outdentSection(sections, section.id))}
        >
          <ListIndentDecrease size={14} aria-hidden="true" />
        </button>
      {/if}
      <button type="button" class="toc__done" onclick={closeEditor}>
        {$t('annotate.contents.done')}
      </button>
    </div>
  </div>
{/snippet}

<style>
  .toc {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-height: 0;
    color: var(--viewer-text);
    font-size: 13px;
  }

  .toc__muted {
    margin: 0;
    color: var(--viewer-muted);
    font-size: 12px;
    line-height: 1.45;
  }

  .toc__empty {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px;
    border: 1px dashed var(--anno-dashed);
    border-radius: 8px;
    background: var(--anno-tint);
  }

  .toc__empty-prompt {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    margin: 0;
    color: var(--viewer-text);
    font-size: 12.5px;
    line-height: 1.45;
  }

  .toc__empty-prompt :global(svg) {
    flex-shrink: 0;
    margin-top: 2px;
    color: var(--anno-accent);
  }

  .toc__primary {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    width: 100%;
    height: 34px;
    padding: 0 12px;
    border: 0;
    border-radius: 6px;
    background: var(--anno-accent);
    color: var(--anno-on-accent);
    font: inherit;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
  }

  .toc__tree {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .toc__tree .toc__tree {
    position: relative;
    gap: 4px;
    margin: 6px 0 4px 12px;
    padding-left: 16px;
    border-left: 2px solid color-mix(in srgb, var(--anno-accent) 55%, transparent);
  }

  .toc__tree .toc__tree > li {
    position: relative;
  }

  .toc__tree .toc__tree > li::before {
    position: absolute;
    top: 18px;
    left: -16px;
    width: 10px;
    border-top: 2px solid color-mix(in srgb, var(--anno-accent) 55%, transparent);
    content: '';
  }

  .toc__row {
    display: flex;
    align-items: center;
    gap: 4px;
    padding-right: 4px;
    border: 1px solid var(--viewer-panel-border);
    border-radius: 8px;
    background: var(--anno-raised);
  }

  .toc__row--parent {
    background: color-mix(in srgb, var(--anno-tint) 60%, var(--anno-raised));
  }

  .toc__row:hover,
  .toc__row--current {
    border-color: color-mix(in srgb, var(--anno-accent) 55%, var(--viewer-panel-border));
    background: var(--anno-tint);
  }

  .toc__row--problem {
    border-color: var(--viewer-danger);
  }

  .toc__go {
    display: flex;
    flex: 1;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    min-width: 0;
    padding: 7px 6px 7px 10px;
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .toc__name-row {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    min-width: 0;
  }

  .toc__name {
    min-width: 0;
    font-size: 12.5px;
    font-weight: 600;
    line-height: 1.3;
    overflow-wrap: anywhere;
  }

  .toc__where {
    max-width: 100%;
    overflow: hidden;
    color: var(--viewer-muted);
    font-size: 11.5px;
    font-variant-numeric: tabular-nums;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .toc__row--problem .toc__name-row {
    color: var(--viewer-danger);
  }

  .toc__row-actions {
    display: flex;
    flex: none;
    align-items: center;
    gap: 2px;
  }

  .toc__row-reorder {
    opacity: 0;
    transition: opacity 0.12s ease;
  }

  .toc__row:hover .toc__row-reorder,
  .toc__row:focus-within .toc__row-reorder {
    opacity: 1;
  }

  .toc__sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }

  .toc__card {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px;
    border: 1px solid var(--anno-accent);
    border-radius: 10px;
    background: var(--anno-raised);
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.08);
  }

  .toc__card--problem {
    border-color: var(--viewer-danger);
  }

  .toc__card-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .toc__card-eyebrow {
    color: var(--anno-accent);
    font-size: 11.5px;
    font-weight: 600;
  }

  .toc__card--problem .toc__card-eyebrow {
    color: var(--viewer-danger);
  }

  .toc__delete {
    color: var(--viewer-muted);
  }

  .toc__delete:hover:not(:disabled) {
    color: var(--viewer-danger);
  }

  .toc__titles,
  .toc__page-rows {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .toc__page-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: end;
    gap: 6px;
  }

  .toc__field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }

  .toc__field > span {
    color: var(--viewer-muted);
    font-size: 11.5px;
    font-weight: 600;
  }

  input[type='text'],
  select {
    box-sizing: border-box;
    width: 100%;
    min-width: 0;
    height: 30px;
    padding: 0 8px;
    border: 1px solid var(--anno-input-border);
    border-radius: 6px;
    background: var(--viewer-well-bg);
    color: inherit;
    font: inherit;
    font-size: 12.5px;
  }

  .toc__title {
    font-weight: 600;
  }

  .toc__check {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--viewer-muted);
    font-size: 12px;
    cursor: pointer;
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
    gap: 4px;
    padding-top: 6px;
    border-top: 1px solid var(--viewer-panel-border);
  }

  .toc__icon,
  .toc__small {
    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;
    gap: 4px;
    min-width: 28px;
    min-height: 28px;
    padding: 0 7px;
    border: 1px solid transparent;
    border-radius: 6px;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
  }

  .toc__small {
    height: 30px;
    padding: 0 8px;
    border-color: var(--anno-input-border);
    background: var(--anno-tint);
    color: var(--viewer-text);
  }

  .toc__actions .toc__small {
    height: 26px;
    padding: 0 7px;
  }

  .toc__done {
    margin-left: auto;
    height: 26px;
    padding: 0 10px;
    border: 0;
    border-radius: 6px;
    background: var(--anno-accent);
    color: var(--anno-on-accent);
    font: inherit;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
  }

  .toc__icon:hover:not(:disabled),
  .toc__small:hover:not(:disabled) {
    border-color: color-mix(in srgb, var(--anno-accent) 45%, transparent);
    background: var(--anno-tint);
    color: var(--anno-accent);
  }

  button:disabled {
    opacity: 0.35;
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

  .toc__add {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    width: 100%;
    min-height: 32px;
    border: 1px dashed var(--anno-dashed);
    border-radius: 7px;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: 12.5px;
    font-weight: 600;
    cursor: pointer;
  }

  .toc__add:hover:not(:disabled) {
    border-color: var(--anno-accent);
    background: var(--anno-tint);
    color: var(--anno-accent);
  }

  .toc__save-bar {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px;
    border: 1px solid var(--viewer-panel-border);
    border-radius: 8px;
    background: var(--anno-tint);
  }

  .toc__save-bar--problem {
    border-color: var(--viewer-danger);
  }

  .toc__save-note {
    color: var(--viewer-muted);
    font-size: 12px;
  }

  .toc__save-bar--problem .toc__save-note {
    color: var(--viewer-danger);
  }

  .toc__save {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    min-height: 34px;
    border: 0;
    border-radius: 6px;
    background: var(--anno-accent);
    color: var(--anno-on-accent);
    font: inherit;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
  }

  .toc__status {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin: 0;
    color: var(--anno-accent);
    font-size: 12px;
    font-weight: 600;
  }
</style>
