import { NextResponse } from 'next/server';
import {
  listExtensions,
  createExtension,
  writePjsipConfigAndReload,
  InvalidExtensionError,
} from '@/lib/extensions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ extensions: listExtensions() });
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  const o = (body ?? {}) as Record<string, unknown>;
  const number = typeof o.number === 'string' ? o.number : '';
  const secret = typeof o.secret === 'string' ? o.secret : '';
  const displayName = typeof o.displayName === 'string' ? o.displayName : undefined;
  const note = typeof o.note === 'string' ? o.note : undefined;

  try {
    const ext = createExtension({ number, displayName, secret, note });
    const result = await writePjsipConfigAndReload();
    return NextResponse.json({ ok: true, extension: ext, reload: result }, { status: 201 });
  } catch (err) {
    if (err instanceof InvalidExtensionError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error('[POST /api/extensions]', err);
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}
