import { describe, expect, it } from 'vitest';
import { bodiesOfDraft, labelOf, readAnnotation, tagDrafts, type Draft } from './intents';
import { annotationText, bodiesOf } from './model';
import type { Annotation, AnnotationBody } from './types';

/*
 * Annotations exactly as People's Collection Wales serves them back (from php-annotations'
 * tests/Integration/Pcw/Fixtures/annotations): text in two languages as a Choice, `language` as an
 * array, canvases as { id, type, partOf }, and entity names per language. Each must open in the form
 * with nothing lost, and be written again with the same meaning.
 */

const LANGS = ['en', 'cy'];
const BASE = 'https://www.peoplescollection.wales/iiif';
const canvas = (item: number, key: string) => ({
  id: `${BASE}/manifest/${item}/canvas/${key}`,
  type: 'Canvas',
  partOf: [{ id: `${BASE}/manifest/${item}`, type: 'Manifest' }],
});
const served = (id: number, motivation: string, body: unknown, target: unknown = canvas(42, '1017'), extra = {}): Annotation =>
  ({
    id: `${BASE}/manifest/42/annotation/${id}`,
    type: 'Annotation',
    motivation,
    creator: 'https://www.peoplescollection.wales/users/77',
    created: '2026-11-02T10:15:00Z',
    body,
    target,
    ...extra,
  }) as Annotation;
/** A served TextualBody: `language` is an array, which the Annotation type (matching the sidebar's) doesn't declare. */
const text = (language: string, value: string, generator?: string) =>
  ({
    type: 'TextualBody',
    language: [language],
    format: 'text/plain',
    value,
    ...(generator ? { generator: { type: 'Software', name: generator } } : {}),
  }) as unknown as AnnotationBody;

/** The same meaning written two ways: languages as strings, keys in any order. */
const canonical = (bodies: unknown[]) =>
  JSON.parse(
    JSON.stringify(bodies, (_key, value) => (Array.isArray(value) && value.length === 1 && typeof value[0] === 'string' ? value[0] : value)),
  );

const roundTrip = (annotation: Annotation): { draft: Draft; bodies: AnnotationBody[] } => {
  const { draft, notes } = readAnnotation(annotation, LANGS);
  expect(notes).toEqual([]);
  const drafts = draft.intent === 'tag' ? tagDrafts(draft, LANGS) : [draft];
  expect(drafts).toHaveLength(1);
  return { draft, bodies: bodiesOfDraft(drafts[0], LANGS) };
};

describe('annotations as PCW serves them', () => {
  it('1: a bilingual, titled comment (a Choice)', () => {
    const body = { type: 'Choice', items: [text('en', 'The shop closed in 1962.'), text('cy', 'Caeodd y siop ym 1962.')] };
    const annotation = served(9001, 'commenting', body, undefined, { label: { en: ['Hughes the Draper'], cy: ['Hughes y Dilledydd'] } });

    expect(bodiesOf(annotation).map((b) => b.value)).toEqual(['The shop closed in 1962.', 'Caeodd y siop ym 1962.']);
    expect(annotationText(annotation)).toBe('The shop closed in 1962. / Caeodd y siop ym 1962.');
    const { draft, bodies } = roundTrip(annotation);
    expect(draft.texts.note).toEqual({ en: 'The shop closed in 1962.', cy: 'Caeodd y siop ym 1962.' });
    expect(labelOf(draft, LANGS)).toEqual({ en: ['Hughes the Draper'], cy: ['Hughes y Dilledydd'] });
    expect(canonical(bodies)).toEqual(canonical([body]));
  });

  it('2: an AI transcription in Welsh opens in the Welsh tab, keeping its generator', () => {
    const body = text('cy', 'Stryd y Farchnad, Llandeilo', 'claude-opus-5-5');
    const { draft, bodies } = roundTrip(served(9002, 'supplementing', body));
    expect(draft.texts.transcription).toEqual({ cy: 'Stryd y Farchnad, Llandeilo' });
    expect(draft.generators).toEqual({ 'transcription.cy': 'claude-opus-5-5' });
    expect(canonical(bodies)).toEqual(canonical([body]));
  });

  it('4: a tag in both languages', () => {
    const body = { type: 'Choice', items: [text('en', 'horse and cart'), text('cy', 'ceffyl a chart')] };
    const { bodies } = roundTrip(served(9004, 'tagging', body));
    expect(canonical(bodies)).toEqual(canonical([body]));
  });

  it('4b: a tag linked to the Wikidata entity it stands for', () => {
    const tag = text('en', 'Gänseliesel-Brunnen');
    const entity = { type: 'SpecificResource', source: 'http://www.wikidata.org/entity/Q18624915' };
    const { draft, bodies } = roundTrip(served(9011, 'tagging', [tag, entity]));
    expect(draft.entities.map((e) => e.uri)).toEqual([entity.source]);
    // Served without a name, it is written back with the entity id as its name.
    expect(canonical(bodies)).toEqual(canonical([tag, { ...entity, label: { none: ['Q18624915'] } }]));
  });

  it('5: identified places keep their English and Welsh names', () => {
    const body = [
      {
        type: 'SpecificResource',
        purpose: 'identifying',
        source: 'https://www.wikidata.org/wiki/Q2472406',
        label: { en: ['Ammanford'], cy: ['Rhydaman'] },
        generator: { type: 'Software', name: 'claude-opus-5-5' },
      },
      { type: 'SpecificResource', purpose: 'identifying', source: 'https://sws.geonames.org/2657782/', label: { en: ['Llandeilo'], cy: ['Llandeilo'] } },
    ];
    const { draft, bodies } = roundTrip(served(9005, 'identifying', body));
    expect(readAnnotation(served(9005, 'identifying', body), LANGS, 'cy').draft.entities[0].label).toBe('Rhydaman');
    expect(draft.entities[0].label).toBe('Ammanford');
    expect(canonical(bodies)).toEqual(canonical(body));
  });

  it('7: a link to a moment in another recording, saying what it is', () => {
    const body = [
      text('en', 'A miner describes this colliery.'),
      {
        type: 'SpecificResource',
        source: canvas(574604, 'm88'),
        selector: { type: 'FragmentSelector', conformsTo: 'http://www.w3.org/TR/media-frags/', value: 't=312,348' },
      },
    ];
    const { draft } = roundTrip(served(9007, 'linking', body));
    expect(draft.linkUrl).toBe(`${BASE}/manifest/574604/canvas/m88`);
    expect([draft.linkStart, draft.linkEnd]).toEqual(['312', '348']);
    expect(draft.texts.note).toEqual({ en: 'A miner describes this colliery.' });

    // Written back, the canvas keeps its manifest when the editor knows it.
    const manifestOf = (id: string) => (id === `${BASE}/manifest/574604/canvas/m88` ? `${BASE}/manifest/574604` : undefined);
    expect(canonical(bodiesOfDraft(draft, LANGS, { manifestOf }))).toEqual(canonical(body));
  });

  it('6b: a highlight with no reason', () => {
    const { bodies } = roundTrip(served(9010, 'highlighting', undefined));
    expect(bodies).toEqual([]);
  });
});
