// `GET /api/internal/pbx-status` — Edge Fleet PBX Safety Kernel (ADR 0018 §D).
//
// Consumed by cr-stack (the Edge Agent) during update preflight to decide
// whether a `pbxActiveCallGuard` / `pbxBusinessHourRestartGuard` should defer
// a restart. This is an INTERNAL endpoint: it authenticates with a shared
// bearer token (`PBX_INTERNAL_TOKEN`, a system secret like CRON_SECRET), not
// the staff session cookie. If the token env is unset the endpoint is
// disabled (503) so it is never accidentally exposed unauthenticated.

import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { amiIsReady, activeCallSummary } from '@/lib/ami';
import { isWithinBusinessHours } from '@/lib/businessHours';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function tokenOk(header: string | null): boolean {
  const expected = process.env.PBX_INTERNAL_TOKEN ?? '';
  if (expected.length === 0) return false; // disabled
  const got = (header ?? '').replace(/^Bearer\s+/i, '');
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function GET(req: Request) {
  if ((process.env.PBX_INTERNAL_TOKEN ?? '').length === 0) {
    return NextResponse.json({ error: 'pbx_status_disabled' }, { status: 503 });
  }
  if (!tokenOk(req.headers.get('authorization'))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const ready = amiIsReady();
  const calls = activeCallSummary();

  return NextResponse.json({
    amiReady: ready,
    activeDevices: calls.activeDevices,
    anyActiveCall: calls.anyActiveCall,
    // Recording-in-progress tracking (MixMonitor) is not wired yet — null
    // means "unknown" so the agent treats it conservatively. (ADR 0018 §D TODO)
    recordingActive: null,
    withinBusinessHours: isWithinBusinessHours(),
    checkedAt: new Date().toISOString(),
  });
}
