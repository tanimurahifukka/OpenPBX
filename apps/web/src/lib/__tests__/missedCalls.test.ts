import { describe, expect, it, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createInMemoryDb } from '../db';
import {
  buildMissedCallEvent,
  detectMissedCalls,
  enqueueMissedCallEvent,
  recordMissedCallEvent,
  deduplicateByCaller,
  type MissedCall,
} from '../missedCalls';
import { getOutboxRow } from '../events/v1/outbox';

let db: Database.Database;

function insertCdr(
  db: Database.Database,
  uniqueid: string,
  src: string,
  dst: string,
  disposition: string,
  billsec: number = 0,
) {
  db.prepare(
    `INSERT INTO cdr_records (uniqueid, src, dst, disposition, billsec, duration, imported_at, start_at)
     VALUES (?, ?, ?, ?, ?, 0, datetime('now'), datetime('now'))`,
  ).run(uniqueid, src, dst, disposition, billsec);
}

beforeEach(() => {
  db = createInMemoryDb();
});

describe('detectMissedCalls', () => {
  it('detects NO ANSWER calls from external numbers', () => {
    insertCdr(db, 'u1', '09012345678', '9000', 'NO ANSWER');
    const missed = detectMissedCalls(5, db);
    expect(missed).toHaveLength(1);
    expect(missed[0].src).toBe('09012345678');
  });

  it('detects BUSY calls', () => {
    insertCdr(db, 'u1', '09012345678', '9000', 'BUSY');
    const missed = detectMissedCalls(5, db);
    expect(missed).toHaveLength(1);
  });

  it('detects FAILED calls', () => {
    insertCdr(db, 'u1', '09012345678', '9000', 'FAILED');
    const missed = detectMissedCalls(5, db);
    expect(missed).toHaveLength(1);
  });

  it('ignores ANSWERED calls', () => {
    insertCdr(db, 'u1', '09012345678', '9000', 'ANSWERED', 30);
    const missed = detectMissedCalls(5, db);
    expect(missed).toHaveLength(0);
  });

  it('ignores internal extensions (short src)', () => {
    insertCdr(db, 'u1', '1001', '1002', 'NO ANSWER');
    const missed = detectMissedCalls(5, db);
    expect(missed).toHaveLength(0);
  });

  it('excludes already recorded events', () => {
    insertCdr(db, 'u1', '09012345678', '9000', 'NO ANSWER');
    expect(recordMissedCallEvent('u1', db)).toBe(true);
    expect(recordMissedCallEvent('u1', db)).toBe(false);
    const missed = detectMissedCalls(5, db);
    expect(missed).toHaveLength(0);
  });
});

describe('deduplicateByCaller', () => {
  it('keeps first call per caller within window', () => {
    const now = Date.now();
    const calls: MissedCall[] = [
      { uniqueid: 'u1', src: '09012345678', dst: '9000', startAt: new Date(now).toISOString(), disposition: 'NO ANSWER' },
      { uniqueid: 'u2', src: '09012345678', dst: '9000', startAt: new Date(now + 60_000).toISOString(), disposition: 'NO ANSWER' },
      { uniqueid: 'u3', src: '08012345678', dst: '9000', startAt: new Date(now).toISOString(), disposition: 'NO ANSWER' },
    ];
    const result = deduplicateByCaller(calls, 5);
    expect(result).toHaveLength(2);
    expect(result.map((c) => c.uniqueid)).toEqual(['u1', 'u3']);
  });

  it('allows same caller after window expires', () => {
    const now = Date.now();
    const calls: MissedCall[] = [
      { uniqueid: 'u1', src: '09012345678', dst: '9000', startAt: new Date(now).toISOString(), disposition: 'NO ANSWER' },
      { uniqueid: 'u2', src: '09012345678', dst: '9000', startAt: new Date(now + 6 * 60_000).toISOString(), disposition: 'NO ANSWER' },
    ];
    const result = deduplicateByCaller(calls, 5);
    expect(result).toHaveLength(2);
  });
});

describe('missed call event outbox', () => {
  const env = { pbxInstanceId: 'clinic-main', workspaceExternalKey: 'tamura-hifuka' };

  it('builds a command-room-pbx/event/v1 missed_call payload', () => {
    const event = buildMissedCallEvent({
      uniqueid: 'u1',
      src: '09012345678',
      dst: '9000',
      startAt: '2026-05-17 14:01:00',
      disposition: 'NO ANSWER',
    }, env);
    expect(event.eventId).toBe('openpbx:clinic-main:u1');
    expect(event.call.kind).toBe('missed_call');
    expect(event.call.extension).toBe('9000');
    expect(event.recording).toBeNull();
    expect(event.receivedAt).toBe('2026-05-17T14:01:00Z');
  });

  it('enqueues missed_call once', () => {
    const call: MissedCall = {
      uniqueid: 'u1',
      src: '09012345678',
      dst: '9000',
      startAt: '2026-05-17 14:01:00',
      disposition: 'BUSY',
    };
    expect(enqueueMissedCallEvent(call, env, db)).toBe(true);
    expect(enqueueMissedCallEvent(call, env, db)).toBe(false);
    const row = getOutboxRow('openpbx:clinic-main:u1', db);
    expect(row?.status).toBe('pending');
    expect(JSON.parse(row?.payloadJson ?? '{}').call.kind).toBe('missed_call');
  });
});
