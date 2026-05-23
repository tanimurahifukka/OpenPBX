import { NextResponse } from 'next/server';
import {
  getExtension,
  updateExtension,
  deleteExtension,
  writePjsipConfigAndReload,
  InvalidExtensionError,
} from '@/lib/extensions';
import { requireApi } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ number: string }> }) {
  const auth = await requireApi();
  if (auth instanceof Response) return auth;
  const { number } = await params;
  const ext = getExtension(number);
  if (!ext) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ extension: ext });
}

export async function PUT(req: Request, { params }: { params: Promise<{ number: string }> }) {
  const auth = await requireApi(['admin']);
  if (auth instanceof Response) return auth;
  const { number } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  const o = (body ?? {}) as Record<string, unknown>;
  try {
    const ext = updateExtension({
      number,
      secret: typeof o.secret === 'string' ? o.secret : '',
      displayName: typeof o.displayName === 'string' ? o.displayName : undefined,
      note: typeof o.note === 'string' ? o.note : undefined,
    });
    const reload = await writePjsipConfigAndReload();
    return NextResponse.json({ ok: true, extension: ext, reload });
  } catch (err) {
    if (err instanceof InvalidExtensionError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error('[PUT /api/extensions/:number]', err);
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ number: string }> }) {
  const auth = await requireApi(['admin']);
  if (auth instanceof Response) return auth;
  const { number } = await params;
  try {
    const removed = deleteExtension(number);
    if (!removed) return NextResponse.json({ error: 'not found' }, { status: 404 });
    const reload = await writePjsipConfigAndReload();
    return NextResponse.json({ ok: true, reload });
  } catch (err) {
    if (err instanceof InvalidExtensionError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error('[DELETE /api/extensions/:number]', err);
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}
