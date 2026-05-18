import { NextResponse } from 'next/server';
import { ingestCdrOnce } from '@/lib/cdr';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  const r = await ingestCdrOnce();
  return NextResponse.json(r);
}

export async function GET() {
  const r = await ingestCdrOnce();
  return NextResponse.json(r);
}
