/*
 * Tables of contents: IIIF Ranges in a manifest's `structures`.
 *
 * The editor opens the manifest's own `structures` and hands the host the
 * whole table of contents back as Ranges when it is saved. It is not an
 * annotation and does not travel with them.
 *
 * Books list whole pages (IIIF Cookbook recipe 0024); recordings list spans of
 * time, written as `canvas#t=start,end` (recipe 0026). A Range is "an ordered
 * list of Canvases, and/or further Ranges", so a chapter may go to its own
 * pages or span, hold chapters inside it, or both; a heading with neither is
 * not a Range (its `items` must have at least one). Properties the editor
 * does not change (a thumbnail, a summary) are kept; a Range it cannot edit
 * (other kinds of target, hidden navigation) is kept exactly as it came.
 */

import { idOf, label } from './iiif';
import { newId } from './model';
import { timeRange, validateTime, type TimeProblem } from './time';
import type { LanguageMap } from './types';

export interface CanvasRef {
  id: string;
  type: 'Canvas';
}

export interface Range {
  id: string;
  type: 'Range';
  label: LanguageMap;
  items: (Range | CanvasRef)[];
  [key: string]: unknown;
}

/** A span of one recording. `end` null runs to the end of it. */
export interface SectionTime {
  canvasId: string;
  start: number;
  end: number | null;
}

/**
 * One entry in the table of contents, as the editor holds it. Written out as a
 * Range: its own pages or span first, then the chapters inside it.
 */
export interface Section {
  id: string;
  /** Language → title. */
  label: Record<string, string>;
  /** Image: the whole pages it covers, in order. */
  pages: string[];
  /** Audio and video: the span it covers. */
  time?: SectionTime;
  children: Section[];
  /** The Range's other properties (thumbnail, summary, behavior…), written back as they came. */
  extra?: Record<string, unknown>;
  /** A Range the editor cannot edit, written back exactly as it came. */
  locked?: Record<string, unknown>;
}

export const newSection = (init: Partial<Omit<Section, 'id'>> = {}): Section => ({
  id: newId(),
  label: {},
  pages: [],
  children: [],
  ...init,
});

/* ------------------------------------------------------------ writing */

const languageMap = (text: Record<string, string>, languages: readonly string[]): LanguageMap => {
  const ordered = [...languages, ...Object.keys(text).filter((language) => !languages.includes(language))];
  return Object.fromEntries(
    ordered.flatMap((language) => (text[language]?.trim() ? [[language, [text[language].trim()]]] : [])),
  );
};

const timeFragment = ({ start, end }: SectionTime): string => `t=${start}` + (end == null ? '' : `,${end}`);

/** A section as a Range: its own pages or span first, then its subsections. */
export const toRange = (section: Section, languages: readonly string[]): Range =>
  section.locked
    ? (section.locked as Range)
    : {
        id: section.id,
        type: 'Range',
        label: languageMap(section.label, languages),
        ...section.extra,
        items: [
          ...section.pages.map((id): CanvasRef => ({ id, type: 'Canvas' })),
          ...(section.time ? [{ id: `${section.time.canvasId}#${timeFragment(section.time)}`, type: 'Canvas' as const }] : []),
          ...section.children.map((child) => toRange(child, languages)),
        ],
      };

export const toStructures = (sections: readonly Section[], languages: readonly string[]): Range[] =>
  sections.map((section) => toRange(section, languages));

/* ------------------------------------------------------------ reading */

const asArray = <T>(value: T | T[] | undefined | null): T[] =>
  value == null ? [] : Array.isArray(value) ? value : [value];

const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const isRange = (value: unknown): value is Range => isObject(value) && value.type === 'Range';

const textOf = (map: unknown): Record<string, string> => {
  if (!map || typeof map !== 'object' || Array.isArray(map)) {
    const text = label(map);
    return text ? { none: text } : {};
  }
  return Object.fromEntries(
    Object.entries(map as Record<string, unknown>).map(([language, values]) => [
      language,
      asArray(values as string | string[]).join(' '),
    ]),
  );
};

const isLanguageMap = (value: unknown): boolean =>
  isObject(value) && Object.values(value).every((values) => Array.isArray(values) && values.every((v) => typeof v === 'string'));

/** The properties the editor writes; any others are kept as they came. */
const EDITED = new Set(['id', 'type', 'label', 'items']);
/** Ranges that are not entries in a table of contents. */
const HIDDEN = ['no-nav', 'thumbnail-nav', 'sequence'];

const lockedSection = (value: unknown): Section => {
  const raw = isObject(value) ? value : { value };
  return { ...newSection({ label: textOf(raw.label) }), id: idOf(raw) || newId(), locked: raw };
};

/**
 * A Range as the editor's section. One it cannot edit faithfully is locked,
 * to be written back untouched: a target other than a whole canvas or one
 * `#t=` span of it, a page or span after a subsection (the editor writes its
 * own first), a hidden Range, a label that is not a language map.
 */
export const sectionFromRange = (value: unknown): Section => {
  if (
    !isRange(value) ||
    !idOf(value) ||
    !Array.isArray(value.items) ||
    asArray(value.behavior as string | string[] | undefined).some((b) => HIDDEN.includes(b)) ||
    (value.label !== undefined && !isLanguageMap(value.label))
  ) {
    return lockedSection(value);
  }
  const section = { ...newSection({ label: textOf(value.label) }), id: idOf(value) };
  for (const item of value.items) {
    if (isRange(item)) {
      section.children.push(sectionFromRange(item));
      continue;
    }
    if (!isObject(item) || item.type !== 'Canvas' || typeof item.id !== 'string') return lockedSection(value);
    if (section.children.length) return lockedSection(value);
    if (Object.keys(item).some((key) => key !== 'id' && key !== 'type')) return lockedSection(value);
    const [canvasId, fragment] = item.id.split('#');
    const span = fragment ? timeRange(item.id) : null;
    if (fragment && (!span || !fragment.startsWith('t='))) return lockedSection(value);
    if (section.time || (span && section.pages.length)) return lockedSection(value);
    if (span) section.time = { canvasId, start: span.start, end: span.end };
    else section.pages.push(item.id);
  }
  const extra = Object.fromEntries(Object.entries(value).filter(([key]) => !EDITED.has(key)));
  return Object.keys(extra).length ? { ...section, extra } : section;
};

/** The table of contents a manifest (or a host) already has, as the editor's sections. */
export const readStructures = (structures: unknown): Section[] => asArray(structures).map(sectionFromRange);

/* ------------------------------------------------------------ editing */

const mapTree = (sections: readonly Section[], fn: (list: Section[]) => Section[]): Section[] =>
  fn(sections.map((section) => ({ ...section, children: mapTree(section.children, fn) })));

export const findSection = (sections: readonly Section[], id: string): Section | undefined => {
  for (const section of sections) {
    if (section.id === id) return section;
    const found = findSection(section.children, id);
    if (found) return found;
  }
  return undefined;
};

export const updateSection = (
  sections: readonly Section[],
  id: string,
  change: (section: Section) => Section,
): Section[] => mapTree(sections, (list) => list.map((section) => (section.id === id ? change(section) : section)));

export const removeSection = (sections: readonly Section[], id: string): Section[] =>
  mapTree(sections, (list) => list.filter((section) => section.id !== id));

/** Adds `child` at the end of `parentId`'s subsections, or at the top level without one. */
export const addSection = (sections: readonly Section[], child: Section, parentId?: string): Section[] =>
  parentId
    ? updateSection(sections, parentId, (parent) =>
        parent.locked ? parent : { ...parent, children: [...parent.children, child] },
      )
    : [...sections, child];

/** Moves a section up (-1) or down (1) among its siblings. */
export const moveSection = (sections: readonly Section[], id: string, delta: -1 | 1): Section[] =>
  mapTree(sections, (list) => {
    const index = list.findIndex((section) => section.id === id);
    const to = index + delta;
    if (index < 0 || to < 0 || to >= list.length) return list;
    const next = [...list];
    [next[index], next[to]] = [next[to], next[index]];
    return next;
  });

/** Makes a section the last subsection of the one before it. */
export const indentSection = (sections: readonly Section[], id: string): Section[] =>
  mapTree(sections, (list) => {
    const index = list.findIndex((section) => section.id === id);
    if (index < 1 || list[index - 1].locked) return list;
    const parent = list[index - 1];
    return [
      ...list.slice(0, index - 1),
      { ...parent, children: [...parent.children, list[index]] },
      ...list.slice(index + 1),
    ];
  });

/** Moves a subsection out, to just after its parent. */
export const outdentSection = (sections: readonly Section[], id: string): Section[] => {
  const lift = (list: readonly Section[]): Section[] =>
    list.flatMap((section) => {
      const child = section.children.find((c) => c.id === id);
      if (!child) return [{ ...section, children: lift(section.children) }];
      return [{ ...section, children: section.children.filter((c) => c.id !== id) }, child];
    });
  return lift(sections);
};

/**
 * Splits a span in two at `at`: the first part keeps the title, the second
 * (`second`, else a new section) needs one.
 */
export const splitSection = (sections: readonly Section[], id: string, at: number, second = newSection()): Section[] =>
  mapTree(sections, (list) =>
    list.flatMap((section) => {
      const time = section.time;
      if (section.id !== id || !time || at <= time.start || (time.end != null && at >= time.end)) return [section];
      return [
        { ...section, time: { ...time, end: at } },
        { ...second, time: { canvasId: time.canvasId, start: at, end: time.end } },
      ];
    }),
  );

/** Where a section's first span starts, as [recording, seconds]; null without one. */
const startOf = (section: Section, order: Map<string, number>): [number, number] | null => {
  const first = flattenSections([section]).find(({ section: s }) => s.time)?.section.time;
  return first ? [order.get(first.canvasId) ?? Infinity, first.start] : null;
};

/**
 * Recordings' chapters in the order they play: siblings by where they start,
 * groups by their first chapter. Those with no span yet go last, in the order they were.
 */
export const sortByTime = (sections: readonly Section[], canvasIds: readonly string[]): Section[] => {
  const order = new Map(canvasIds.map((id, index) => [id, index]));
  return mapTree(sections, (list) =>
    list
      .map((section, index) => ({ section, index, start: startOf(section, order) }))
      .sort((a, b) => {
        if (!a.start || !b.start) return a.start ? -1 : b.start ? 1 : a.index - b.index;
        return a.start[0] - b.start[0] || a.start[1] - b.start[1] || a.index - b.index;
      })
      .map(({ section }) => section),
  );
};

/**
 * The spans that play: chapters with chapters inside them are outlines of
 * those, so only the innermost are lined up against each other.
 */
const playingSpans = (sections: readonly Section[], canvasId?: string): { id: string; time: SectionTime }[] =>
  flattenSections(sections).flatMap(({ section }) =>
    section.time && !section.locked && !section.children.length && (!canvasId || section.time.canvasId === canvasId)
      ? [{ id: section.id, time: section.time }]
      : [],
  );

/** A span from `at` until the next chapter on the recording starts, or to its end. */
export const spanFrom = (sections: readonly Section[], canvasId: string, at: number): SectionTime => {
  const next = playingSpans(sections, canvasId)
    .map(({ time }) => time.start)
    .filter((start) => start > at + TOLERANCE)
    .sort((a, b) => a - b)[0];
  return { canvasId, start: at, end: next ?? null };
};

/**
 * A new chapter from `at`. Inside a chapter it splits it there; elsewhere it runs
 * until the next chapter on the recording starts, or to the end. At a chapter's
 * start it is that chapter. Returns the chapter to edit.
 */
export const addChapterAt = (
  sections: readonly Section[],
  canvasId: string,
  at: number,
  canvasIds: readonly string[],
): { sections: Section[]; id: string } => {
  const spans = playingSpans(sections, canvasId);
  const starting = spans.find(({ time }) => Math.abs(time.start - at) < TOLERANCE);
  if (starting) return { sections: [...sections], id: starting.id };
  const inside = spans.find(({ time }) => at > time.start && (time.end == null || at < time.end));
  const chapter = newSection();
  if (inside) return { sections: splitSection(sections, inside.id, at, chapter), id: chapter.id };
  chapter.time = spanFrom(sections, canvasId, at);
  return { sections: sortByTime([...sections, chapter], canvasIds), id: chapter.id };
};

/** The sections around `id`, outermost first, ending with it; empty when it is not there. */
export const sectionPath = (sections: readonly Section[], id: string): Section[] => {
  for (const section of sections) {
    if (section.id === id) return [section];
    const below = sectionPath(section.children, id);
    if (below.length) return [section, ...below];
  }
  return [];
};

/** The pages from `from` to `to`, inclusive, in manifest order. */
export const pageSpan = (canvasIds: readonly string[], from: string, to: string): string[] => {
  const a = canvasIds.indexOf(from);
  const b = canvasIds.indexOf(to);
  if (a < 0) return b < 0 ? [] : [to];
  if (b < 0) return [from];
  return canvasIds.slice(Math.min(a, b), Math.max(a, b) + 1);
};

/** Sections in reading order, depth first. */
export const flattenSections = (sections: readonly Section[], depth = 0): { section: Section; depth: number }[] =>
  sections.flatMap((section) => [{ section, depth }, ...flattenSections(section.children, depth + 1)]);

/* ------------------------------------------------------------ checking */

export type SectionProblemKind = 'label' | 'empty' | 'page' | `time.${Exclude<TimeProblem, null>}` | 'gap' | 'overlap';

export interface SectionProblem {
  sectionId: string;
  kind: SectionProblemKind;
  /** Errors stop saving; warnings are worth a look. */
  level: 'error' | 'warning';
}

/** A gap or overlap smaller than this is rounding. */
const TOLERANCE = 0.01;

/**
 * What is wrong with a table of contents. Spans on one recording should follow
 * each other: a gap plays as silence (recipe 0026), an overlap plays twice.
 */
export const sectionProblems = (
  sections: readonly Section[],
  { canvasIds, durations = {} }: { canvasIds: readonly string[]; durations?: Record<string, number> },
): SectionProblem[] => {
  const problems: SectionProblem[] = [];
  const known = new Set(canvasIds);
  const spans: { id: string; time: SectionTime }[] = [];
  for (const { section } of flattenSections(sections)) {
    // Kept as it came: not the editor's to check.
    if (section.locked) continue;
    const add = (kind: SectionProblemKind, level: SectionProblem['level'] = 'error') =>
      problems.push({ sectionId: section.id, kind, level });
    if (!Object.values(section.label).some((text) => text.trim())) add('label');
    if (!section.pages.length && !section.time && !section.children.length) add('empty');
    if (section.pages.some((page) => !known.has(page))) add('page');
    if (section.time) {
      const time = section.time;
      if (!known.has(time.canvasId)) add('page');
      const problem = validateTime(time.start, time.end ?? '', durations[time.canvasId] ?? 0);
      if (problem) add(`time.${problem}`);
      // One with chapters inside it outlines them, so it is not lined up against them.
      else if (!section.children.length) spans.push({ id: section.id, time });
    }
  }
  for (let i = 1; i < spans.length; i++) {
    const before = spans[i - 1].time;
    const after = spans[i].time;
    if (before.canvasId !== after.canvasId) continue;
    const end = before.end ?? durations[before.canvasId] ?? Infinity;
    if (after.start > end + TOLERANCE) problems.push({ sectionId: spans[i].id, kind: 'gap', level: 'warning' });
    else if (after.start < end - TOLERANCE) problems.push({ sectionId: spans[i].id, kind: 'overlap', level: 'warning' });
  }
  return problems;
};
