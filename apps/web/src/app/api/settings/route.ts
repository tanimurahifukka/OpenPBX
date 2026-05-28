// GET /api/settings — current connection settings (admin only, no secrets in response)
// POST /api/settings — save connections from the Web UI

import { NextResponse } from 'next/server';
import { requireApi } from '@/lib/auth';
import {
  getCommandRoomConfig,
  getVoiceBoxConfig,
  setCommandRoomConfig,
  setVoiceBoxConfig,
  parseConnectCode,
} from '@/lib/settings';
import { UPSTREAM_BRAND } from '@/lib/branding';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireApi(['admin']);
  if (auth instanceof Response) return auth;

  const cr = getCommandRoomConfig();
  const vb = getVoiceBoxConfig();
  return NextResponse.json({
    commandRoom: {
      configured: cr.configured,
      pushUrl: cr.pushUrl || null,
      workspaceId: cr.workspaceId || null,
      hasToken: cr.pushToken.length > 0,
    },
    voiceBox: {
      configured: vb.configured,
      url: vb.url || null,
      hasToken: vb.token.length > 0,
    },
  });
}

interface SaveBody {
  commandRoom?: {
    connectCode?: string;
    pushUrl?: string;
    pushToken?: string;
    workspaceId?: string;
    sourceAccountId?: string;
  };
  voiceBox?: {
    url?: string;
    token?: string;
  };
}

export async function POST(req: Request) {
  const auth = await requireApi(['admin']);
  if (auth instanceof Response) return auth;

  let body: SaveBody;
  try {
    body = (await req.json()) as SaveBody;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const errors: string[] = [];

  if (body.commandRoom) {
    const cm = body.commandRoom;
    if (typeof cm.connectCode === 'string' && cm.connectCode.trim().length > 0) {
      const parsed = parseConnectCode(cm.connectCode);
      if (!parsed.ok) {
        errors.push(parsed.error);
      } else {
        setCommandRoomConfig({
          pushUrl: parsed.pushUrl,
          pushToken: parsed.pushToken,
          workspaceId: parsed.workspaceId,
          sourceAccountId: parsed.sourceAccountId,
        });
      }
    } else if (typeof cm.pushUrl === 'string') {
      if (!cm.pushUrl.trim()) {
        errors.push(`${UPSTREAM_BRAND.shortName} の接続先 URL が空です`);
      } else if (typeof cm.pushToken !== 'string' || !cm.pushToken.trim()) {
        errors.push(`${UPSTREAM_BRAND.shortName} の接続トークンが空です`);
      } else if (typeof cm.workspaceId !== 'string' || !cm.workspaceId.trim()) {
        errors.push(`${UPSTREAM_BRAND.shortName} の workspaceId が空です`);
      } else {
        setCommandRoomConfig({
          pushUrl: cm.pushUrl.trim(),
          pushToken: cm.pushToken.trim(),
          workspaceId: cm.workspaceId.trim(),
          sourceAccountId: typeof cm.sourceAccountId === 'string' ? cm.sourceAccountId.trim() : '',
        });
      }
    }
  }

  if (body.voiceBox) {
    const vb = body.voiceBox;
    if (typeof vb.url === 'string') {
      if (!vb.url.trim()) {
        errors.push('VoiceBox の URL が空です');
      } else {
        setVoiceBoxConfig({
          url: vb.url.trim(),
          token: typeof vb.token === 'string' ? vb.token.trim() : '',
        });
      }
    }
  }

  if (errors.length > 0) {
    return NextResponse.json({ ok: false, errors }, { status: 400 });
  }

  const cr = getCommandRoomConfig();
  const vbConf = getVoiceBoxConfig();
  return NextResponse.json({
    ok: true,
    commandRoom: { configured: cr.configured },
    voiceBox: { configured: vbConf.configured },
  });
}
