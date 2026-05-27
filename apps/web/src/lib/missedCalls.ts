import type Database from 'better-sqlite3';
import { getDb } from './db';

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
): void {
  db.prepare(
    `INSERT OR IGNORE INTO missed_call_events (uniqueid, created_at) VALUES (?, datetime('now'))`,
  ).run(uniqueid);
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
