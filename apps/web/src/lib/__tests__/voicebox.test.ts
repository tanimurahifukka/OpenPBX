import { describe, expect, it } from 'vitest';
import {
  VoiceBoxClient,
  VoiceBoxError,
  loadVoiceBoxClient,
  isVoiceBoxConfigured,
  type FetchLike,
} from '../voicebox';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function wavResponse(
  bytes: Uint8Array,
  status = 200,
  extra: Record<string, string> = {},
): Response {
  return new Response(bytes as unknown as BodyInit, {
    status,
    headers: { 'Content-Type': 'audio/wav', ...extra },
  });
}

function mockFetch(
  handler: (url: string, init?: RequestInit) => Response | Promise<Response>,
): FetchLike {
  return (url, init) => Promise.resolve(handler(url, init));
}

const MIN_WAV = (() => {
  const b = new Uint8Array(44);
  Buffer.from('RIFF', 'ascii').copy(b, 0);
  Buffer.from('WAVE', 'ascii').copy(b, 8);
  return b;
})();

describe('VoiceBoxClient.listSpeakers', () => {
  it('returns parsed engine + speakers', async () => {
    const client = new VoiceBoxClient({
      baseUrl: 'http://vb/',
      token: 't',
      fetch: mockFetch((url, init) => {
        expect(url).toBe('http://vb/speakers');
        const auth = (init?.headers as Record<string, string>).Authorization;
        expect(auth).toBe('Bearer t');
        return jsonResponse({
          engine: 'VOICEVOX',
          speakers: [
            { speakerId: 3, speakerName: 'ずんだもん', styleName: 'ノーマル', credit: 'VOICEVOX:ずんだもん' },
          ],
        });
      }),
    });
    const out = await client.listSpeakers();
    expect(out.engine).toBe('VOICEVOX');
    expect(out.speakers[0]?.speakerId).toBe(3);
  });

  it('throws engine_unexpected_body on wrong shape', async () => {
    const client = new VoiceBoxClient({
      baseUrl: 'http://vb',
      token: 't',
      fetch: mockFetch(() => jsonResponse({ speakers: 'not array' })),
    });
    await expect(client.listSpeakers()).rejects.toMatchObject({
      name: 'VoiceBoxError',
      code: 'engine_unexpected_body',
    });
  });

  it('maps 401 to voicebox_unauthorized', async () => {
    const client = new VoiceBoxClient({
      baseUrl: 'http://vb',
      token: 't',
      fetch: mockFetch(() => new Response('nope', { status: 401 })),
    });
    await expect(client.listSpeakers()).rejects.toMatchObject({ code: 'voicebox_unauthorized' });
  });

  it('maps 503 to engine_unreachable', async () => {
    const client = new VoiceBoxClient({
      baseUrl: 'http://vb',
      token: 't',
      fetch: mockFetch(() =>
        new Response(JSON.stringify({ error: 'engine_error', code: 'engine_unreachable' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    });
    await expect(client.listSpeakers()).rejects.toMatchObject({ code: 'engine_unreachable' });
  });
});

describe('VoiceBoxClient.synthesizePhoneWav', () => {
  it('POSTs JSON and returns wav bytes with metadata from headers', async () => {
    let postedBody: string | null = null;
    const client = new VoiceBoxClient({
      baseUrl: 'http://vb',
      token: 't',
      fetch: mockFetch((url, init) => {
        expect(url).toBe('http://vb/synthesize-phone-wav');
        expect(init?.method).toBe('POST');
        postedBody = init?.body as string;
        return wavResponse(MIN_WAV, 200, {
          'X-VoiceBox-Engine': 'VOICEVOX',
          'X-VoiceBox-Speaker-Id': '3',
          'X-VoiceBox-Sample-Rate': '8000',
          'X-VoiceBox-Channels': '1',
        });
      }),
    });
    const out = await client.synthesizePhoneWav({
      name: 'custom/ivr-menu',
      text: 'お電話ありがとうございます',
      speakerId: 3,
      speedScale: 0.95,
    });
    expect(out.bytes.length).toBe(MIN_WAV.length);
    expect(out.engine).toBe('VOICEVOX');
    expect(out.speakerId).toBe(3);
    expect(out.sampleRate).toBe(8000);
    expect(out.channels).toBe(1);
    const parsed = JSON.parse(postedBody!) as Record<string, unknown>;
    expect(parsed.speedScale).toBe(0.95);
    expect(parsed.text).toBe('お電話ありがとうございます');
  });

  it('rejects non-audio content-type', async () => {
    const client = new VoiceBoxClient({
      baseUrl: 'http://vb',
      token: 't',
      fetch: mockFetch(() => jsonResponse({ trickery: true })),
    });
    await expect(
      client.synthesizePhoneWav({ text: 'x', speakerId: 1 }),
    ).rejects.toMatchObject({ code: 'engine_unexpected_body' });
  });

  it('rejects audio body that is not RIFF/WAVE', async () => {
    const client = new VoiceBoxClient({
      baseUrl: 'http://vb',
      token: 't',
      fetch: mockFetch(() =>
        new Response(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]) as unknown as BodyInit, {
          status: 200,
          headers: { 'Content-Type': 'audio/wav' },
        }),
      ),
    });
    await expect(
      client.synthesizePhoneWav({ text: 'x', speakerId: 1 }),
    ).rejects.toMatchObject({ code: 'engine_unexpected_body' });
  });

  it('maps 400 to voicebox_validation with field', async () => {
    const client = new VoiceBoxClient({
      baseUrl: 'http://vb',
      token: 't',
      fetch: mockFetch(() =>
        new Response(JSON.stringify({ error: 'validation_failed', field: 'text', message: 'text too long' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    });
    await expect(
      client.synthesizePhoneWav({ text: 'x'.repeat(10000), speakerId: 1 }),
    ).rejects.toMatchObject({ code: 'voicebox_validation', field: 'text' });
  });

  it('maps fetch reject to engine_unreachable', async () => {
    const client = new VoiceBoxClient({
      baseUrl: 'http://vb',
      token: 't',
      fetch: () => Promise.reject(new Error('ECONNREFUSED')),
    });
    await expect(
      client.synthesizePhoneWav({ text: 'x', speakerId: 1 }),
    ).rejects.toMatchObject({ code: 'engine_unreachable' });
  });

  it('maps AbortError to engine_timeout', async () => {
    const client = new VoiceBoxClient({
      baseUrl: 'http://vb',
      token: 't',
      timeoutMs: 5,
      fetch: (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const e = new Error('aborted');
            e.name = 'AbortError';
            reject(e);
          });
        }),
    });
    await expect(
      client.synthesizePhoneWav({ text: 'x', speakerId: 1 }),
    ).rejects.toMatchObject({ code: 'engine_timeout' });
  });
});

describe('loadVoiceBoxClient / isVoiceBoxConfigured', () => {
  it('returns null when VOICEBOX_URL is empty/unset', () => {
    expect(loadVoiceBoxClient({} as unknown as NodeJS.ProcessEnv)).toBeNull();
    expect(loadVoiceBoxClient({ VOICEBOX_URL: '' } as unknown as NodeJS.ProcessEnv)).toBeNull();
    expect(loadVoiceBoxClient({ VOICEBOX_URL: '   ' } as unknown as NodeJS.ProcessEnv)).toBeNull();
  });

  it('returns a client when URL is set, regardless of token (so 401 surfaces)', () => {
    const c = loadVoiceBoxClient({
      VOICEBOX_URL: 'http://vb:3921',
      VOICEBOX_TOKEN: 'tok',
    } as unknown as NodeJS.ProcessEnv);
    expect(c).not.toBeNull();
  });

  it('isVoiceBoxConfigured tracks URL only', () => {
    expect(isVoiceBoxConfigured({ VOICEBOX_URL: '' } as unknown as NodeJS.ProcessEnv)).toBe(false);
    expect(isVoiceBoxConfigured({ VOICEBOX_URL: 'http://x' } as unknown as NodeJS.ProcessEnv)).toBe(true);
  });
});

describe('VoiceBoxError', () => {
  it('carries code, status and optional field', () => {
    const e = new VoiceBoxError('m', 'voicebox_validation', 400, 'text');
    expect(e.code).toBe('voicebox_validation');
    expect(e.status).toBe(400);
    expect(e.field).toBe('text');
  });
});
