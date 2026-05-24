// event_outbox SQLite テーブルの薄いラッパ。
// テーブル DDL 本体は lib/db.ts の SCHEMA に乗せ、ここでは操作だけ提供する。
//
// status:
//   pending   - file drop 済みだが未送信（HTTP push 用）
//   sent      - 送信成功（HTTP push）
//   dead      - 4xx 等の永続失敗（contract 違反など）

import type Database from 'better-sqlite3';
import { getDb } from '../../db';
import type { OpenpbxEventV1 } from './schema';

export type OutboxStatus = 'pending' | 'sent' | 'dead';

// UI 表示用の日本語ラベル。CLI 用の英語ステータスは内部値として残し、
// 画面では必ずこの label / tone を経由して出す。
// - pending = 送信待ち (黄)。watcher が outbox に積み、push loop が拾うまで
// - sent    = 送信済み (緑)。command-room の ack を受領
// - dead    = 確認が必要 (赤)。contract 違反 / 400-422 等で再送不可
export const OUTBOX_STATUS_LABEL: Record<OutboxStatus, string> = {
  pending: '送信待ち',
  sent: '送信済み',
  dead: '確認が必要',
};

export const OUTBOX_STATUS_TONE: Record<OutboxStatus, 'warning' | 'ok' | 'error'> = {
  pending: 'warning',
  sent: 'ok',
  dead: 'error',
};

export interface OutboxRow {
  eventId: string;
  status: OutboxStatus;
  payloadJson: string;
  attempts: number;
  lastError: string | null;
  createdAt: string;
  sentAt: string | null;
}

interface OutboxRawRow {
  event_id: string;
  status: OutboxStatus;
  payload_json: string;
  attempts: number;
  last_error: string | null;
  created_at: string;
  sent_at: string | null;
}

function mapRow(r: OutboxRawRow): OutboxRow {
  return {
    eventId: r.event_id,
    status: r.status,
    payloadJson: r.payload_json,
    attempts: r.attempts,
    lastError: r.last_error,
    createdAt: r.created_at,
    sentAt: r.sent_at,
  };
}

const INSERT_SQL = `
INSERT INTO event_outbox (event_id, status, payload_json, attempts, last_error, created_at)
VALUES (?, 'pending', ?, 0, NULL, datetime('now'))
ON CONFLICT(event_id) DO NOTHING
`;

export function upsertPending(eventId: string, event: OpenpbxEventV1, db: Database.Database = getDb()): boolean {
  const info = db.prepare(INSERT_SQL).run(eventId, JSON.stringify(event));
  return info.changes > 0;
}

export function getOutboxRow(eventId: string, db: Database.Database = getDb()): OutboxRow | null {
  const r = db
    .prepare(`SELECT * FROM event_outbox WHERE event_id = ?`)
    .get(eventId) as OutboxRawRow | undefined;
  return r ? mapRow(r) : null;
}

export function listPending(limit = 50, db: Database.Database = getDb()): OutboxRow[] {
  const rows = db
    .prepare(`SELECT * FROM event_outbox WHERE status = 'pending' ORDER BY created_at ASC LIMIT ?`)
    .all(limit) as OutboxRawRow[];
  return rows.map(mapRow);
}

export function markSent(eventId: string, db: Database.Database = getDb()): void {
  db.prepare(
    `UPDATE event_outbox SET status = 'sent', sent_at = datetime('now'), last_error = NULL WHERE event_id = ?`,
  ).run(eventId);
}

export function markFailed(eventId: string, error: string, db: Database.Database = getDb()): void {
  db.prepare(
    `UPDATE event_outbox SET attempts = attempts + 1, last_error = ? WHERE event_id = ?`,
  ).run(error, eventId);
}

export function markDead(eventId: string, error: string, db: Database.Database = getDb()): void {
  db.prepare(
    `UPDATE event_outbox SET status = 'dead', attempts = attempts + 1, last_error = ? WHERE event_id = ?`,
  ).run(error, eventId);
}

export function countByStatus(db: Database.Database = getDb()): Record<OutboxStatus, number> {
  const rows = db
    .prepare(`SELECT status, COUNT(*) AS n FROM event_outbox GROUP BY status`)
    .all() as Array<{ status: OutboxStatus; n: number }>;
  const out: Record<OutboxStatus, number> = { pending: 0, sent: 0, dead: 0 };
  for (const r of rows) out[r.status] = r.n;
  return out;
}
