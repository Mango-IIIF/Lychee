import { describe, expect, it } from 'vitest';
import {
  bodiesOfDraft,
  bodyValue,
  draftFromAnnotation,
  draftProblem,
  emptyDraft,
  filledLanguages,
  labelOf,
  type Draft,
} from './intents';
import type { Annotation } from './types';

const LANGS = ['en', 'cy'];

const draftWith = (patch: Partial<Draft> & { texts?: Partial<Draft['texts']> }): Draft => {
  const draft = emptyDraft();
  return { ...draft, ...patch, texts: { ...draft.texts, ...patch.texts } };
};

describe('intents → W3C bodies (the ui-test rules)', () => {
  it('note: a label language map, and one TextualBody per filled language', () => {
    const draft = draftWith({
      intent: 'note',
      texts: { label: { en: 'Station', cy: '' }, note: { en: ' A note ', cy: 'Nodyn' }, transcription: {}, tags: {} },
    });
    expect(labelOf(draft, LANGS)).toEqual({ en: ['Station'] });
    expect(bodiesOfDraft(draft, LANGS)).toEqual([
      { type: 'TextualBody', value: 'A note', format: 'text/plain', language: 'en' },
      { type: 'TextualBody', value: 'Nodyn', format: 'text/plain', language: 'cy' },
    ]);
  });

  it('writes one body as an object and several as an array', () => {
    const one = [{ type: 'TextualBody', value: 'a' }];
    expect(bodyValue(one)).toEqual(one[0]);
    expect(bodyValue([...one, ...one])).toHaveLength(2);
    expect(bodyValue([])).toBeUndefined();
  });

  it('tag: one tagging body per keyword, per language', () => {
    const draft = draftWith({ intent: 'tag', texts: { tags: { en: 'mill, , wool', cy: 'gwlân' }, label: {}, note: {}, transcription: {} } });
    expect(bodiesOfDraft(draft, LANGS).map((b) => [b.value, b.language, b.purpose])).toEqual([
      ['mill', 'en', 'tagging'],
      ['wool', 'en', 'tagging'],
      ['gwlân', 'cy', 'tagging'],
    ]);
  });

  it('identify: a SpecificResource per linked entity', () => {
    const draft = draftWith({
      intent: 'identify',
      entities: [{ provider: 'wikidata', id: 'Q84', uri: 'http://www.wikidata.org/entity/Q84', label: 'London' }],
    });
    expect(bodiesOfDraft(draft, LANGS)).toEqual([
      { type: 'SpecificResource', source: 'http://www.wikidata.org/entity/Q84', purpose: 'identifying', label: { none: ['London'] } },
    ]);
  });

  it('link: a time range on the linked resource when given', () => {
    const draft = draftWith({ intent: 'link', linkUrl: 'https://example.org/rec', linkStart: '12', linkEnd: '30' });
    expect(bodiesOfDraft(draft, LANGS)[0]).toMatchObject({
      source: { id: 'https://example.org/rec' },
      selector: { type: 'FragmentSelector', value: 't=12,30' },
    });
  });

  it('highlight needs no text', () => {
    expect(draftProblem(draftWith({ intent: 'highlight' }), LANGS)).toBeNull();
    expect(bodiesOfDraft(draftWith({ intent: 'highlight' }), LANGS)).toEqual([]);
  });

  it('reports what is missing before saving', () => {
    expect(draftProblem(emptyDraft(), LANGS)).toBe('noIntent');
    expect(draftProblem(draftWith({ intent: 'note' }), LANGS)).toBe('noText');
    expect(draftProblem(draftWith({ intent: 'identify' }), LANGS)).toBe('noEntity');
    expect(draftProblem(draftWith({ intent: 'link', linkUrl: 'javascript:alert(1)' }), LANGS)).toBe('badUrl');
  });

  it('keeps AI provenance as a generator until the value is retyped', () => {
    const draft = draftWith({
      intent: 'transcribe',
      texts: { transcription: { en: 'Aberystwyth' }, label: {}, note: {}, tags: {} },
      generators: { 'transcription.en': 'claude-opus-5-5' },
    });
    expect(bodiesOfDraft(draft, LANGS)[0].generator).toEqual({ type: 'Software', name: 'claude-opus-5-5' });
  });

  it('marks the other languages that have text', () => {
    const draft = draftWith({ intent: 'note', texts: { note: { cy: 'Nodyn' }, label: {}, transcription: {}, tags: {} } });
    expect(filledLanguages(draft, LANGS)).toEqual(['cy']);
  });
});

describe('reading a saved annotation back into the form', () => {
  it('round-trips a bilingual note', () => {
    const draft = draftWith({
      intent: 'note',
      texts: { label: { en: 'Title' }, note: { en: 'Hello', cy: 'Helo' }, transcription: {}, tags: {} },
    });
    const annotation: Annotation = {
      id: 'urn:uuid:1',
      type: 'Annotation',
      motivation: 'commenting',
      label: labelOf(draft, LANGS),
      body: bodiesOfDraft(draft, LANGS),
      target: 'https://example.org/canvas/1',
    };
    const restored = draftFromAnnotation(annotation, LANGS);
    expect(restored.intent).toBe('note');
    expect(restored.texts.label.en).toBe('Title');
    expect(restored.texts.note).toEqual({ en: 'Hello', cy: 'Helo' });
  });

  it('maps motivations written by other tools to an intent', () => {
    const annotation: Annotation = {
      id: 'x',
      type: 'Annotation',
      motivation: 'transcribing',
      body: { type: 'TextualBody', value: 'Text', language: 'cy' },
      target: 'c',
    };
    const restored = draftFromAnnotation(annotation, LANGS);
    expect(restored.intent).toBe('transcribe');
    expect(restored.texts.transcription.cy).toBe('Text');
  });
});
