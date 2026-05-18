import { NextResponse } from 'next/server';
import path from 'node:path';
import fs from 'node:fs';
import { stat } from 'node:fs/promises';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const RECORDINGS_DIR = process.env.RECORDINGS_DIR ?? '/app/data/recordings';
const SAFE_NAME = /^[A-Za-z0-9._-]+\.wav$/;

export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  if (!SAFE_NAME.test(file)) {
    return NextResponse.json({ error: 'invalid filename' }, { status: 400 });
  }
  const full = path.join(RECORDINGS_DIR, file);
  const resolved = path.resolve(full);
  const base = path.resolve(RECORDINGS_DIR);
  if (!resolved.startsWith(base + path.sep) && resolved !== base) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  let size = 0;
  try {
    const s = await stat(resolved);
    if (!s.isFile()) return NextResponse.json({ error: 'not a file' }, { status: 404 });
    size = s.size;
  } catch {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
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
