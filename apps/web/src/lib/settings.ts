// Web-configurable settings backed by app_settings table.
//
// Each setting has an env-var override: if the env is set, it wins over DB.
// This keeps existing docker-compose .env deployments working unchanged while
// letting non-technical operators configure via the UI.

import { getDb } from './db';

// ---- generic CRUD --------------------------------------------------------

export function getSetting(key: string): string | null {
  const row = getDb()
    .prepare('SELECT value FROM app_settings WHERE key = ?')
    .get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  getDb()
    .prepare(
      `INSERT INTO app_settings (key, value, updated_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
    )
    .run(key, value);
}

export function deleteSetting(key: string): void {
  getDb().prepare('DELETE FROM app_settings WHERE key = ?').run(key);
}

function resolve(key: string, envName: string, env: NodeJS.ProcessEnv = process.env): string {
  const fromEnv = env[envName]?.trim();
  if (fromEnv && fromEnv.length > 0) return fromEnv;
  return getSetting(key) ?? '';
}

// ---- command-room connection ---------------------------------------------

export interface CommandRoomConfig {
  pushUrl: string;
  pushToken: string;
  workspaceId: string;
  sourceAccountId: string;
  configured: boolean;
}

export function getCommandRoomConfig(env: NodeJS.ProcessEnv = process.env): CommandRoomConfig {
  const pushUrl = resolve('cr.push_url', 'EVENT_PUSH_URL', env);
  const pushToken = resolve('cr.push_token', 'EVENT_PUSH_TOKEN', env);
  const workspaceId = resolve('cr.push_workspace_id', 'EVENT_PUSH_WORKSPACE_ID', env);
  const sourceAccountId = resolve('cr.push_source_account_id', 'EVENT_PUSH_SOURCE_ACCOUNT_ID', env);
  return {
    pushUrl,
    pushToken,
    workspaceId,
    sourceAccountId,
    configured: pushUrl.length > 0 && pushToken.length > 0 && workspaceId.length > 0,
  };
}

export function setCommandRoomConfig(config: {
  pushUrl: string;
  pushToken: string;
  workspaceId: string;
  sourceAccountId: string;
}): void {
  const db = getDb();
  const tx = db.transaction(() => {
    setSetting('cr.push_url', config.pushUrl);
    setSetting('cr.push_token', config.pushToken);
    setSetting('cr.push_workspace_id', config.workspaceId);
    setSetting('cr.push_source_account_id', config.sourceAccountId);
  });
  tx();
}

// ---- VoiceBox connection -------------------------------------------------

export interface VoiceBoxConnectionConfig {
  url: string;
  token: string;
  configured: boolean;
}

export function getVoiceBoxConfig(env: NodeJS.ProcessEnv = process.env): VoiceBoxConnectionConfig {
  const url = resolve('vb.url', 'VOICEBOX_URL', env);
  const token = resolve('vb.token', 'VOICEBOX_TOKEN', env);
  return { url, token, configured: url.length > 0 };
}

export function setVoiceBoxConfig(config: { url: string; token: string }): void {
  const db = getDb();
  const tx = db.transaction(() => {
    setSetting('vb.url', config.url);
    setSetting('vb.token', config.token);
  });
  tx();
}

// ---- connect code parser -------------------------------------------------
//
// command-room generates an "接続コード" that encodes all connection params
// in a single string. Formats supported:
//
//   openpbx-connect://cr.example.com/api/v1/pbx-events?token=abc&workspace=ws-1&source=sa-2
//   {"pushUrl":"https://...","pushToken":"abc","workspaceId":"ws-1","sourceAccountId":"sa-2"}
//
// The operator pastes this into a single input field → done.

export type ConnectCodeResult =
  | { ok: true; pushUrl: string; pushToken: string; workspaceId: string; sourceAccountId: string }
  | { ok: false; error: string };

export function parseConnectCode(raw: string): ConnectCodeResult {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { ok: false, error: '接続コードが空です' };

  // Try JSON first
  if (trimmed.startsWith('{')) {
    try {
      const obj = JSON.parse(trimmed) as Record<string, unknown>;
      const pushUrl = str(obj.pushUrl) ?? str(obj.url) ?? '';
      const pushToken = str(obj.pushToken) ?? str(obj.token) ?? '';
      const workspaceId = str(obj.workspaceId) ?? str(obj.workspace) ?? '';
      const sourceAccountId = str(obj.sourceAccountId) ?? str(obj.source) ?? '';
      if (!pushUrl) return { ok: false, error: '接続コードに pushUrl が含まれていません' };
      if (!pushToken) return { ok: false, error: '接続コードに pushToken が含まれていません' };
      if (!workspaceId) return { ok: false, error: '接続コードに workspaceId が含まれていません' };
      return { ok: true, pushUrl, pushToken, workspaceId, sourceAccountId };
    } catch {
      return { ok: false, error: '接続コードの JSON が不正です' };
    }
  }

  // Try openpbx-connect:// URL
  if (trimmed.startsWith('openpbx-connect://')) {
    try {
      // Replace scheme with https for URL parsing
      const asHttps = trimmed.replace(/^openpbx-connect:\/\//, 'https://');
      const url = new URL(asHttps);
      const pushUrl = `${url.protocol}//${url.host}${url.pathname}`.replace('https://', 'https://');
      const pushToken = url.searchParams.get('token') ?? '';
      const workspaceId = url.searchParams.get('workspace') ?? '';
      const sourceAccountId = url.searchParams.get('source') ?? '';
      if (!pushToken) return { ok: false, error: '接続コードに token パラメータがありません' };
      if (!workspaceId) return { ok: false, error: '接続コードに workspace パラメータがありません' };
      return { ok: true, pushUrl, pushToken, workspaceId, sourceAccountId };
    } catch {
      return { ok: false, error: '接続コードの URL 形式が不正です' };
    }
  }

  return { ok: false, error: '接続コードの形式が認識できません (JSON または openpbx-connect:// URL)' };
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : undefined;
}

// ---- account count (for wizard redirect) ---------------------------------

export function hasAnyAccounts(): boolean {
  const row = getDb().prepare('SELECT COUNT(*) as c FROM accounts').get() as { c: number };
  return row.c > 0;
}
