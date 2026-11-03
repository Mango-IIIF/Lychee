import type { NamedEntity } from './types';

/*
 * An entity's name in each language is the user's to set. The authority only suggests it:
 * Wikidata may have no Welsh label, and other sources give one name with no language.
 */

/** The names to show for editing: the ones set, else the authority's name in every language. */
export const namesFor = (entity: NamedEntity, languages: readonly string[]): Record<string, string> =>
  Object.fromEntries(
    languages.map((language) => [language, entity.labels ? (entity.labels[language] ?? '') : entity.label]),
  );

/** The entity with its name in `language` set by the user; the other languages keep what was shown. */
export const withName = (
  entity: NamedEntity,
  languages: readonly string[],
  language: string,
  name: string,
): NamedEntity => ({
  ...entity,
  labels: { ...namesFor(entity, languages), [language]: name },
  labelsChecked: true,
});

/**
 * The entity with the names an authority gave (e.g. Wikidata's labels), unless the user has set
 * names since. When it gave none, the name from the search stays in every language.
 */
export const withFetchedNames = (entity: NamedEntity, fetched: Record<string, string>): NamedEntity => {
  if (entity.labelsChecked) return entity;
  return Object.keys(fetched).length ? { ...entity, labels: fetched, labelsChecked: true } : { ...entity, labelsChecked: true };
};

/** Whether the names should still be fetched from the authority. */
export const needsNames = (entity: NamedEntity): boolean => entity.provider === 'wikidata' && !entity.labelsChecked;
