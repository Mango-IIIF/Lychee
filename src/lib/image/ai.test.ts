import { describe, expect, it } from 'vitest';
import { aiImageUrl, parseAiResponse } from './ai';

describe('AI suggestions', () => {
  it('reads the cyw-annotate response shape for the configured languages', () => {
    const result = parseAiResponse(
      {
        model: 'claude-opus-5-5',
        label_en: 'Register cover',
        label_cy: 'Clawr y gofrestr',
        description_en: 'A worn cover.',
        transcription: 'Aberystwyth Station',
        transcription_language: 'en',
        tags: ['police', 'register'],
        entities: [{ name: 'Aberystwyth', kind: 'place', authority: 'geonames', search_term: 'Aberystwyth' }],
      },
      ['en', 'cy'],
    );
    expect(result.suggestions.map((s) => [s.intent, s.field, s.language, s.value])).toEqual([
      ['note', 'label', 'en', 'Register cover'],
      ['note', 'label', 'cy', 'Clawr y gofrestr'],
      ['note', 'note', 'en', 'A worn cover.'],
      ['transcribe', 'transcription', 'en', 'Aberystwyth Station'],
      ['tag', 'tags', 'en', 'police, register'],
    ]);
    expect(result.entities).toHaveLength(1);
  });

  it('also accepts language maps', () => {
    const result = parseAiResponse({ model: 'm', label: { fr: 'Couverture' } }, ['fr']);
    expect(result.suggestions[0]).toMatchObject({ field: 'label', language: 'fr', value: 'Couverture' });
  });

  it('crops through the IIIF Image API when there is a service', () => {
    const canvas = {
      items: [{ items: [{ body: { id: 'x.jpg', service: [{ id: 'https://iiif.example.org/img/1/' }] } }] }],
    };
    expect(aiImageUrl(canvas, { x: 10.2, y: 0, w: 100, h: 50 })).toEqual({
      url: 'https://iiif.example.org/img/1/10,0,100,50/!1200,1200/0/default.jpg',
      cropped: true,
    });
    expect(aiImageUrl({ items: [{ items: [{ body: { id: 'plain.jpg' } }] }] })).toEqual({ url: 'plain.jpg', cropped: false });
  });
});
