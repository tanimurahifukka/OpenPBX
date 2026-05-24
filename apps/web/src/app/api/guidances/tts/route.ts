// POST /api/guidances/tts
//
// Generate a phone-ready WAV via the configured VoiceBox server, then save
// it into Asterisk's sounds/custom via saveGuidanceWav() so IVR can play
// it. Admin-only because this writes to disk and the AMI side reloads
// dialplan on subsequent IVR edits.
//
// Why a proxy instead of letting the browser hit VoiceBox directly?
//   - VoiceBox runs on 127.0.0.1 (or an internal Docker network) by design.
//   - VOICEBOX_TOKEN must not leak to the browser.
//   - We have to translate VoiceBox output → saveGuidanceWav() inside the
//     OpenPBX container that has the sounds volume mounted.

import { NextResponse } from 'next/server';
import { requireApi } from '@/lib/auth';
import { saveGuidanceWav, InvalidGuidanceError } from '@/lib/guidances';
import { loadVoiceBoxClient, VoiceBoxError } from '@/lib/voicebox';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Body {
  name?: unknown;
  text?: unknown;
  speakerId?: unknown;
  speedScale?: unknown;
  pitchScale?: unknown;
  intonationScale?: unknown;
  volumeScale?: unknown;
}

const NAME_RE = /^[A-Za-z0-9_/-]{1,80}$/;
const TEXT_MAX = 500;

function bad(field: string, message: string) {
  return NextResponse.json({ error: 'validation_failed', field, message }, { status: 400 });
}

export async function POST(req: Request) {
  const auth = await requireApi(['admin']);
  if (auth instanceof Response) return auth;

  const client = loadVoiceBoxClient();
  if (!client) {
    return NextResponse.json(
      {
        error: 'voicebox_not_configured',
        message:
          'VoiceBox が設定されていません。docker-compose の web service に VOICEBOX_URL と VOICEBOX_TOKEN を追加してください。',
      },
      { status: 503 },
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  // ---- validate locally so we never round-trip obviously-bad input ----
  if (typeof body.name !== 'string' || !NAME_RE.test(body.name)) {
    return bad('name', 'name は英数字 / _ / - / / のみ (1〜80 文字)');
  }
  if (typeof body.text !== 'string') return bad('text', 'text が必要です');
  const text = body.text.trim();
  if (text.length === 0) return bad('text', 'text が空です');
  if (text.length > TEXT_MAX) return bad('text', `text は ${TEXT_MAX} 文字以内です`);
  if (
    typeof body.speakerId !== 'number' ||
    !Number.isInteger(body.speakerId) ||
    body.speakerId < 0
  ) {
    return bad('speakerId', 'speakerId は非負整数です');
  }

  const name = body.name;
  const speakerId = body.speakerId;
  const synthesizeInput = {
    name,
    text,
    speakerId,
    ...(typeof body.speedScale === 'number' && { speedScale: body.speedScale }),
    ...(typeof body.pitchScale === 'number' && { pitchScale: body.pitchScale }),
    ...(typeof body.intonationScale === 'number' && { intonationScale: body.intonationScale }),
    ...(typeof body.volumeScale === 'number' && { volumeScale: body.volumeScale }),
  };

  try {
    const result = await client.synthesizePhoneWav(synthesizeInput);
    const guidance = await saveGuidanceWav(name, result.bytes, { source: 'tts', text });
    return NextResponse.json({
      ok: true,
      guidance,
      engine: result.engine,
      speakerId: result.speakerId,
      sampleRate: result.sampleRate,
      channels: result.channels,
    });
  } catch (e) {
    if (e instanceof InvalidGuidanceError) {
      return NextResponse.json({ error: 'invalid_guidance', message: e.message }, { status: 400 });
    }
    if (e instanceof VoiceBoxError) {
      const status =
        e.code === 'voicebox_validation'
          ? 400
          : e.code === 'voicebox_unauthorized'
            ? 502
            : e.code === 'engine_unreachable' || e.code === 'engine_timeout'
              ? 503
              : 502;
      return NextResponse.json(
        {
          error: 'voicebox_error',
          code: e.code,
          message: humanizeVoiceBoxError(e),
          ...(e.field ? { field: e.field } : {}),
        },
        { status },
      );
    }
    console.error('[POST /api/guidances/tts]', e);
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}

function humanizeVoiceBoxError(e: VoiceBoxError): string {
  switch (e.code) {
    case 'engine_unreachable':
      return 'VoiceBox サーバーに接続できません。docker compose で voicebox が起動しているか確認してください。';
    case 'engine_timeout':
      return 'VoiceBox からの応答がタイムアウトしました。';
    case 'voicebox_unauthorized':
      return 'VoiceBox の認証に失敗しました。VOICEBOX_TOKEN が正しいか確認してください。';
    case 'voicebox_validation':
      return e.message;
    case 'engine_unexpected_body':
      return 'VoiceBox からの応答が想定外でした (audio/wav が返ってきていません)。';
    default:
      return e.message;
  }
}
