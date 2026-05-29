import type Database from 'better-sqlite3';
import { getDb } from './db';

export interface PasswordPolicy {
  minLength: number;
  requireLowercase: boolean;
  requireUppercase: boolean;
  requireDigit: boolean;
  requireSymbol: boolean;
  rotationDays: number;
  lockoutThreshold: number;
}

interface Row {
  min_length: number;
  require_lowercase: number;
  require_uppercase: number;
  require_digit: number;
  require_symbol: number;
  rotation_days: number;
  lockout_threshold: number;
}

export function getPolicy(db: Database.Database = getDb()): PasswordPolicy {
  const r = db
    .prepare(
      `SELECT min_length, require_lowercase, require_uppercase, require_digit, require_symbol,
              rotation_days, lockout_threshold
         FROM password_policies WHERE id = 1`,
    )
    .get() as Row | undefined;
  if (!r) {
    return {
      minLength: 8,
      requireLowercase: true,
      requireUppercase: false,
      requireDigit: true,
      requireSymbol: false,
      rotationDays: 0,
      lockoutThreshold: 5,
    };
  }
  return {
    minLength: r.min_length,
    requireLowercase: !!r.require_lowercase,
    requireUppercase: !!r.require_uppercase,
    requireDigit: !!r.require_digit,
    requireSymbol: !!r.require_symbol,
    rotationDays: r.rotation_days,
    lockoutThreshold: r.lockout_threshold,
  };
}

export function updatePolicy(p: PasswordPolicy, db: Database.Database = getDb()): void {
  db
    .prepare(
      `UPDATE password_policies
          SET min_length = ?, require_lowercase = ?, require_uppercase = ?,
              require_digit = ?, require_symbol = ?, rotation_days = ?,
              lockout_threshold = ?, updated_at = datetime('now')
        WHERE id = 1`,
    )
    .run(
      p.minLength,
      p.requireLowercase ? 1 : 0,
      p.requireUppercase ? 1 : 0,
      p.requireDigit ? 1 : 0,
      p.requireSymbol ? 1 : 0,
      p.rotationDays,
      p.lockoutThreshold,
    );
}

export function validatePassword(plain: string, db: Database.Database = getDb()): string[] {
  const p = getPolicy(db);
  const errs: string[] = [];
  if (plain.length < p.minLength) errs.push(`${p.minLength} 文字以上`);
  if (p.requireLowercase && !/[a-z]/.test(plain)) errs.push('小文字を含む');
  if (p.requireUppercase && !/[A-Z]/.test(plain)) errs.push('大文字を含む');
  if (p.requireDigit && !/\d/.test(plain)) errs.push('数字を含む');
  if (p.requireSymbol && !/[^A-Za-z0-9]/.test(plain)) errs.push('記号を含む');
  return errs;
}

// ---- IP allow list ----
export interface IpAllow {
  cidr: string;
  note: string | null;
  updatedAt: string;
}

export function listIpAllow(db: Database.Database = getDb()): IpAllow[] {
  return (
    db
      .prepare('SELECT cidr, note, updated_at FROM ip_allow_list ORDER BY cidr')
      .all() as Array<{ cidr: string; note: string | null; updated_at: string }>
  ).map((r) => ({ cidr: r.cidr, note: r.note, updatedAt: r.updated_at }));
}

const CIDR_RE = /^([0-9]{1,3}\.){3}[0-9]{1,3}\/(\d|[12]\d|3[0-2])$/;

export function upsertIpAllow(cidr: string, note?: string, db: Database.Database = getDb()): void {
  if (!CIDR_RE.test(cidr)) throw new Error('CIDR 形式が不正');
  db
    .prepare(
      `INSERT INTO ip_allow_list (cidr, note, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(cidr) DO UPDATE SET note = excluded.note, updated_at = datetime('now')`,
    )
    .run(cidr, note ?? null);
}

export function deleteIpAllow(cidr: string): boolean {
  return getDb().prepare('DELETE FROM ip_allow_list WHERE cidr = ?').run(cidr).changes > 0;
}

// IP が allow list に含まれるかチェック (空なら全許可)
export function isIpAllowed(ip: string | undefined | null, db: Database.Database = getDb()): boolean {
  const list = listIpAllow(db);
  if (list.length === 0) return true;
  if (!ip) return false;
  for (const item of list) {
    if (cidrMatch(ip, item.cidr)) return true;
  }
  return false;
}

export function cidrMatch(ip: string, cidr: string): boolean {
  const [base, bits] = cidr.split('/');
  const mask = (~0 << (32 - Number(bits))) >>> 0;
  const a = toUInt(ip);
  const b = toUInt(base);
  if (a === null || b === null) return false;
  return (a & mask) === (b & mask);
}

function toUInt(ip: string): number | null {
  const parts = ip.split('.').map((p) => Number(p));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return null;
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}
