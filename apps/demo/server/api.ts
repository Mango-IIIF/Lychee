import dns from 'node:dns/promises';
import net from 'node:net';
import type { IncomingMessage, ServerResponse } from 'node:http';
import Anthropic from '@anthropic-ai/sdk';

// Demo-only API for the editor's configurable endpoints (`annotations.ai.endpoint`
// and `annotations.authorities`), carried over from cyw-annotate. A real host
// implements the same contract in its own stack; the editor never sees the keys.
//
//   GET  /api/health                                       -> { ai, geonames }: what is configured
//   POST /api/describe   { imageUrl, region?, context? }  -> AiSuggestions
//   GET  /api/geonames?q=cardiff                           -> { results: [{ id, uri, label, description }] }

type Next = (err?: unknown) => void;

const MODEL = 'claude-opus-5-5';

const SUGGESTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'label_en',
    'label_cy',
    'description_en',
    'description_cy',
    'transcription',
    'transcription_language',
    'entities',
    'tags',
  ],
  properties: {
    label_en: {
      type: 'string',
      description: 'A short title for what is shown, a few words, in English.',
    },
    label_cy: { type: 'string', description: 'The same title in Welsh.' },
    description_en: {
      type: 'string',
      description: 'One to three sentences describing what is visible, in English.',
    },
    description_cy: { type: 'string', description: 'The same description in Welsh.' },
    transcription: {
      type: 'string',
      description:
        'Verbatim transcription of any legible text, preserving line breaks. Empty string if none.',
    },
    transcription_language: {
      type: 'string',
      description: 'ISO 639-1 code of the transcribed text, or empty string.',
    },
    entities: {
      type: 'array',
      description:
        'Specific, nameable people, places, buildings, organisations or events that are visible or written in the image.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'kind', 'authority', 'search_term', 'evidence'],
        properties: {
          name: { type: 'string' },
          kind: {
            type: 'string',
            enum: [
              'person',
              'place',
              'building',
              'organisation',
              'event',
              'object',
              'other',
            ],
          },
          authority: {
            type: 'string',
            enum: ['wikidata', 'geonames'],
            description:
              'geonames for settlements and geographic features, otherwise wikidata.',
          },
          search_term: {
            type: 'string',
            description: 'The best query to find this entity in the authority.',
          },
          evidence: {
            type: 'string',
            description: 'Short note on where in the image this comes from.',
          },
        },
      },
    },
    tags: {
      type: 'array',
      items: { type: 'string' },
      description: 'Up to 8 short, lowercase English subject keywords.',
    },
  },
} as const;

const SYSTEM = `You help volunteers describe items in People's Collection Wales, a bilingual (Welsh and English) heritage collection.
You are shown one image, or a cropped region of one, from a digitised item. Describe only what is actually visible or written.
Never guess the identity of an unnamed person. Only list an entity if it is named in the text or is an unmistakable landmark.
Volunteers review every suggestion before it is saved, so prefer fewer, accurate suggestions over many speculative ones.`;

interface DescribeRequest {
  imageUrl?: string;
  region?: string;
  context?: { title?: string; canvasLabel?: string; metadata?: { label: string; value: string }[] };
}

const readJson = (req: IncomingMessage) =>
  new Promise<DescribeRequest>((resolve, reject) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => {
      try {
        resolve(JSON.parse(data || '{}'));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });

const send = (res: ServerResponse, status: number, body: unknown) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
};

const isPrivateAddress = (ip: string) =>
  net.isIPv4(ip)
    ? /^(0\.|10\.|127\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/.test(
        ip,
      )
    : /^(::1?$|f[cd]|fe[89ab]|::ffff:(10|127|169\.254|192\.168)\.)/i.test(ip);

// The server fetches the image, so never let it reach internal addresses
const allowedHost = async (url: URL, env: Record<string, string>) => {
  const list = (env.ALLOWED_IMAGE_HOSTS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (
    list.length > 0 &&
    !list.some((h) => url.hostname === h || url.hostname.endsWith('.' + h))
  )
    return false;
  const addresses = await dns
    .lookup(url.hostname.replace(/^\[|\]$/g, ''), { all: true })
    .catch(() => []);
  return addresses.length > 0 && addresses.every((a) => !isPrivateAddress(a.address));
};

const describe = async (
  req: IncomingMessage,
  res: ServerResponse,
  env: Record<string, string>,
) => {
  const { imageUrl, region, context } = await readJson(req);

  let url: URL;
  try {
    url = new URL(imageUrl ?? '');
  } catch {
    return send(res, 400, { error: 'imageUrl must be an absolute URL' });
  }
  if (!/^https?:$/.test(url.protocol) || !(await allowedHost(url, env)))
    return send(res, 400, { error: `Image host not allowed: ${url.hostname}` });

  const img = await fetch(url, { redirect: 'error' });
  if (!img.ok) return send(res, 502, { error: `Could not fetch image (${img.status})` });

  const mediaType = (img.headers.get('content-type') || 'image/jpeg').split(';')[0];
  if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(mediaType))
    return send(res, 415, { error: `Unsupported image type ${mediaType}` });

  const data = Buffer.from(await img.arrayBuffer()).toString('base64');

  const lines = [
    context?.title && `Item title: ${context.title}`,
    context?.canvasLabel && `Page / image: ${context.canvasLabel}`,
    ...(context?.metadata || [])
      .slice(0, 8)
      .map((m: { label: string; value: string }) => `${m.label}: ${m.value}`),
    region
      ? `The image is a crop of the region the volunteer selected (${region}). Focus on that region.`
      : 'The image is the whole page / photograph.',
  ].filter(Boolean);

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY || undefined });

  try {
    // `fallbacks` is a beta parameter this SDK version doesn't type yet.
    const params = {
      model: MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: {
        effort: 'medium',
        format: { type: 'json_schema', schema: SUGGESTION_SCHEMA },
      },
      system: SYSTEM,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data } },
            {
              type: 'text',
              text: `${lines.join('\n')}\n\nSuggest a label, a description, a transcription, linkable entities and tags.`,
            },
          ],
        },
      ],
    };
    const response = (await client.beta.messages.create(
      params as unknown as Parameters<typeof client.beta.messages.create>[0],
    )) as unknown as {
      model: string;
      stop_reason: string;
      stop_details?: unknown;
      content: { type: string; text?: string }[];
    };

    if (response.stop_reason === 'refusal')
      return send(res, 422, {
        error: 'The model declined to describe this image.',
        details: response.stop_details,
      });

    const text = response.content.find((b) => b.type === 'text')?.text;
    if (!text) return send(res, 502, { error: 'Empty model response' });

    send(res, 200, { model: response.model, ...JSON.parse(text) });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError)
      return send(res, 401, {
        error: 'No valid Anthropic API key. Set ANTHROPIC_API_KEY in .env',
      });
    if (err instanceof Anthropic.RateLimitError)
      return send(res, 429, {
        error: 'Rate limited by the Anthropic API, try again shortly.',
      });
    if (err instanceof Anthropic.APIError)
      return send(res, err.status ?? 502, { error: err.message });
    if (err instanceof Error && /resolve authentication method/i.test(err.message))
      return send(res, 401, {
        error:
          'No Anthropic API key configured. Set ANTHROPIC_API_KEY in .env and restart.',
      });
    throw err;
  }
};

const geonames = async (
  req: IncomingMessage,
  res: ServerResponse,
  env: Record<string, string>,
) => {
  const q = new URL(req.url!, 'http://x').searchParams.get('q')?.trim();
  if (!q) return send(res, 200, { results: [] });
  if (!env.GEONAMES_USERNAME)
    return send(res, 501, {
      error: 'GeoNames is not configured. Set GEONAMES_USERNAME in .env',
    });

  const params = new URLSearchParams({
    q,
    maxRows: '8',
    style: 'MEDIUM',
    countryBias: 'GB',
    lang: 'en',
    username: env.GEONAMES_USERNAME,
  });
  const r = await fetch(`https://secure.geonames.org/searchJSON?${params}`);
  const json = (await r.json()) as {
    status?: { message: string };
    geonames?: {
      geonameId: number;
      name: string;
      fcodeName?: string;
      adminName1?: string;
      countryName?: string;
      lat: string;
      lng: string;
    }[];
  };
  if (json.status) return send(res, 502, { error: json.status.message });

  send(res, 200, {
    results: (json.geonames || []).map((g) => ({
      id: String(g.geonameId),
      uri: `https://sws.geonames.org/${g.geonameId}/`,
      label: g.name,
      description: [g.fcodeName, g.adminName1, g.countryName].filter(Boolean).join(' · '),
      lat: Number(g.lat),
      lng: Number(g.lng),
    })),
  });
};

export const apiMiddleware =
  (env: Record<string, string>) =>
  async (req: IncomingMessage, res: ServerResponse, next: Next) => {
    try {
      const path = (req.url || '').split('?')[0];
      if (req.method === 'GET' && path === '/health')
        return send(res, 200, {
          ai: Boolean(env.ANTHROPIC_API_KEY),
          geonames: Boolean(env.GEONAMES_USERNAME),
        });
      if (req.method === 'POST' && path === '/describe')
        return await describe(req, res, env);
      if (req.method === 'GET' && path === '/geonames')
        return await geonames(req, res, env);
      next();
    } catch (err) {
      console.error('[api]', err);
      send(res, 500, { error: err instanceof Error ? err.message : String(err) });
    }
  };
