import { createViewerI18n, type MessageTree } from "@mango-iiif/iiif-viewer/core";
import {
  clearLocaleOverrides as clearAnnotationLocaleOverrides,
  setLocale as setAnnotationLocale,
  setLocaleOverrides as setAnnotationLocaleOverrides,
  translate as translateAnnotation,
} from "@mango-iiif/annotation/i18n";
import en from "../../locales/en.json";
import es from "../../locales/es.json";
import cy from "../../locales/cy.json";
import fr from "../../locales/fr.json";
import ja from "../../locales/ja.json";

/*
 * Lychee-specific strings and app-level overrides only.
 *
 * Lookup order:
 *   1. Runtime overrides & Lychee's own locale files (e.g. `about.*` branding,
 *      table/export/AI/AV/structures strings)
 *   2. @mango-iiif/annotation (shared sidebar, toolbar, intents, authorities, SAM)
 *   3. @mango-iiif/iiif-viewer (shared viewer chrome, controls, settings)
 *
 * The locale store itself is Mango's shared store, mirrored into Annotation.
 */
const i18n = createViewerI18n({ en, es, cy, fr, ja }, [translateAnnotation]);

i18n.locale.subscribe((value) => setAnnotationLocale(value));

export const locale = i18n.locale;
export const setLocale = i18n.setLocale;
export const getLocale = i18n.getLocale;
export const translate = i18n.translate;
export const t = i18n.t;

export const setLocaleOverrides = (localeCode: string, overrides: MessageTree): void => {
  i18n.setOverrides(localeCode, overrides);
  setAnnotationLocaleOverrides(localeCode, overrides);
};

export const clearLocaleOverrides = (localeCode?: string): void => {
  i18n.clearOverrides(localeCode);
  clearAnnotationLocaleOverrides(localeCode);
};
