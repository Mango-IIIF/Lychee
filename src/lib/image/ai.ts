/*
 * "Suggest with AI": the host endpoint describes an image or region, and the
 * editor offers the suggestions to fill the form. Nothing is saved without the
 * user choosing it, and anything used keeps the model as its `generator`.
 *
 *   POST {endpoint}  { imageUrl, region?, context: { title?, canvasLabel?, metadata? } }
 *   200              { model, label_<lang>?, description_<lang>?, transcription?,
 *                      transcription_language?, tags?: string[], entities?: [...] }
 *
 * `label` / `description` may instead be language maps (`{ en: '…', cy: '…' }`).
 */

import type { Intent, TextField } from '../annotations/intents';

export interface AiRequest {
  imageUrl: string;
  region?: string;
  context: {
    title?: string;
    canvasLabel?: string;
    metadata?: { label: string; value: string }[];
  };
}

export interface AiEntity {
  name: string;
  kind: string;
  /** The authority to look it up in: `wikidata` or a configured authority's id. */
  authority: string;
  search_term: string;
  evidence?: string;
}

export interface AiSuggestion {
  key: string;
  intent: Intent;
  field: TextField;
  language: string;
  value: string;
}

export interface AiResult {
  model: string;
  suggestions: AiSuggestion[];
  entities: AiEntity[];
  /** Text in a language the editor isn't configured for: not offered, so it can't be saved as another language. */
  unplaced: { field: TextField; language: string; value: string }[];
}

type Raw = Record<string, unknown>;

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

const inLanguage = (raw: Raw, key: string, language: string) => {
  const map = raw[key];
  if (map && typeof map === 'object') return text((map as Raw)[language]);
  return text(raw[`${key}_${language}`]);
};

export const parseAiResponse = (raw: Raw, languages: readonly string[]): AiResult => {
  const suggestions: AiSuggestion[] = [];
  const push = (intent: Intent, field: TextField, language: string, value: string) => {
    if (value) suggestions.push({ key: `${field}.${language}`, intent, field, language, value });
  };
  for (const language of languages) push('note', 'label', language, inLanguage(raw, 'label', language));
  for (const language of languages) push('note', 'note', language, inLanguage(raw, 'description', language));
  const unplaced: AiResult['unplaced'] = [];
  const transcription = text(raw.transcription);
  const transcriptionLanguage = text(raw.transcription_language);
  if (!transcriptionLanguage || languages.includes(transcriptionLanguage)) {
    // No language given: assume the first configured one, as before.
    push('transcribe', 'transcription', transcriptionLanguage || languages[0], transcription);
  } else if (transcription) {
    // e.g. Latin on an English and Welsh site: offering it as English would mislabel it.
    unplaced.push({ field: 'transcription', language: transcriptionLanguage, value: transcription });
  }
  // The keyword box takes several, separated by commas; each is saved as its own tagging annotation.
  const tags = Array.isArray(raw.tags) ? raw.tags.map(text).filter(Boolean) : [];
  push('tag', 'tags', languages[0], tags.join(', '));

  return {
    model: text(raw.model) || 'AI',
    suggestions,
    unplaced,
    entities: Array.isArray(raw.entities) ? (raw.entities as AiEntity[]).filter((e) => e?.search_term) : [],
  };
};

export const requestSuggestions = async (
  endpoint: string,
  request: AiRequest,
  languages: readonly string[],
  signal?: AbortSignal,
): Promise<AiResult> => {
  const response = await fetch(new URL(endpoint, document.baseURI), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    signal,
  });
  const json = (await response.json().catch(() => ({}))) as Raw;
  if (!response.ok) throw new Error(text(json.error) || `Request failed (${response.status})`);
  return parseAiResponse(json, languages);
};

/** An image URL for the AI step: a IIIF Image API crop when there is a service, else the whole image. */
export const aiImageUrl = (
  canvas: Raw | undefined,
  bounds?: { x: number; y: number; w: number; h: number },
): { url: string; cropped: boolean } => {
  const painted = (((canvas?.items as Raw[] | undefined)?.[0]?.items as Raw[] | undefined)?.[0]?.body ??
    (canvas?.images as Raw[] | undefined)?.[0]?.resource) as Raw | undefined;
  const services = painted?.service;
  const service = (Array.isArray(services) ? services[0] : services) as Raw | undefined;
  const base = String(service?.id ?? service?.['@id'] ?? '')
    .replace(/\/info\.json$/, '')
    .replace(/\/$/, '');
  if (base) {
    const region = bounds
      ? [bounds.x, bounds.y, bounds.w, bounds.h].map((n) => Math.max(0, Math.round(n))).join(',')
      : 'full';
    // `!w,h` (best fit) is valid in Image API 2 and 3.
    return { url: `${base}/${region}/!1200,1200/0/default.jpg`, cropped: Boolean(bounds) };
  }
  return { url: String(painted?.id ?? painted?.['@id'] ?? ''), cropped: false };
};
