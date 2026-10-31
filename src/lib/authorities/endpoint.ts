import type { AuthorityEndpointConfig, AuthorityEntity, AuthorityProvider } from './types';
import { wikidata } from './wikidata';

interface EndpointResponse {
  results?: { id: string; uri: string; label: string; description?: string }[];
  error?: string;
}

/** A provider backed by a host endpoint, so credentials (e.g. a GeoNames account) stay server-side. */
export const endpointProvider = (config: AuthorityEndpointConfig): AuthorityProvider => ({
  id: config.id,
  label: config.label,
  placeholder: config.placeholder,
  async search(query, signal) {
    if (query.trim().length < 2) return [];
    const url = new URL(config.endpoint, document.baseURI);
    url.searchParams.set('q', query.trim());
    const response = await fetch(url, { signal });
    const data = (await response.json().catch(() => ({}))) as EndpointResponse;
    if (!response.ok) throw new Error(data.error || `${config.label} search failed (${response.status}).`);
    return (data.results ?? []).map(
      (result): AuthorityEntity => ({ provider: config.id, ...result }),
    );
  },
});

export const providersFor = (
  options: { wikidata?: boolean; authorities?: AuthorityEndpointConfig[] } = {},
): AuthorityProvider[] => [
  ...(options.wikidata === false ? [] : [wikidata]),
  ...(options.authorities ?? []).filter((entry) => entry?.id && entry.endpoint).map(endpointProvider),
];
