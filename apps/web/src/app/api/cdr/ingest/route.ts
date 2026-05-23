import { NextResponse } from 'next/server';
import { ingestCdrOnce } from '@/lib/cdr';
import { requireApi } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  const auth = await requireApi(['admin']);
  if (auth instanceof Response) return auth;
  const r = await ingestCdrOnce();
  return NextResponse.json(r);
}

export async function GET() {
  const auth = await requireApi(['admin']);
  if (auth instanceof Response) return auth;
  const r = await ingestCdrOnce();
  return NextResponse.json(r);
}
