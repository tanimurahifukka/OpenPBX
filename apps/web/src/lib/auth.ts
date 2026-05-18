// 自前の cookie session 認証。依存は Node 標準のみ (crypto/scrypt)。
import { cookies, headers } from 'next/headers';
import crypto from 'node:crypto';
import { getDb } from './db';

export type Role = 'user' | 'supervisor' | 'admin';

export interface Account {
  id: number;
  username: string;
  displayName: string | null;
  role: Role;
  totpEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

interface AccountRow {
  id: number;
  username: string;
  display_name: string | null;
  password_hash: string;
  role: Role;
  totp_secret: string | null;
  created_at: string;
  updated_at: string;
}

function rowToAccount(r: AccountRow): Account {
  return {
    id: r.id,
    username: r.username,
    displayName: r.display_name,
    role: r.role,
    totpEnabled: !!r.totp_secret,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

const COOKIE_NAME = 'cr_session';
const SESSION_TTL_HOURS = 12;

// scrypt ベース hash: $scrypt$N=2^15$r=8$p=1$salt(hex)$hash(hex)
const SCRYPT_N = 1 << 15;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 64;

const SCRYPT_MAXMEM = 64 * 1024 * 1024;

export function hashPassword(plain: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(plain, salt, KEY_LEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: SCRYPT_MAXMEM,
  });
  return `$scrypt$N=${SCRYPT_N}$r=${SCRYPT_R}$p=${SCRYPT_P}$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(plain: string, stored: string): boolean {
  try {
    const parts = stored.split('$');
    if (parts.length < 7 || parts[1] !== 'scrypt') return false;
    const N = Number(parts[2].split('=')[1]);
    const r = Number(parts[3].split('=')[1]);
    const p = Number(parts[4].split('=')[1]);
    const salt = Buffer.from(parts[5], 'hex');
    const hash = Buffer.from(parts[6], 'hex');
    const got = crypto.scryptSync(plain, salt, hash.length, { N, r, p, maxmem: SCRYPT_MAXMEM });
    return crypto.timingSafeEqual(got, hash);
  } catch {
    return false;
  }
}

export function listAccounts(): Account[] {
  return (
    getDb().prepare('SELECT * FROM accounts ORDER BY username').all() as AccountRow[]
  ).map(rowToAccount);
}

export function getAccountByUsername(username: string): Account | null {
  const r = getDb().prepare('SELECT * FROM accounts WHERE username = ?').get(username) as AccountRow | undefined;
  return r ? rowToAccount(r) : null;
}

export function getAccountById(id: number): Account | null {
  const r = getDb().prepare('SELECT * FROM accounts WHERE id = ?').get(id) as AccountRow | undefined;
  return r ? rowToAccount(r) : null;
}

export function createAccount(input: {
  username: string;
  displayName?: string;
  password: string;
  role?: Role;
}): Account {
  const username = input.username.trim();
  if (!/^[A-Za-z0-9_-]{3,32}$/.test(username)) throw new Error('username は 3〜32 文字の英数 / _ / -');
  if (!input.password || input.password.length < 8) throw new Error('password は 8 文字以上');
  if (getAccountByUsername(username)) throw new Error(`username 重複: ${username}`);
  const role: Role = input.role ?? 'user';
  getDb()
    .prepare(
      `INSERT INTO accounts (username, display_name, password_hash, role, created_at, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`,
    )
    .run(username, input.displayName ?? null, hashPassword(input.password), role);
  return getAccountByUsername(username)!;
}

export function updateAccountPassword(id: number, plain: string): void {
  if (!plain || plain.length < 8) throw new Error('password は 8 文字以上');
  getDb()
    .prepare(`UPDATE accounts SET password_hash = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(hashPassword(plain), id);
}

export function updateAccountRole(id: number, role: Role): void {
  if (!['user', 'supervisor', 'admin'].includes(role)) throw new Error('invalid role');
  getDb()
    .prepare(`UPDATE accounts SET role = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(role, id);
}

export function updateAccountDisplayName(id: number, displayName: string | null): void {
  getDb()
    .prepare(`UPDATE accounts SET display_name = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(displayName, id);
}

export function deleteAccount(id: number): boolean {
  return getDb().prepare('DELETE FROM accounts WHERE id = ?').run(id).changes > 0;
}

export function countAdmins(excludeId?: number): number {
  const r = getDb()
    .prepare(
      `SELECT COUNT(*) AS c FROM accounts WHERE role = 'admin' ${excludeId ? 'AND id != ?' : ''}`,
    )
    .get(...(excludeId ? [excludeId] : [])) as { c: number };
  return r.c;
}

export function setAccountTotpSecret(id: number, secret: string | null): void {
  getDb()
    .prepare(`UPDATE accounts SET totp_secret = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(secret, id);
}

export function getAccountTotpSecret(id: number): string | null {
  const r = getDb().prepare('SELECT totp_secret FROM accounts WHERE id = ?').get(id) as
    | { totp_secret: string | null }
    | undefined;
  return r?.totp_secret ?? null;
}

export function getAccountPasswordHash(id: number): string | null {
  const r = getDb().prepare('SELECT password_hash FROM accounts WHERE id = ?').get(id) as
    | { password_hash: string }
    | undefined;
  return r?.password_hash ?? null;
}

export function recordLoginAttempt(
  username: string,
  success: boolean,
  meta?: { ip?: string; userAgent?: string },
): void {
  getDb()
    .prepare(
      `INSERT INTO login_history (username, success, ip, user_agent) VALUES (?, ?, ?, ?)`,
    )
    .run(username, success ? 1 : 0, meta?.ip ?? null, meta?.userAgent ?? null);
}

export function listLoginHistory(limit = 100) {
  return getDb()
    .prepare('SELECT username, success, ip, user_agent, created_at FROM login_history ORDER BY id DESC LIMIT ?')
    .all(limit) as Array<{
      username: string;
      success: number;
      ip: string | null;
      user_agent: string | null;
      created_at: string;
    }>;
}

export interface AuditEntry {
  actor?: string | null;
  action: string;
  target?: string | null;
  details?: unknown;
  ip?: string | null;
  userAgent?: string | null;
}

export function recordAudit(e: AuditEntry): void {
  getDb()
    .prepare(
      `INSERT INTO audit_log (actor, action, target, details, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      e.actor ?? null,
      e.action,
      e.target ?? null,
      e.details === undefined ? null : JSON.stringify(e.details),
      e.ip ?? null,
      e.userAgent ?? null,
    );
}

export function listAudit(limit = 200) {
  return getDb()
    .prepare('SELECT actor, action, target, details, ip, user_agent, created_at FROM audit_log ORDER BY id DESC LIMIT ?')
    .all(limit) as Array<{
      actor: string | null;
      action: string;
      target: string | null;
      details: string | null;
      ip: string | null;
      user_agent: string | null;
      created_at: string;
    }>;
}

// ---- session ----
function newToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export async function createSession(accountId: number, meta?: { ip?: string; userAgent?: string }): Promise<string> {
  const token = newToken();
  const expires = new Date(Date.now() + SESSION_TTL_HOURS * 3600 * 1000).toISOString();
  getDb()
    .prepare(
      `INSERT INTO sessions (token, account_id, expires_at, user_agent, ip)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(token, accountId, expires, meta?.userAgent ?? null, meta?.ip ?? null);
  const c = await cookies();
  c.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    expires: new Date(expires),
    secure: false, // MVP は LAN 想定。production は true
  });
  return token;
}

export async function destroySession(): Promise<void> {
  const c = await cookies();
  const token = c.get(COOKIE_NAME)?.value;
  if (token) {
    getDb().prepare('DELETE FROM sessions WHERE token = ?').run(token);
    c.delete(COOKIE_NAME);
  }
}

export async function getCurrentAccount(): Promise<Account | null> {
  // 起動直後でも accounts テーブルが用意されるよう、最初に DB をタッチして bootstrap admin を走らせる
  getDb();
  const c = await cookies();
  const token = c.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const row = getDb()
    .prepare(
      `SELECT a.* FROM sessions s
         JOIN accounts a ON a.id = s.account_id
        WHERE s.token = ? AND datetime(s.expires_at) > datetime('now')`,
    )
    .get(token) as AccountRow | undefined;
  return row ? rowToAccount(row) : null;
}

export async function requireAccount(): Promise<Account> {
  const a = await getCurrentAccount();
  if (!a) throw new Error('unauthorized');
  return a;
}

export async function requireRole(...roles: Role[]): Promise<Account> {
  const a = await requireAccount();
  if (!roles.includes(a.role)) throw new Error('forbidden');
  return a;
}

export async function requestMeta(): Promise<{ ip?: string; userAgent?: string }> {
  const h = await headers();
  return {
    ip: h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? h.get('x-real-ip') ?? undefined,
    userAgent: h.get('user-agent') ?? undefined,
  };
}

// 初回起動時に admin/admin が無ければ作る (MVP)。
export function ensureBootstrapAdmin(): void {
  const c = getDb().prepare('SELECT COUNT(*) as c FROM accounts').get() as { c: number };
  if (c.c === 0) {
    createAccount({
      username: 'admin',
      displayName: 'Administrator',
      password: 'admin-please-change',
      role: 'admin',
    });
    console.log('[auth] bootstrap admin account created (username=admin, password=admin-please-change)');
  }
}
