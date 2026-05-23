// 自前の cookie session 認証。依存は Node 標準のみ (crypto/scrypt)。
import { cookies, headers } from 'next/headers';
import crypto from 'node:crypto';
import { getDb } from './db';
import { validatePassword, getPolicy } from './policy';

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
  enforcePasswordPolicy(input.password);
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
  enforcePasswordPolicy(plain);
  getDb()
    .prepare(`UPDATE accounts SET password_hash = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(hashPassword(plain), id);
}

// password_policies に従って強度を検証する。失敗したらユーザ向け日本語で throw する。
function enforcePasswordPolicy(plain: string): void {
  if (!plain) throw new Error('password は必須');
  // 最低 8 文字は policy が低く設定されていても保証する。
  if (plain.length < 8) throw new Error('password は 8 文字以上');
  const errs = validatePassword(plain);
  if (errs.length > 0) {
    throw new Error(`パスワード条件: ${errs.join(' / ')}`);
  }
}

// lockout: 直近の失敗ログイン回数が policy の閾値を超えていれば true。
// 失敗回数のカウントは login_history を「直近の成功までの遡及」で見るのが妥当だが、
// 単純化のため「直近 15 分の失敗のみ」を集計する。
export function isAccountLockedOut(username: string): boolean {
  const policy = getPolicy();
  const threshold = policy.lockoutThreshold;
  if (!threshold || threshold <= 0) return false;
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS c FROM login_history
        WHERE username = ?
          AND success = 0
          AND datetime(created_at) > datetime('now', '-15 minutes')`,
    )
    .get(username) as { c: number };
  return row.c >= threshold;
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
    // secure cookie は HTTPS 配信の前段があるときだけ ON にする。
    // Docker compose + http://localhost:3000 で運用するケース (LAN MVP) で、
    // NODE_ENV=production でも secure=true にすると HTTP には cookie が保存
    // されず実質ロックアウトになる。
    // よって COOKIE_SECURE=1 を operator が明示したときだけ secure=true。
    // production の HTTPS リバプロを置く運用では .env で COOKIE_SECURE=1 を立てる。
    secure: process.env.COOKIE_SECURE === '1',
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

// API ルート用: 認証/認可に失敗したら 401/403 の Response、成功したら Account を返す。
// 呼び側で `const r = await requireApi(['admin']); if (r instanceof Response) return r;` のように使う。
import { NextResponse } from 'next/server';
export async function requireApi(roles?: Role[]): Promise<Account | Response> {
  try {
    return roles && roles.length > 0 ? await requireRole(...roles) : await requireAccount();
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unauthorized';
    const status = msg === 'forbidden' ? 403 : 401;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function requestMeta(): Promise<{ ip?: string; userAgent?: string }> {
  const h = await headers();
  return {
    ip: h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? h.get('x-real-ip') ?? undefined,
    userAgent: h.get('user-agent') ?? undefined,
  };
}

// 初回起動時に admin が無ければ env から作る。
// BOOTSTRAP_ADMIN_PASSWORD を必須にして、固定 password "admin-please-change" のハードコードを排除した。
// env が無い場合は admin を作らず、ログだけ出す (db に admin が無いと事実上ロックアウトされる
// が、固定 password よりは安全寄り)。
export function ensureBootstrapAdmin(): void {
  const c = getDb().prepare('SELECT COUNT(*) as c FROM accounts').get() as { c: number };
  if (c.c !== 0) return;
  const username = process.env.BOOTSTRAP_ADMIN_USERNAME?.trim() || 'admin';
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD?.trim();
  if (!password || password.length < 8) {
    console.warn(
      '[auth] BOOTSTRAP_ADMIN_PASSWORD が未設定 (または 8 文字未満) のため初期 admin を作成しませんでした。' +
        ' .env に強いパスワードを設定して再起動してください。',
    );
    return;
  }
  createAccount({
    username,
    displayName: 'Administrator',
    password,
    role: 'admin',
  });
  console.log(`[auth] bootstrap admin account created (username=${username})`);
}
