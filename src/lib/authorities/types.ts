export type { AuthorityEntity, AuthorityProvider } from '@mango-iiif/annotation';

/** A host-configured authority: `GET {endpoint}?q=` → `{ results: [{ id, uri, label, description? }] }`. */
export interface AuthorityEndpointConfig {
  id: string;
  label: string;
  endpoint: string;
  placeholder?: string;
}
