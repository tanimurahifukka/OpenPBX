import Database from 'better-sqlite3';
import { beforeEach, describe, expect, it } from 'vitest';

import { applySchema } from '../../../db';
import {
  countByStatus,
  getOutboxRow,
  listPending,
  markDead,
  markFailed,
  markSent,
  upsertPending,
} from '../outbox';
import { SCHEMA_ID_V1 } from '../schema';
import type { OpenpbxEventV1 } from '../schema';

function makeEvent(uniqueId: string): OpenpbxEventV1 {
  return {
    schema: SCHEMA_ID_V1,
    eventId: `openpbx:clinic-main:${uniqueId}`,
    source: 'openpbx',
    pbxInstanceId: 'clinic-main',
    workspaceExternalKey: 'tamura-hifuka',
    call: {
      uniqueId,
      kind: 'same_day_reservation',
      direction: 'inbound',
      extension: '9001',
      callerId: '1001',
      callerName: 'Reception 1001',
      calleeExtension: '9001',
      durationSec: null,
    },
    recording: {
      fileName: `${uniqueId}-9001-1001.wav`,
      relativePath: `${uniqueId}-9001-1001.wav`,
      contentType: 'audio/wav',
      sizeBytes: null,
      sha256: null,
    },
    receivedAt: '2026-05-17T13:27:03Z',
  };
}

let db: Database.Database;

beforeEach(() => {
  db = new Database(':memory:');
  applySchema(db);
});

describe('event_outbox 操作', () => {
  it('upsertPending は新規 eventId で true、重複で false（冪等）', () => {
    const ev = makeEvent('1.0');
    expect(upsertPending(ev.eventId, ev, db)).toBe(true);
    expect(upsertPending(ev.eventId, ev, db)).toBe(false);
    const row = getOutboxRow(ev.eventId, db);
    expect(row?.status).toBe('pending');
    expect(row?.attempts).toBe(0);
  });

  it('listPending は pending のみ created_at 順', async () => {
    const a = makeEvent('1.0');
    upsertPending(a.eventId, a, db);
    await new Promise((r) => setTimeout(r, 5));
    const b = makeEvent('2.0');
    upsertPending(b.eventId, b, db);

    const pending = listPending(10, db);
    expect(pending.map((r) => r.eventId)).toEqual([a.eventId, b.eventId]);

    markSent(a.eventId, db);
    const after = listPending(10, db);
    expect(after.map((r) => r.eventId)).toEqual([b.eventId]);
  });

  it('markSent は sent_at をセットし error をクリア', () => {
    const ev = makeEvent('1.0');
    upsertPending(ev.eventId, ev, db);
    markFailed(ev.eventId, 'flaky network', db);
    markSent(ev.eventId, db);
    const row = getOutboxRow(ev.eventId, db);
    expect(row?.status).toBe('sent');
    expect(row?.sentAt).not.toBeNull();
    expect(row?.lastError).toBeNull();
  });

  it('markFailed は attempts を +1 し lastError を記録', () => {
    const ev = makeEvent('1.0');
    upsertPending(ev.eventId, ev, db);
    markFailed(ev.eventId, 'first', db);
    markFailed(ev.eventId, 'second', db);
    const row = getOutboxRow(ev.eventId, db);
    expect(row?.attempts).toBe(2);
    expect(row?.lastError).toBe('second');
    expect(row?.status).toBe('pending');
  });

  it('markDead は status=dead', () => {
    const ev = makeEvent('1.0');
    upsertPending(ev.eventId, ev, db);
    markDead(ev.eventId, 'contract violation', db);
    const row = getOutboxRow(ev.eventId, db);
    expect(row?.status).toBe('dead');
    expect(row?.lastError).toBe('contract violation');
  });

  it('countByStatus はカウント可', () => {
    const a = makeEvent('1.0');
    const b = makeEvent('2.0');
    const c = makeEvent('3.0');
    upsertPending(a.eventId, a, db);
    upsertPending(b.eventId, b, db);
    upsertPending(c.eventId, c, db);
    markSent(a.eventId, db);
    markDead(c.eventId, 'x', db);
    expect(countByStatus(db)).toEqual({ pending: 1, sent: 1, dead: 1 });
  });
});
