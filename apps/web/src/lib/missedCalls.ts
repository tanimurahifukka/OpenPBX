import type Database from 'better-sqlite3';
import { getDb } from './db';
import { upsertPending } from './events/v1/outbox';
import {
  SCHEMA_ID_V1,
  assertOpenpbxEventV1,
  buildEventId,
  type OpenpbxEventV1,
} from './events/v1/schema';

export interface MissedCall {
  uniqueid: string;
  src: string;
  dst: string;
  startAt: string;
  disposition: string;
}

const MISSED_DISPOSITIONS = new Set(['NO ANSWER', 'BUSY', 'FAILED']);

export function detectMissedCalls(
  sinceMinutes: number = 1,
  db: Database.Database = getDb(),
): MissedCall[] {
  const rows = db.prepare(
    `SELECT uniqueid, src, dst, start_at, disposition FROM cdr_records
     WHERE disposition IN ('NO ANSWER', 'BUSY', 'FAILED')
       AND billsec = 0
       AND src NOT LIKE '1%'
       AND length(src) >= 10
       AND datetime(imported_at) >= datetime('now', ?)
       AND uniqueid NOT IN (SELECT uniqueid FROM missed_call_events)
     ORDER BY start_at DESC`,
  ).all(`-${sinceMinutes} minutes`) as Array<{
    uniqueid: string;
    src: string;
    dst: string;
    start_at: string;
    disposition: string;
  }>;

  return rows.map((r) => ({
    uniqueid: r.uniqueid,
    src: r.src,
    dst: r.dst,
    startAt: r.start_at,
    disposition: r.disposition,
  }));
}

export function recordMissedCallEvent(
  uniqueid: string,
  db: Database.Database = getDb(),
): boolean {
  const info = db.prepare(
    `INSERT OR IGNORE INTO missed_call_events (uniqueid, created_at) VALUES (?, datetime('now'))`,
  ).run(uniqueid);
  return info.changes > 0;
}

export function deduplicateByCaller(calls: MissedCall[], windowMinutes: number = 5): MissedCall[] {
  const seen = new Map<string, number>();
  const result: MissedCall[] = [];
  for (const call of calls) {
    const lastTime = seen.get(call.src);
    const callTime = new Date(call.startAt).getTime();
    if (lastTime && callTime - lastTime < windowMinutes * 60_000) {
      continue;
    }
    seen.set(call.src, callTime);
    result.push(call);
  }
  return result;
}

export function listMissedCallEvents(
  limit: number = 50,
  db: Database.Database = getDb(),
): Array<{ uniqueid: string; src: string; dst: string; startAt: string; disposition: string; createdAt: string }> {
  const rows = db.prepare(
    `SELECT m.uniqueid, c.src, c.dst, c.start_at, c.disposition, m.created_at
     FROM missed_call_events m
     JOIN cdr_records c ON c.uniqueid = m.uniqueid
     ORDER BY m.created_at DESC
     LIMIT ?`,
  ).all(limit) as Array<{
    uniqueid: string;
    src: string;
    dst: string;
    start_at: string;
    disposition: string;
    created_at: string;
  }>;
  return rows.map((r) => ({
    uniqueid: r.uniqueid,
    src: r.src,
    dst: r.dst,
    startAt: r.start_at,
    disposition: r.disposition,
    createdAt: r.created_at,
  }));
}

export interface MissedCallEventEnv {
  pbxInstanceId: string;
  workspaceExternalKey: string;
}

function resolveMissedCallEventEnv(): MissedCallEventEnv {
  return {
    pbxInstanceId: process.env.OPENPBX_INSTANCE_ID || 'pbx-dev',
    workspaceExternalKey: process.env.OPENPBX_WORKSPACE_KEY || 'workspace-dev',
  };
}

function receivedAtIso(startAt: string): string {
  const trimmed = startAt.trim();
  if (/^\d{4}-\d{2}-\d{2}T/.test(trimmed)) {
    const d = new Date(trimmed);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(trimmed)) {
    return `${trimmed.replace(' ', 'T')}Z`;
  }
  const d = new Date(trimmed);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

export function buildMissedCallEvent(
  call: MissedCall,
  env: MissedCallEventEnv = resolveMissedCallEventEnv(),
): OpenpbxEventV1 {
  const extension = call.dst || 'unknown';
  const event: OpenpbxEventV1 = {
    schema: SCHEMA_ID_V1,
    eventId: buildEventId(env.pbxInstanceId, call.uniqueid),
    source: 'openpbx',
    pbxInstanceId: env.pbxInstanceId,
    workspaceExternalKey: env.workspaceExternalKey,
    call: {
      uniqueId: call.uniqueid,
      kind: 'missed_call',
      direction: 'inbound',
      extension,
      callerId: call.src,
      callerName: '',
      calleeExtension: call.dst || null,
      durationSec: 0,
    },
    recording: null,
    receivedAt: receivedAtIso(call.startAt),
  };
  assertOpenpbxEventV1(event);
  return event;
}

export function enqueueMissedCallEvent(
  call: MissedCall,
  env: MissedCallEventEnv = resolveMissedCallEventEnv(),
  db: Database.Database = getDb(),
): boolean {
  const event = buildMissedCallEvent(call, env);
  return upsertPending(event.eventId, event, db);
}
