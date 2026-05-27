import { describe, it, expect } from 'vitest';

// cookie secure 判定の純粋ロジックだけテストする。
// `createSession()` 自体は better-sqlite3 + next/headers cookies に依存するので、
// ここでは判定式そのものを純関数として再現してチェックする。
// auth.ts の同期コードと完全に同じ式を keep する。
function isCookieSecure(env: Partial<NodeJS.ProcessEnv>): boolean {
  return env.COOKIE_SECURE === '1';
}

function resolveCookieName(env: Partial<NodeJS.ProcessEnv>): string {
  return env.OPENPBX_COOKIE_NAME || 'openpbx_session';
}

describe('auth cookie name (service isolation)', () => {
  it('default cookie name is openpbx_session', () => {
    expect(resolveCookieName({})).toBe('openpbx_session');
  });

  it('env OPENPBX_COOKIE_NAME overrides default', () => {
    expect(resolveCookieName({ OPENPBX_COOKIE_NAME: 'custom_session' })).toBe('custom_session');
  });

  it('empty string falls back to default', () => {
    expect(resolveCookieName({ OPENPBX_COOKIE_NAME: '' })).toBe('openpbx_session');
  });

  it('does not collide with Command Room cookie names', () => {
    const name = resolveCookieName({});
    const crCookies = ['authjs.session-token', 'cr_active_staff_id', '__Secure-cr-portal.session'];
    for (const cr of crCookies) {
      expect(name).not.toBe(cr);
    }
  });
});

describe('auth cookie secure 判定 (regression for P0-1)', () => {
  it('COOKIE_SECURE=1 のとき secure=true', () => {
    expect(isCookieSecure({ COOKIE_SECURE: '1' })).toBe(true);
  });

  it('COOKIE_SECURE 未設定 + NODE_ENV=production でも secure=false (LAN HTTP 運用想定)', () => {
    // Docker compose は NODE_ENV=production を常時セットするので、ここを true に
    // すると http://localhost:3000 でログインできなくなる。明示的に COOKIE_SECURE=1
    // を立てない限り false。
    expect(isCookieSecure({ NODE_ENV: 'production' })).toBe(false);
  });

  it('COOKIE_SECURE=0 のとき secure=false', () => {
    expect(isCookieSecure({ COOKIE_SECURE: '0' })).toBe(false);
  });

  it('COOKIE_SECURE=true (非 "1") は secure=false 扱い', () => {
    // "1" だけを明示の opt-in とする。typo / "yes" / "true" は意図しない HTTPS
    // 強制を防ぐため拒否。
    expect(isCookieSecure({ COOKIE_SECURE: 'true' })).toBe(false);
  });
});
