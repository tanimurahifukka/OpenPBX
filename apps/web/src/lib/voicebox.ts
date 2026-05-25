// VoiceBox client.
//
// VoiceBox is a separate local server that converts text to a phone-ready
// 8 kHz mono PCM WAV via VOICEVOX. We never embed VOICEVOX into OpenPBX —
// instead we call VoiceBox over REST when the operator has configured one.
//
// Env:
//   VOICEBOX_URL    base URL of the VoiceBox server. Empty/unset disables
//                   the "文章から電話案内を作る" feature in /guidances.
//   VOICEBOX_TOKEN  Bearer token. Required by VoiceBox for /speakers and
//                   /synthesize-phone-wav.

export interface VoiceBoxSpeaker {
  speakerId: number;
  speakerName: string;
  styleName: string;
  /** Credit string to display next to generated audio ("VOICEVOX:<character>"). */
  credit: string;
}

export interface VoiceBoxSpeakersResponse {
  engine: string;
  speakers: VoiceBoxSpeaker[];
}

export interface VoiceBoxSynthesizeInput {
  /** Optional. Logged on the VoiceBox side but not used for storage. */
  name?: string;
  text: string;
  speakerId: number;
  speedScale?: number;
  pitchScale?: number;
  intonationScale?: number;
  volumeScale?: number;
}

export interface VoiceBoxSynthesizeResult {
  bytes: Uint8Array;
  engine: string;
  speakerId: number;
  sampleRate: number;
  channels: number;
}

export type VoiceBoxErrorCode =
  | 'not_configured'
  | 'engine_unreachable'
  | 'engine_timeout'
  | 'engine_status'
  | 'engine_unexpected_body'
  | 'voicebox_status'
  | 'voicebox_unauthorized'
  | 'voicebox_validation';

export class VoiceBoxError extends Error {
  constructor(
    message: string,
    public readonly code: VoiceBoxErrorCode,
    public readonly status?: number,
    /** Field name when code === 'voicebox_validation'. */
    public readonly field?: string,
  ) {
    super(message);
    this.name = 'VoiceBoxError';
  }
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface VoiceBoxClientOptions {
  baseUrl: string;
  token: string;
  fetch?: FetchLike;
  timeoutMs?: number;
}

export class VoiceBoxClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly fetchImpl: FetchLike;
  private readonly timeoutMs: number;

  constructor(opts: VoiceBoxClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '');
    this.token = opts.token;
    this.fetchImpl = opts.fetch ?? (globalThis.fetch as FetchLike);
    this.timeoutMs = opts.timeoutMs ?? 20000;
  }

  async listSpeakers(): Promise<VoiceBoxSpeakersResponse> {
    const res = await this.request('GET', '/speakers');
    const body = await this.parseJson(res);
    if (
      !body ||
      typeof body !== 'object' ||
      Array.isArray(body) ||
      typeof (body as { engine?: unknown }).engine !== 'string' ||
      !Array.isArray((body as { speakers?: unknown }).speakers)
    ) {
      throw new VoiceBoxError('VoiceBox /speakers returned unexpected body', 'engine_unexpected_body');
    }
    return body as VoiceBoxSpeakersResponse;
  }

  async synthesizePhoneWav(input: VoiceBoxSynthesizeInput): Promise<VoiceBoxSynthesizeResult> {
    const res = await this.request('POST', '/synthesize-phone-wav', {
      headers: { 'Content-Type': 'application/json', Accept: 'audio/wav' },
      body: JSON.stringify(input),
    });
    const ct = res.headers.get('content-type') ?? '';
    if (!ct.includes('audio/wav')) {
      throw new VoiceBoxError(
        `VoiceBox returned non-audio response (content-type=${ct})`,
        'engine_unexpected_body',
      );
    }
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.length < 12) {
      throw new VoiceBoxError('VoiceBox returned empty audio body', 'engine_unexpected_body');
    }
    const head = Buffer.from(buf.slice(0, 12)).toString('ascii');
    if (!head.startsWith('RIFF') || !head.includes('WAVE')) {
      throw new VoiceBoxError('VoiceBox audio body is not a RIFF/WAVE wav', 'engine_unexpected_body');
    }
    return {
      bytes: buf,
      engine: res.headers.get('x-voicebox-engine') ?? 'VOICEVOX',
      speakerId: numberHeader(res, 'x-voicebox-speaker-id', input.speakerId),
      sampleRate: numberHeader(res, 'x-voicebox-sample-rate', 8000),
      channels: numberHeader(res, 'x-voicebox-channels', 1),
    };
  }

  async ping(): Promise<boolean> {
    try {
      // /health is unauthenticated on VoiceBox. We use it to surface a clear
      // "VoiceBox itself is up but VOICEVOX may not be" signal later.
      const res = await this.fetchImpl(`${this.baseUrl}/health`, { method: 'GET' });
      return res.ok;
    } catch {
      return false;
    }
  }

  private async request(
    method: string,
    path: string,
    init?: RequestInit,
  ): Promise<Response> {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), this.timeoutMs);
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}${path}`, {
        ...init,
        method,
        headers: {
          ...(init?.headers as Record<string, string> | undefined),
          Authorization: `Bearer ${this.token}`,
        },
        signal: ac.signal,
      });
    } catch (e) {
      const err = e as { name?: string };
      if (err?.name === 'AbortError') {
        throw new VoiceBoxError(
          `VoiceBox timed out after ${this.timeoutMs}ms`,
          'engine_timeout',
        );
      }
      throw new VoiceBoxError(
        `VoiceBox unreachable: ${(e as Error).message}`,
        'engine_unreachable',
      );
    } finally {
      clearTimeout(timer);
    }
    if (res.status === 401 || res.status === 403) {
      throw new VoiceBoxError(`VoiceBox refused auth: HTTP ${res.status}`, 'voicebox_unauthorized', res.status);
    }
    if (res.status === 400) {
      // VoiceBox returns { error: 'validation_failed', field, message }
      try {
        const j = (await res.clone().json()) as { field?: string; message?: string };
        throw new VoiceBoxError(
          j.message ?? 'VoiceBox rejected the request',
          'voicebox_validation',
          400,
          j.field,
        );
      } catch (e) {
        if (e instanceof VoiceBoxError) throw e;
        throw new VoiceBoxError('VoiceBox returned HTTP 400 with non-JSON body', 'voicebox_status', 400);
      }
    }
    if (res.status >= 500) {
      // Engine-side error from VoiceBox (engine_error / converter_error).
      let detail = '';
      try {
        const j = (await res.clone().json()) as { code?: string; message?: string };
        if (j.code) detail = `:${j.code}`;
      } catch {
        /* ignore */
      }
      throw new VoiceBoxError(
        `VoiceBox engine error HTTP ${res.status}${detail}`,
        res.status === 503 ? 'engine_unreachable' : 'engine_status',
        res.status,
      );
    }
    if (!res.ok) {
      throw new VoiceBoxError(`VoiceBox HTTP ${res.status}`, 'voicebox_status', res.status);
    }
    return res;
  }

  private async parseJson(res: Response): Promise<unknown> {
    try {
      return await res.json();
    } catch {
      throw new VoiceBoxError('VoiceBox body was not valid JSON', 'engine_unexpected_body');
    }
  }
}

function numberHeader(res: Response, name: string, fallback: number): number {
  const v = res.headers.get(name);
  if (v == null) return fallback;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Read env and build a client, or return null when VoiceBox is not
 * configured (so the UI can hide the "文章から電話案内を作る" section
 * gracefully rather than throwing on first request).
 */
export function loadVoiceBoxClient(env: NodeJS.ProcessEnv = process.env): VoiceBoxClient | null {
  const url = env.VOICEBOX_URL?.trim();
  const token = env.VOICEBOX_TOKEN?.trim() ?? '';
  if (!url || url.length === 0) return null;
  // We deliberately allow empty token here so the caller hits VoiceBox and
  // gets a clear 503/401 — easier to diagnose than a silent disable.
  return new VoiceBoxClient({ baseUrl: url, token });
}

export function isVoiceBoxConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return !!env.VOICEBOX_URL?.trim();
}
