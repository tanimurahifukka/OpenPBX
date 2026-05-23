import { NextResponse } from 'next/server';
import { saveGuidanceWav, InvalidGuidanceError } from '@/lib/guidances';
import { requireApi } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const auth = await requireApi(['admin']);
  if (auth instanceof Response) return auth;
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'expect multipart/form-data' }, { status: 400 });
  const name = String(form.get('name') ?? '');
  const file = form.get('file');
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });
  if (!(file instanceof File)) return NextResponse.json({ error: 'file required' }, { status: 400 });
  try {
    const buf = new Uint8Array(await file.arrayBuffer());
    const guidance = await saveGuidanceWav(name, buf, { source: 'upload' });
    return NextResponse.json({ ok: true, guidance });
  } catch (err) {
    if (err instanceof InvalidGuidanceError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error('[POST /api/guidances]', err);
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}
