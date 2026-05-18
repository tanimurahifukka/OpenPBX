import { NextResponse } from 'next/server';
import { originate } from '@/lib/originate';
import { requireAccount, recordAudit, requestMeta } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  let me;
  try {
    me = await requireAccount();
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  let body: { from?: string; to?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  const from = (body.from ?? '').trim();
  const to = (body.to ?? '').trim();
  if (!/^[0-9*#+-]{2,20}$/.test(from)) return NextResponse.json({ error: 'invalid from' }, { status: 400 });
  if (!/^[0-9*#+-]{1,40}$/.test(to)) return NextResponse.json({ error: 'invalid to' }, { status: 400 });
  const meta = await requestMeta();
  try {
    const r = await originate({ from, to, callerId: `Click ${me.username}` });
    recordAudit({ actor: me.username, action: 'click2call', target: `${from}->${to}`, ip: meta.ip, userAgent: meta.userAgent });
    return NextResponse.json(r);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
