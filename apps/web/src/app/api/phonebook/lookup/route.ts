import { NextResponse } from 'next/server';
import { lookupByNumber } from '@/lib/phonebook';
import { requireApi } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const auth = await requireApi();
  if (auth instanceof Response) return auth;
  const url = new URL(req.url);
  const num = url.searchParams.get('number');
  if (!num) return NextResponse.json({ error: 'missing number' }, { status: 400 });
  const entry = lookupByNumber(num);
  if (!entry) return NextResponse.json({ entry: null }, { status: 404 });
  return NextResponse.json({ entry });
}
