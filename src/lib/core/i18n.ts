import { derived, get } from 'svelte/store';
import {
  locale,
  setLocale,
  getLocale,
  translate as translateViewer,
} from '@mango-iiif/iiif-viewer/core';
import { setLocale as setAnnotationLocale } from '@mango-iiif/annotation';
import en from '../../locales/en.json';
import es from '../../locales/es.json';
import cy from '../../locales/cy.json';
import fr from '../../locales/fr.json';
import ja from '../../locales/ja.json';

/*
 * Annotation editor strings only. Shared interface text (close buttons, stage
 * controls, the about panel) belongs to the viewer and is looked up there, so a
 * locale the viewer gains is picked up here without copying its catalogue.
 *
 * The locale itself is the viewer's store: the editor chrome and the embedded
 * viewer cannot disagree about which language is showing.
 */

type Params = Record<string, string | number | undefined>;

type MessageTree = string | { [key: string]: MessageTree };
type MessageValue = MessageTree | undefined;

const catalogue: Record<string, MessageTree> = {
  en,
  es,
  cy,
  fr,
  ja,
};

const fallbackLocale = 'en';

const resolveLocale = (value: string): string => {
  const normalised = value.trim().replace('_', '-').toLowerCase();
  if (catalogue[normalised]) return normalised;
  const base = normalised.split('-')[0];
  if (base && catalogue[base]) return base;
  return fallbackLocale;
};

const lookup = (messages: MessageTree, key: string): MessageValue => {
  return key.split('.').reduce<MessageValue>((acc, part) => {
    if (!acc || typeof acc !== 'object') return undefined;
    return (acc as Record<string, MessageTree>)[part];
  }, messages as MessageTree);
};

const format = (template: string, params?: Params): string => {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    const value = params[key];
    return value == null ? match : String(value);
  });
};

export { locale, setLocale, getLocale };

/* The sidebar and toolbar come from @mango-iiif/annotation, which keeps its own locale store. */
locale.subscribe((value) => setAnnotationLocale(value));

export const translate = (key: string, params?: Params, overrideLocale?: string): string => {
  const active = overrideLocale ?? get(locale);
  const resolved = resolveLocale(active);
  const value =
    lookup(catalogue[resolved] ?? catalogue[fallbackLocale], key) ??
    lookup(catalogue[fallbackLocale], key);
  if (typeof value === 'string') return format(value, params);
  return translateViewer(key, params, active);
};

export const t = derived(locale, ($locale) => {
  return (key: string, params?: Params): string => translate(key, params, $locale);
});
