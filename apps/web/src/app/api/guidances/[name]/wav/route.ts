// GET /api/guidances/:name/wav
//
// Stream an already-saved guidance wav back to the browser so the operator
// can preview it on /guidances before sending it to IVR. Mirrors the
// recordings playback route but resolved under SOUNDS_DIR.
//
// `name` is the same identifier saveGuidanceWav() uses (e.g. custom/ivr-menu)
// and must match NAME_RE — no traversal characters. We additionally
// path.resolve and prefix-check against SOUNDS_DIR to defend in depth.

import { NextResponse } from 'next/server';
import path from 'node:path';
import fs from 'node:fs';
import { stat } from 'node:fs/promises';
import { requireApi } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SOUNDS_DIR = process.env.SOUNDS_DIR ?? '/sounds';
const NAME_RE = /^[A-Za-z0-9_/-]{1,80}$/;

export async function GET(_req: Request, ctx: { params: Promise<{ name: string }> }) {
  const auth = await requireApi();
  if (auth instanceof Response) return auth;

  const { name: encoded } = await ctx.params;
  // Next.js gives us %2F-decoded segments for [name]. We deliberately accept
  // names that contain "/" because saveGuidanceWav uses paths like
  // "custom/ivr-menu" — but NAME_RE still excludes "..".
  const name = decodeURIComponent(encoded);
  if (!NAME_RE.test(name)) {
    return NextResponse.json({ error: 'invalid_name' }, { status: 400 });
  }

  const full = path.join(SOUNDS_DIR, `${name}.wav`);
  const resolved = path.resolve(full);
  const base = path.resolve(SOUNDS_DIR);
  if (!resolved.startsWith(base + path.sep) && resolved !== base) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  let size: number;
  try {
    const s = await stat(resolved);
    if (!s.isFile()) return NextResponse.json({ error: 'not_a_file' }, { status: 404 });
    size = s.size;
  } catch {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const stream = fs.createReadStream(resolved);
  return new Response(stream as unknown as ReadableStream, {
    headers: {
      'Content-Type': 'audio/wav',
      'Content-Length': String(size),
      'Cache-Control': 'private, max-age=0, no-store',
    },
  });
}
