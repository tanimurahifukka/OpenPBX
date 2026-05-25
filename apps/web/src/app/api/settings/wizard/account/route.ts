// POST /api/settings/wizard/account
//
// First-run only: create the initial admin account when the DB has no
// accounts at all. Once any account exists, this endpoint returns 403
// (the wizard page also redirects away, so this is defense in depth).

import { NextResponse } from 'next/server';
import { createAccount, listAccounts } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Body {
  username?: unknown;
  password?: unknown;
}

export async function POST(req: Request) {
  const existing = listAccounts();
  if (existing.length > 0) {
    return NextResponse.json(
      { ok: false, error: 'アカウントは既に存在します。ウィザードは初回のみ使用できます。' },
      { status: 403 },
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }

  if (typeof body.username !== 'string' || !body.username.trim()) {
    return NextResponse.json({ ok: false, error: 'ユーザー名を入力してください' }, { status: 400 });
  }
  if (typeof body.password !== 'string' || body.password.length < 8) {
    return NextResponse.json({ ok: false, error: 'パスワードは 8 文字以上必要です' }, { status: 400 });
  }

  try {
    createAccount({
      username: body.username.trim(),
      displayName: undefined,
      password: body.password,
      role: 'admin',
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
