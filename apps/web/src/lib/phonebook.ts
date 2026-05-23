import type Database from 'better-sqlite3';
import { getDb } from './db';

export interface PhonebookEntry {
  id: number;
  name: string;
  number: string;
  org: string | null;
  category: string | null;
  note: string | null;
  updatedAt: string;
}

export class InvalidPhonebookError extends Error {}

const NUMBER_RE = /^[+]?[0-9*#-]{2,20}$/; // 内線・外線・記号 (+, -, *, #) を含む

interface Row {
  id: number;
  name: string;
  number: string;
  org: string | null;
  category: string | null;
  note: string | null;
  updated_at: string;
}

function rowTo(r: Row): PhonebookEntry {
  return {
    id: r.id,
    name: r.name,
    number: r.number,
    org: r.org,
    category: r.category,
    note: r.note,
    updatedAt: r.updated_at,
  };
}

export function listPhonebook(
  query?: string,
  db: Database.Database = getDb(),
): PhonebookEntry[] {
  if (query && query.trim()) {
    const q = `%${query.trim()}%`;
    return (
      db
        .prepare(
          'SELECT * FROM phonebook WHERE name LIKE ? OR number LIKE ? OR org LIKE ? OR category LIKE ? ORDER BY name LIMIT 500',
        )
        .all(q, q, q, q) as Row[]
    ).map(rowTo);
  }
  return (db.prepare('SELECT * FROM phonebook ORDER BY name LIMIT 500').all() as Row[]).map(rowTo);
}

export function lookupByNumber(number: string, db: Database.Database = getDb()): PhonebookEntry | null {
  const r = db.prepare('SELECT * FROM phonebook WHERE number = ? LIMIT 1').get(number) as Row | undefined;
  return r ? rowTo(r) : null;
}

export interface UpsertPhonebookInput {
  id?: number;
  name: string;
  number: string;
  org?: string;
  category?: string;
  note?: string;
}

function validate(input: UpsertPhonebookInput): void {
  if (!input.name?.trim()) throw new InvalidPhonebookError('名前は必須');
  if (!input.number?.trim()) throw new InvalidPhonebookError('番号は必須');
  if (!NUMBER_RE.test(input.number.replace(/[\s()]/g, ''))) {
    throw new InvalidPhonebookError('番号の形式が不正');
  }
}

export function createPhonebook(input: UpsertPhonebookInput, db: Database.Database = getDb()): PhonebookEntry {
  validate(input);
  const num = input.number.replace(/[\s()]/g, '');
  const info = db
    .prepare(
      `INSERT INTO phonebook (name, number, org, category, note, updated_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))`,
    )
    .run(input.name.trim(), num, input.org?.trim() || null, input.category?.trim() || null, input.note ?? null);
  return rowTo(db.prepare('SELECT * FROM phonebook WHERE id = ?').get(Number(info.lastInsertRowid)) as Row);
}

export function updatePhonebook(input: UpsertPhonebookInput, db: Database.Database = getDb()): PhonebookEntry | null {
  validate(input);
  if (!input.id) throw new InvalidPhonebookError('id is required');
  const num = input.number.replace(/[\s()]/g, '');
  const r = db
    .prepare(
      `UPDATE phonebook
          SET name = ?, number = ?, org = ?, category = ?, note = ?, updated_at = datetime('now')
        WHERE id = ?`,
    )
    .run(
      input.name.trim(),
      num,
      input.org?.trim() || null,
      input.category?.trim() || null,
      input.note ?? null,
      input.id,
    );
  if (r.changes === 0) return null;
  return rowTo(db.prepare('SELECT * FROM phonebook WHERE id = ?').get(input.id) as Row);
}

export function deletePhonebook(id: number, db: Database.Database = getDb()): boolean {
  const r = db.prepare('DELETE FROM phonebook WHERE id = ?').run(id);
  return r.changes > 0;
}
