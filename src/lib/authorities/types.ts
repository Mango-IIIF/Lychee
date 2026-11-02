import type { AuthorityEntity } from '@mango-iiif/annotation';

export type { AuthorityEntity, AuthorityProvider } from '@mango-iiif/annotation';

/**
 * An entity with its name in each language, e.g. `{ en: 'Cardiff', cy: 'Caerdydd' }`: suggested by
 * the authority (Wikidata's labels) and set by the user. `label` stays the name shown in lists.
 */
export type NamedEntity = AuthorityEntity & {
  labels?: Record<string, string>;
  /** The names are settled (fetched, typed or loaded), so they aren't fetched again. */
  labelsChecked?: boolean;
};

/** A host-configured authority: `GET {endpoint}?q=` → `{ results: [{ id, uri, label, description? }] }`. */
export interface AuthorityEndpointConfig {
  id: string;
  label: string;
  endpoint: string;
  placeholder?: string;
}
