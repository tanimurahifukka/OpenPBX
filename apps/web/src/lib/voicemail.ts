import type Database from 'better-sqlite3';
import { getDb } from './db';
import { writeDialplanFile, signalAsteriskReload } from './dialplan';

export class InvalidVoicemailError extends Error {}

const NUMBER_RE = /^[0-9]{2,6}$/;
const PROMPT_RE = /^[A-Za-z0-9_./-]+$/;

export type VmMessageStatus = 'new' | 'read' | 'callback_done';

export interface VoicemailBox {
  id: number;
  number: string;
  name: string | null;
  prompt: string | null;
  updatedAt: string;
}

export interface VoicemailMessage {
  id: number;
  boxId: number;
  callerId: string;
  callerName: string;
  uniqueId: string;
  recordingFile: string | null;
  durationSec: number | null;
  status: VmMessageStatus;
  createdAt: string;
  readAt: string | null;
  callbackAt: string | null;
}

export interface VoicemailMessageWithBox extends VoicemailMessage {
  boxNumber: string;
  boxName: string | null;
}

interface BoxRow {
  id: number;
  number: string;
  name: string | null;
  prompt: string | null;
  updated_at: string;
}

interface MessageRow {
  id: number;
  box_id: number;
  caller_id: string;
  caller_name: string;
  unique_id: string;
  recording_file: string | null;
  duration_sec: number | null;
  status: VmMessageStatus;
  created_at: string;
  read_at: string | null;
  callback_at: string | null;
}

interface MessageWithBoxRow extends MessageRow {
  box_number: string;
  box_name: string | null;
}

function boxRowTo(r: BoxRow): VoicemailBox {
  return {
    id: r.id,
    number: r.number,
    name: r.name,
    prompt: r.prompt,
    updatedAt: r.updated_at,
  };
}

function msgRowTo(r: MessageRow): VoicemailMessage {
  return {
    id: r.id,
    boxId: r.box_id,
    callerId: r.caller_id,
    callerName: r.caller_name,
    uniqueId: r.unique_id,
    recordingFile: r.recording_file,
    durationSec: r.duration_sec,
    status: r.status,
    createdAt: r.created_at,
    readAt: r.read_at,
    callbackAt: r.callback_at,
  };
}

function msgWithBoxRowTo(r: MessageWithBoxRow): VoicemailMessageWithBox {
  return {
    ...msgRowTo(r),
    boxNumber: r.box_number,
    boxName: r.box_name,
  };
}

// --- Box CRUD ---

export function listBoxes(db: Database.Database = getDb()): VoicemailBox[] {
  return (db.prepare('SELECT * FROM voicemail_boxes ORDER BY number').all() as BoxRow[]).map(boxRowTo);
}

export function getBox(number: string, db: Database.Database = getDb()): VoicemailBox | null {
  const r = db.prepare('SELECT * FROM voicemail_boxes WHERE number = ?').get(number) as BoxRow | undefined;
  return r ? boxRowTo(r) : null;
}

export function getBoxById(id: number, db: Database.Database = getDb()): VoicemailBox | null {
  const r = db.prepare('SELECT * FROM voicemail_boxes WHERE id = ?').get(id) as BoxRow | undefined;
  return r ? boxRowTo(r) : null;
}

export interface UpsertBoxInput {
  number: string;
  name?: string;
  prompt?: string;
}

function validateBox(input: UpsertBoxInput): void {
  if (!NUMBER_RE.test(input.number)) throw new InvalidVoicemailError('留守電番号は 2〜6 桁');
  if (input.prompt && !PROMPT_RE.test(input.prompt)) {
    throw new InvalidVoicemailError(`prompt 名が不正: ${input.prompt}`);
  }
}

export function createBox(input: UpsertBoxInput, db: Database.Database = getDb()): VoicemailBox {
  validateBox(input);
  if (getBox(input.number, db)) throw new InvalidVoicemailError(`留守電 ${input.number} は既存`);
  db.prepare(
    `INSERT INTO voicemail_boxes (number, name, prompt, updated_at)
     VALUES (?, ?, ?, datetime('now'))`,
  ).run(input.number, input.name ?? null, input.prompt ?? null);
  return getBox(input.number, db)!;
}

export function updateBox(input: UpsertBoxInput, db: Database.Database = getDb()): VoicemailBox {
  validateBox(input);
  const existing = getBox(input.number, db);
  if (!existing) throw new InvalidVoicemailError(`留守電 ${input.number} は存在しません`);
  db.prepare(
    `UPDATE voicemail_boxes SET name = ?, prompt = ?, updated_at = datetime('now') WHERE id = ?`,
  ).run(input.name ?? null, input.prompt ?? null, existing.id);
  return getBox(input.number, db)!;
}

export function deleteBox(number: string, db: Database.Database = getDb()): boolean {
  return db.prepare('DELETE FROM voicemail_boxes WHERE number = ?').run(number).changes > 0;
}

// --- Message CRUD ---

export function listMessages(
  opts: { boxId?: number; status?: VmMessageStatus } = {},
  db: Database.Database = getDb(),
): VoicemailMessageWithBox[] {
  let sql = `SELECT m.*, b.number AS box_number, b.name AS box_name
    FROM voicemail_messages m
    JOIN voicemail_boxes b ON b.id = m.box_id`;
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (opts.boxId !== undefined) {
    conditions.push('m.box_id = ?');
    params.push(opts.boxId);
  }
  if (opts.status !== undefined) {
    conditions.push('m.status = ?');
    params.push(opts.status);
  }
  if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
  sql += ' ORDER BY m.created_at DESC';
  return (db.prepare(sql).all(...params) as MessageWithBoxRow[]).map(msgWithBoxRowTo);
}

export interface CreateMessageInput {
  boxNumber: string;
  callerId: string;
  callerName?: string;
  uniqueId: string;
  recordingFile?: string;
  durationSec?: number;
}

export function createMessage(input: CreateMessageInput, db: Database.Database = getDb()): VoicemailMessage {
  const box = getBox(input.boxNumber, db);
  if (!box) throw new InvalidVoicemailError(`留守電ボックス ${input.boxNumber} は存在しません`);
  const info = db.prepare(
    `INSERT INTO voicemail_messages (box_id, caller_id, caller_name, unique_id, recording_file, duration_sec, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'new', datetime('now'))`,
  ).run(
    box.id,
    input.callerId,
    input.callerName ?? '',
    input.uniqueId,
    input.recordingFile ?? null,
    input.durationSec ?? null,
  );
  return msgRowTo(
    db.prepare('SELECT * FROM voicemail_messages WHERE id = ?').get(Number(info.lastInsertRowid)) as MessageRow,
  );
}

export function updateMessageStatus(
  id: number,
  status: VmMessageStatus,
  db: Database.Database = getDb(),
): void {
  const now = "datetime('now')";
  if (status === 'read') {
    db.prepare(`UPDATE voicemail_messages SET status = 'read', read_at = ${now} WHERE id = ?`).run(id);
  } else if (status === 'callback_done') {
    db.prepare(`UPDATE voicemail_messages SET status = 'callback_done', callback_at = ${now} WHERE id = ?`).run(id);
  } else {
    db.prepare('UPDATE voicemail_messages SET status = ? WHERE id = ?').run(status, id);
  }
}

export function deleteMessage(id: number, db: Database.Database = getDb()): boolean {
  return db.prepare('DELETE FROM voicemail_messages WHERE id = ?').run(id).changes > 0;
}

export function countByStatus(db: Database.Database = getDb()): Record<VmMessageStatus, number> {
  const rows = db.prepare(
    `SELECT status, COUNT(*) AS count FROM voicemail_messages GROUP BY status`,
  ).all() as { status: VmMessageStatus; count: number }[];
  const result: Record<VmMessageStatus, number> = { new: 0, read: 0, callback_done: 0 };
  for (const r of rows) result[r.status] = r.count;
  return result;
}

// --- Dialplan ---

export function renderVoicemailDialplan(boxes: VoicemailBox[] = listBoxes()): string {
  const lines: string[] = [];
  lines.push('; AUTO-GENERATED by Web (/voicemail).');
  lines.push(`; updated_at: ${new Date().toISOString()}`);
  lines.push('');

  if (boxes.length === 0) return lines.join('\n');

  lines.push('[internal]');
  for (const box of boxes) {
    lines.push(`exten => ${box.number},1,NoOp(Voicemail box ${box.number} entry)`);
    lines.push(` same => n,Goto(voicemail-${box.number},s,1)`);
  }
  lines.push('');

  for (const box of boxes) {
    lines.push(`[voicemail-${box.number}]`);
    lines.push('exten => s,1,Answer()');
    lines.push(' same => n,Wait(1)');
    if (box.prompt) {
      lines.push(` same => n,Playback(${box.prompt})`);
    }
    lines.push(` same => n,Set(EVENT_KIND=voicemail)`);
    lines.push(` same => n,Set(EVENT_EXT=${box.number})`);
    lines.push(` same => n,Set(RECORD_FILE=\${RECORDINGS_DIR}/\${UNIQUEID}-vm-${box.number}-\${CALLERID(num)}.wav)`);
    lines.push(' same => n,Playback(beep)');
    lines.push(' same => n,Record(${RECORD_FILE},3,120,k)');
    lines.push(' same => n,Playback(auth-thankyou)');
    lines.push(' same => n,Hangup()');
    lines.push('');
    lines.push('exten => h,1,NoOp(Voicemail hangup handler)');
    lines.push(' same => n,GotoIf($["${EVENT_KIND}" = ""]?done)');
    lines.push(' same => n,System(/usr/local/bin/notify-event.sh "${EVENT_KIND}" "${EVENT_EXT}" "${CALLERID(num)}" "${CALLERID(name)}" "${UNIQUEID}" "${RECORD_FILE}")');
    lines.push(' same => n(done),Return()');
    lines.push('');
  }

  return lines.join('\n');
}

export async function writeVoicemailDialplanAndReload(): Promise<void> {
  const content = renderVoicemailDialplan();
  await writeDialplanFile('voicemail.conf', content);
  await signalAsteriskReload();
}
