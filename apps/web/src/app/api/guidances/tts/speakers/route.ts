// GET /api/guidances/tts/speakers
//
// Proxies VoiceBox /speakers. Lets the /guidances UI render a speaker
// select without exposing VOICEBOX_TOKEN to the browser.
//
// Read-only and account-required (any logged-in user can see the list).

import { NextResponse } from 'next/server';
import { requireApi } from '@/lib/auth';
import { loadVoiceBoxClient, VoiceBoxError } from '@/lib/voicebox';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireApi();
  if (auth instanceof Response) return auth;

  const client = loadVoiceBoxClient();
  if (!client) {
    return NextResponse.json({ ok: false, error: 'voicebox_not_configured', speakers: [] }, { status: 503 });
  }

  try {
    const out = await client.listSpeakers();
    return NextResponse.json({ ok: true, ...out });
  } catch (e) {
    if (e instanceof VoiceBoxError) {
      const status =
        e.code === 'engine_unreachable' || e.code === 'engine_timeout'
          ? 503
          : e.code === 'voicebox_unauthorized'
            ? 502
            : 502;
      return NextResponse.json(
        { ok: false, error: 'voicebox_error', code: e.code, message: e.message },
        { status },
      );
    }
    console.error('[GET /api/guidances/tts/speakers]', e);
    return NextResponse.json({ ok: false, error: 'internal_error' }, { status: 500 });
  }
}
