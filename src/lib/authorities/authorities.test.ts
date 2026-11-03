import { afterEach, describe, expect, it, vi } from 'vitest';
import { authoritiesOf, authorityBodies } from './annotations';
import { namesFor, needsNames, withFetchedNames, withName } from './names';
import type { NamedEntity } from './types';
import { wikidataLabels } from './wikidata';

describe('entity names', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('writes a name per language when the entity has them, else one language-neutral name', () => {
    expect(
      authorityBodies([
        { provider: 'wikidata', id: 'Q10690', uri: 'http://www.wikidata.org/entity/Q10690', label: 'Cardiff', labels: { en: 'Cardiff', cy: 'Caerdydd' } },
        { provider: 'geonames', id: '2657782', uri: 'https://sws.geonames.org/2657782/', label: 'Llandeilo' },
      ] as Parameters<typeof authorityBodies>[0]),
    ).toEqual([
      { type: 'SpecificResource', source: 'http://www.wikidata.org/entity/Q10690', purpose: 'identifying', label: { en: ['Cardiff'], cy: ['Caerdydd'] } },
      { type: 'SpecificResource', source: 'https://sws.geonames.org/2657782/', purpose: 'identifying', label: { none: ['Llandeilo'] } },
    ]);
  });

  it('writes the entity a tag stands for with no purpose', () => {
    expect(authorityBodies([{ provider: 'wikidata', id: 'Q1', uri: 'http://www.wikidata.org/entity/Q1', label: 'Universe' }], null)).toEqual([
      { type: 'SpecificResource', source: 'http://www.wikidata.org/entity/Q1', label: { none: ['Universe'] } },
    ]);
  });

  it('reads the names back, showing the one in the current language', () => {
    const annotation = {
      id: 'x',
      type: 'Annotation' as const,
      motivation: 'identifying',
      body: { type: 'SpecificResource', purpose: 'identifying', source: 'http://www.wikidata.org/entity/Q10690', label: { en: ['Cardiff'], cy: ['Caerdydd'] } },
      target: 'c',
    };
    expect(authoritiesOf(annotation, 'cy')).toEqual([
      {
        provider: 'wikidata',
        id: 'Q10690',
        uri: 'http://www.wikidata.org/entity/Q10690',
        label: 'Caerdydd',
        labels: { en: 'Cardiff', cy: 'Caerdydd' },
        labelsChecked: true,
      },
    ]);
  });

  describe('names the user sets', () => {
    const LANGS = ['en', 'cy'];
    const found: NamedEntity = { provider: 'wikidata', id: 'Q18105736', uri: 'http://www.wikidata.org/entity/Q18105736', label: 'Bob' };

    it('suggests the name from the search in every language until there are better ones', () => {
      expect(namesFor(found, LANGS)).toEqual({ en: 'Bob', cy: 'Bob' });
      expect(needsNames(found)).toBe(true);
    });

    it('takes Wikidata’s labels, leaving a language Wikidata has no label for empty to fill in', () => {
      const fetched = withFetchedNames(found, { en: 'Bob' });
      expect(namesFor(fetched, LANGS)).toEqual({ en: 'Bob', cy: '' });
      expect(needsNames(fetched)).toBe(false);
      expect(authorityBodies([fetched])[0].label).toEqual({ en: ['Bob'] });
    });

    it('saves the names the user typed, and keeps them when Wikidata answers later', () => {
      const named = withName(found, LANGS, 'cy', 'Bob y Bildiwr');
      expect(authorityBodies([named])[0].label).toEqual({ en: ['Bob'], cy: ['Bob y Bildiwr'] });
      expect(withFetchedNames(named, { en: 'Something else' })).toBe(named);
    });

    it('keeps the search name in every language when Wikidata gives none', () => {
      const none = withFetchedNames(found, {});
      expect(namesFor(none, LANGS)).toEqual({ en: 'Bob', cy: 'Bob' });
      expect(authorityBodies([none])[0].label).toEqual({ none: ['Bob'] });
    });

    it('falls back to the one name when every box is emptied', () => {
      const cleared = withName(withName(found, LANGS, 'en', ''), LANGS, 'cy', ' ');
      expect(authorityBodies([cleared])[0].label).toEqual({ none: ['Bob'] });
    });
  });

  it('fetches an entity’s labels in the configured languages from Wikidata', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        entities: { Q10690: { labels: { en: { value: 'Cardiff' }, cy: { value: 'Caerdydd' }, fr: { value: 'Cardiff' } } } },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    expect(await wikidataLabels('Q10690', ['en', 'cy'])).toEqual({ en: 'Cardiff', cy: 'Caerdydd' });
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ action: 'wbgetentities', ids: 'Q10690', props: 'labels', languages: 'en|cy' });
  });
});
