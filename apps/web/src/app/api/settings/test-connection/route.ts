// POST /api/settings/test-connection
//
// Test connectivity to command-room or VoiceBox from within the OpenPBX
// container. Returns a human-readable result so the operator sees green/red
// without reading logs.
//
// body: { target: "command-room" | "voicebox" }
//
// command-room: tries HEAD to pushUrl (just checks reachability, not auth).
// voicebox:     tries GET /health (unauthenticated endpoint on VoiceBox).

import { NextResponse } from 'next/server';
import { requireApi } from '@/lib/auth';
import { getCommandRoomConfig, getVoiceBoxConfig } from '@/lib/settings';
import { UPSTREAM_BRAND } from '@/lib/branding';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Body {
  target?: unknown;
  /** Optional override URL for testing before saving. */
  url?: unknown;
  token?: unknown;
}

export async function POST(req: Request) {
  const auth = await requireApi(['admin']);
  if (auth instanceof Response) return auth;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const target = body.target;
  if (target !== 'command-room' && target !== 'voicebox') {
    return NextResponse.json({ error: 'target must be "command-room" or "voicebox"' }, { status: 400 });
  }

  if (target === 'command-room') {
    const cr = getCommandRoomConfig();
    const testUrl = typeof body.url === 'string' && body.url.trim() ? body.url.trim() : cr.pushUrl;
    if (!testUrl) {
      return NextResponse.json({ ok: false, message: `${UPSTREAM_BRAND.shortName} の接続先が設定されていません` });
    }
    try {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 10000);
      const res = await fetch(testUrl, { method: 'HEAD', signal: ac.signal });
      clearTimeout(timer);
      // command-room returns 401 without a valid token, but that still means
      // the server is reachable. 404 is also fine (endpoint exists on the host).
      if (res.status < 500) {
        return NextResponse.json({
          ok: true,
          message: `${UPSTREAM_BRAND.shortName} に接続できました (HTTP ${res.status})`,
          status: res.status,
        });
      }
      return NextResponse.json({
        ok: false,
        message: `${UPSTREAM_BRAND.shortName} が HTTP ${res.status} を返しました。サーバーは起動していますか？`,
        status: res.status,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return NextResponse.json({
        ok: false,
        message: `${UPSTREAM_BRAND.shortName} に接続できません: ${msg.includes('abort') ? 'タイムアウト (10秒)' : msg}`,
      });
    }
  }

  if (target === 'voicebox') {
    const vb = getVoiceBoxConfig();
    const testUrl = typeof body.url === 'string' && body.url.trim() ? body.url.trim() : vb.url;
    if (!testUrl) {
      return NextResponse.json({ ok: false, message: 'VoiceBox の URL が設定されていません' });
    }
    try {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 10000);
      const res = await fetch(`${testUrl.replace(/\/+$/, '')}/health`, { method: 'GET', signal: ac.signal });
      clearTimeout(timer);
      if (!res.ok) {
        return NextResponse.json({
          ok: false,
          message: `VoiceBox が HTTP ${res.status} を返しました`,
          status: res.status,
        });
      }
      const health = (await res.json()) as { voicevox?: { ok?: boolean } };
      const voicevoxOk = health?.voicevox?.ok === true;
      return NextResponse.json({
        ok: true,
        message: voicevoxOk
          ? 'VoiceBox + VOICEVOX エンジン接続OK'
          : 'VoiceBox は起動していますが、VOICEVOX エンジンに接続できていません',
        voicevoxOk,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return NextResponse.json({
        ok: false,
        message: `VoiceBox に接続できません: ${msg.includes('abort') ? 'タイムアウト (10秒)' : msg}`,
      });
    }
  }
}
