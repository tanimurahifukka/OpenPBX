import { NextResponse } from 'next/server';
import { requireAccount, recordAudit, requestMeta } from '@/lib/auth';
import { createPatientRecord, InvalidPatientError } from '@/lib/patients';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  let me;
  try {
    me = await requireAccount();
  } catch {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const ct = req.headers.get('content-type') ?? '';
  let patientId = '';
  let extension: string | undefined;
  let kind: 'triage' | 'call' | 'note' = 'note';
  let summary: string | undefined;
  let note: string | undefined;
  try {
    if (ct.includes('application/json')) {
      const body = (await req.json()) as Record<string, string | undefined>;
      patientId = String(body.patientId ?? '');
      extension = body.extension || undefined;
      kind = (body.kind as 'triage' | 'call' | 'note') || 'note';
      summary = body.summary || undefined;
      note = body.note || undefined;
    } else {
      const form = await req.formData();
      patientId = String(form.get('patientId') ?? '');
      extension = String(form.get('extension') ?? '') || undefined;
      kind = (String(form.get('kind') ?? 'note') as 'triage' | 'call' | 'note');
      summary = String(form.get('summary') ?? '') || undefined;
      note = String(form.get('note') ?? '') || undefined;
    }
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }
  try {
    const r = createPatientRecord({ patientId, extension, kind, summary, note });
    const meta = await requestMeta();
    recordAudit({
      actor: me.username,
      action: 'patient.record.create',
      target: patientId,
      details: { kind, extension },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return NextResponse.json({ ok: true, record: r }, { status: 201 });
  } catch (err) {
    if (err instanceof InvalidPatientError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error('[patients/records POST]', err);
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}
