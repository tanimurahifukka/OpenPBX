import type Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs/promises';
import { getDb } from './db';

export interface Guidance {
  name: string;          // e.g. "custom/ivr-welcome"
  text: string | null;
  source: 'upload' | 'tts';
  size: number | null;
  updatedAt: string;
}

export class InvalidGuidanceError extends Error {}

const NAME_RE = /^[A-Za-z0-9_/-]{1,80}$/;
const SOUNDS_DIR = process.env.SOUNDS_DIR ?? '/sounds';

interface Row {
  name: string;
  text: string | null;
  source: 'upload' | 'tts';
  size: number | null;
  updated_at: string;
}

export function listGuidances(db: Database.Database = getDb()): Guidance[] {
  return (
    db.prepare('SELECT name, text, source, size, updated_at FROM guidances ORDER BY name').all() as Row[]
  ).map((r) => ({
    name: r.name,
    text: r.text,
    source: r.source,
    size: r.size,
    updatedAt: r.updated_at,
  }));
}

export function getGuidance(name: string, db: Database.Database = getDb()): Guidance | null {
  const r = db
    .prepare('SELECT name, text, source, size, updated_at FROM guidances WHERE name = ?')
    .get(name) as Row | undefined;
  return r
    ? { name: r.name, text: r.text, source: r.source, size: r.size, updatedAt: r.updated_at }
    : null;
}

export async function saveGuidanceWav(
  name: string,
  wavBytes: Uint8Array,
  meta: { text?: string; source?: 'upload' | 'tts' } = {},
  db: Database.Database = getDb(),
): Promise<Guidance> {
  if (!NAME_RE.test(name)) throw new InvalidGuidanceError('name は英数字 / _ / - / / のみ');
  if (wavBytes.length === 0) throw new InvalidGuidanceError('wav が空');
  // RIFF/WAVE のシグネチャだけ軽くチェック
  const sig = Buffer.from(wavBytes.slice(0, 12)).toString('ascii');
  if (!sig.startsWith('RIFF') || !sig.includes('WAVE')) {
    throw new InvalidGuidanceError('wav RIFF ヘッダが見つかりません');
  }
  const out = path.join(SOUNDS_DIR, `${name}.wav`);
  await fs.mkdir(path.dirname(out), { recursive: true });
  await fs.writeFile(out, wavBytes);

  db.prepare(
    `INSERT INTO guidances (name, text, source, size, updated_at)
     VALUES (?, ?, ?, ?, datetime('now'))
     ON CONFLICT(name) DO UPDATE SET text = excluded.text, source = excluded.source,
       size = excluded.size, updated_at = datetime('now')`,
  ).run(name, meta.text ?? null, meta.source ?? 'upload', wavBytes.length);
  return getGuidance(name, db)!;
}

export async function deleteGuidance(name: string, db: Database.Database = getDb()): Promise<boolean> {
  if (!NAME_RE.test(name)) throw new InvalidGuidanceError('invalid name');
  const out = path.join(SOUNDS_DIR, `${name}.wav`);
  try {
    await fs.unlink(out);
  } catch {
    /* missing file is OK */
  }
  return db.prepare('DELETE FROM guidances WHERE name = ?').run(name).changes > 0;
}
