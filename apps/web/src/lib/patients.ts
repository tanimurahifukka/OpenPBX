import { getDb } from './db';

export interface Patient {
  id: string;            // 5 桁
  name: string | null;
  kana: string | null;
  birthDate: string | null;
  phone: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PatientRecord {
  id: number;
  patientId: string;
  extension: string | null;
  recordedAt: string;
  kind: 'triage' | 'call' | 'note';
  summary: string | null;
  note: string | null;
  recommendations: unknown;
}

export class InvalidPatientError extends Error {}

const ID_RE = /^\d{5}$/;
const EXT_RE = /^\d{2,6}$/;

interface PRow {
  id: string;
  name: string | null;
  kana: string | null;
  birth_date: string | null;
  phone: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

function rowToPatient(r: PRow): Patient {
  return {
    id: r.id,
    name: r.name,
    kana: r.kana,
    birthDate: r.birth_date,
    phone: r.phone,
    note: r.note,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function listPatients(query?: string): Patient[] {
  if (query && query.trim()) {
    const q = `%${query.trim()}%`;
    return (
      getDb()
        .prepare(
          'SELECT * FROM patients WHERE id LIKE ? OR name LIKE ? OR kana LIKE ? ORDER BY updated_at DESC LIMIT 200',
        )
        .all(q, q, q) as PRow[]
    ).map(rowToPatient);
  }
  return (
    getDb().prepare('SELECT * FROM patients ORDER BY updated_at DESC LIMIT 200').all() as PRow[]
  ).map(rowToPatient);
}

export function getPatient(id: string): Patient | null {
  if (!ID_RE.test(id)) return null;
  const r = getDb().prepare('SELECT * FROM patients WHERE id = ?').get(id) as PRow | undefined;
  return r ? rowToPatient(r) : null;
}

export interface UpsertPatientInput {
  id: string;
  name?: string;
  kana?: string;
  birthDate?: string;
  phone?: string;
  note?: string;
}

function validatePatient(i: UpsertPatientInput): void {
  if (!ID_RE.test(i.id)) throw new InvalidPatientError('患者番号は 5 桁の数字');
  if (i.birthDate && !/^\d{4}-\d{2}-\d{2}$/.test(i.birthDate)) {
    throw new InvalidPatientError('生年月日は YYYY-MM-DD 形式');
  }
}

export function upsertPatient(i: UpsertPatientInput): Patient {
  validatePatient(i);
  getDb()
    .prepare(
      `INSERT INTO patients (id, name, kana, birth_date, phone, note, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         kana = excluded.kana,
         birth_date = excluded.birth_date,
         phone = excluded.phone,
         note = excluded.note,
         updated_at = datetime('now')`,
    )
    .run(i.id, i.name ?? null, i.kana ?? null, i.birthDate ?? null, i.phone ?? null, i.note ?? null);
  return getPatient(i.id)!;
}

export function deletePatient(id: string): boolean {
  return getDb().prepare('DELETE FROM patients WHERE id = ?').run(id).changes > 0;
}

// ---- patient_records ----
interface RRow {
  id: number;
  patient_id: string;
  extension: string | null;
  recorded_at: string;
  kind: 'triage' | 'call' | 'note';
  summary: string | null;
  note: string | null;
  recommendations_json: string | null;
}

function rowToRecord(r: RRow): PatientRecord {
  let rec: unknown = null;
  if (r.recommendations_json) {
    try {
      rec = JSON.parse(r.recommendations_json);
    } catch {
      rec = r.recommendations_json;
    }
  }
  return {
    id: r.id,
    patientId: r.patient_id,
    extension: r.extension,
    recordedAt: r.recorded_at,
    kind: r.kind,
    summary: r.summary,
    note: r.note,
    recommendations: rec,
  };
}

export function listPatientRecords(patientId: string, limit = 200): PatientRecord[] {
  if (!ID_RE.test(patientId)) return [];
  return (
    getDb()
      .prepare(
        'SELECT * FROM patient_records WHERE patient_id = ? ORDER BY recorded_at DESC, id DESC LIMIT ?',
      )
      .all(patientId, limit) as RRow[]
  ).map(rowToRecord);
}

export function listRecentRecords(days = 7, limit = 200): PatientRecord[] {
  return (
    getDb()
      .prepare(
        `SELECT * FROM patient_records
          WHERE datetime(recorded_at) >= datetime('now', ?)
          ORDER BY recorded_at DESC, id DESC LIMIT ?`,
      )
      .all(`-${days} days`, limit) as RRow[]
  ).map(rowToRecord);
}

export interface CreateRecordInput {
  patientId: string;
  extension?: string;
  kind?: 'triage' | 'call' | 'note';
  summary?: string;
  note?: string;
  recommendations?: unknown;
}

export function createPatientRecord(i: CreateRecordInput): PatientRecord {
  if (!ID_RE.test(i.patientId)) throw new InvalidPatientError('患者番号は 5 桁の数字');
  if (i.extension && !EXT_RE.test(i.extension)) throw new InvalidPatientError('内線番号が不正');
  // 患者が無ければ自動作成 (素早く起票したい)
  if (!getPatient(i.patientId)) upsertPatient({ id: i.patientId });
  const info = getDb()
    .prepare(
      `INSERT INTO patient_records (patient_id, extension, kind, summary, note, recommendations_json)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      i.patientId,
      i.extension ?? null,
      i.kind ?? 'note',
      i.summary ?? null,
      i.note ?? null,
      i.recommendations === undefined ? null : JSON.stringify(i.recommendations),
    );
  const row = getDb().prepare('SELECT * FROM patient_records WHERE id = ?').get(Number(info.lastInsertRowid)) as RRow;
  // 患者の updated_at も更新
  getDb().prepare('UPDATE patients SET updated_at = datetime(\'now\') WHERE id = ?').run(i.patientId);
  return rowToRecord(row);
}

export function deletePatientRecord(id: number): boolean {
  return getDb().prepare('DELETE FROM patient_records WHERE id = ?').run(id).changes > 0;
}
