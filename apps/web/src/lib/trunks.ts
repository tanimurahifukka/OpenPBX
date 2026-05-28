import { getDb } from './db';
import { writeDialplanFile, signalAsteriskReload } from './dialplan';
import { writePjsipConfigAndReload } from './extensions';
import path from 'node:path';
import fs from 'node:fs/promises';

const PJSIP_OUT_DIR = process.env.PJSIP_OUT_DIR ?? '/asterisk/pjsip.d';

export interface SipTrunk {
  id: number;
  name: string;
  host: string;
  port: number;
  username: string | null;
  secret: string | null;
  registration: boolean;
  fromUser: string | null;
  fromDomain: string | null;
  didInbound: string | null;
  outboundPrefix: string | null;
  note: string | null;
  updatedAt: string;
}

export class InvalidTrunkError extends Error {}

const NAME_RE = /^[A-Za-z0-9_-]{1,32}$/;
// host: FQDN or IPv4 or IPv6 (角括弧なし) のみ。改行・空白・カンマ等の区切り文字を拒否。
const HOST_RE = /^[A-Za-z0-9.:_-]{1,253}$/;
// username/from_user: 英数 + 限定記号のみ。
const USERNAME_RE = /^[A-Za-z0-9._+-]{1,64}$/;
// secret: 改行・キャリッジリターン・タブ・; を禁止。それ以外の制御文字も禁止。
// セミコロンは PJSIP config のコメント開始文字なので config injection の起点。
const SECRET_RE = /^[\x21-\x3A\x3C-\x7E]{1,128}$/;
// from_domain: ホスト名/IP に準ずる。
const DOMAIN_RE = /^[A-Za-z0-9.:_-]{1,253}$/;
// DID 番号/outbound prefix: 数字と + * # のみ。
const DIGITS_RE = /^[0-9+*#]{1,16}$/;

interface Row {
  id: number;
  name: string;
  host: string;
  port: number;
  username: string | null;
  secret: string | null;
  registration: number;
  from_user: string | null;
  from_domain: string | null;
  did_inbound: string | null;
  outbound_prefix: string | null;
  note: string | null;
  updated_at: string;
}

function rowTo(r: Row): SipTrunk {
  return {
    id: r.id,
    name: r.name,
    host: r.host,
    port: r.port,
    username: r.username,
    secret: r.secret,
    registration: !!r.registration,
    fromUser: r.from_user,
    fromDomain: r.from_domain,
    didInbound: r.did_inbound,
    outboundPrefix: r.outbound_prefix,
    note: r.note,
    updatedAt: r.updated_at,
  };
}

export function listTrunks(): SipTrunk[] {
  return (getDb().prepare('SELECT * FROM sip_trunks ORDER BY name').all() as Row[]).map(rowTo);
}

export function getTrunk(name: string): SipTrunk | null {
  const r = getDb().prepare('SELECT * FROM sip_trunks WHERE name = ?').get(name) as Row | undefined;
  return r ? rowTo(r) : null;
}

export interface UpsertTrunkInput {
  name: string;
  host: string;
  port?: number;
  username?: string;
  secret?: string;
  registration?: boolean;
  fromUser?: string;
  fromDomain?: string;
  didInbound?: string;
  outboundPrefix?: string;
  note?: string;
}

function validate(i: UpsertTrunkInput): void {
  if (!NAME_RE.test(i.name)) throw new InvalidTrunkError('name は 1-32 文字、英数 / _ / -');
  if (!HOST_RE.test(i.host.trim())) throw new InvalidTrunkError('host は FQDN または IP のみ (改行/空白/区切り文字不可)');
  const port = i.port ?? 5060;
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new InvalidTrunkError('port は 1-65535 の整数');
  if (i.username != null && i.username !== '' && !USERNAME_RE.test(i.username)) {
    throw new InvalidTrunkError('username は英数 . _ + - のみ (64 文字以内)');
  }
  if (i.secret != null && i.secret !== '' && !SECRET_RE.test(i.secret)) {
    throw new InvalidTrunkError('secret に改行・空白・セミコロン・制御文字は含められません');
  }
  if (i.fromUser != null && i.fromUser !== '' && !USERNAME_RE.test(i.fromUser)) {
    throw new InvalidTrunkError('from_user は英数 . _ + - のみ (64 文字以内)');
  }
  if (i.fromDomain != null && i.fromDomain !== '' && !DOMAIN_RE.test(i.fromDomain)) {
    throw new InvalidTrunkError('from_domain は FQDN または IP のみ');
  }
  if (i.didInbound != null && i.didInbound !== '' && !DIGITS_RE.test(i.didInbound)) {
    throw new InvalidTrunkError('DID inbound は数字 / + / * / # のみ (16 桁以内)');
  }
  if (i.outboundPrefix != null && i.outboundPrefix !== '' && !DIGITS_RE.test(i.outboundPrefix)) {
    throw new InvalidTrunkError('outbound prefix は数字 / + / * / # のみ (16 桁以内)');
  }
}

export function upsertTrunk(input: UpsertTrunkInput): SipTrunk {
  validate(input);
  getDb()
    .prepare(
      `INSERT INTO sip_trunks
         (name, host, port, username, secret, registration, from_user, from_domain,
          did_inbound, outbound_prefix, note, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(name) DO UPDATE SET
         host = excluded.host, port = excluded.port,
         username = excluded.username, secret = excluded.secret,
         registration = excluded.registration,
         from_user = excluded.from_user, from_domain = excluded.from_domain,
         did_inbound = excluded.did_inbound, outbound_prefix = excluded.outbound_prefix,
         note = excluded.note, updated_at = datetime('now')`,
    )
    .run(
      input.name,
      input.host,
      input.port ?? 5060,
      input.username ?? null,
      input.secret ?? null,
      input.registration === false ? 0 : 1,
      input.fromUser ?? null,
      input.fromDomain ?? null,
      input.didInbound ?? null,
      input.outboundPrefix ?? null,
      input.note ?? null,
    );
  return getTrunk(input.name)!;
}

export function deleteTrunk(name: string): boolean {
  return getDb().prepare('DELETE FROM sip_trunks WHERE name = ?').run(name).changes > 0;
}

export function renderTrunksPjsipConfig(): string {
  const trunks = listTrunks();
  const lines: string[] = [];
  lines.push('; AUTO-GENERATED by Web (/trunks).');
  lines.push(`; updated_at: ${new Date().toISOString()}`);
  lines.push('');
  for (const t of trunks) {
    lines.push(`; ---- trunk ${t.name} ----`);
    lines.push(`[${t.name}-auth]`);
    lines.push('type=auth');
    lines.push('auth_type=userpass');
    lines.push(`username=${t.username ?? ''}`);
    lines.push(`password=${t.secret ?? ''}`);
    lines.push('');
    lines.push(`[${t.name}]`);
    lines.push('type=aor');
    lines.push(`contact=sip:${t.host}:${t.port}`);
    lines.push('');
    lines.push(`[${t.name}]`);
    lines.push('type=endpoint');
    lines.push('context=from-trunk');
    lines.push('disallow=all');
    lines.push('allow=ulaw');
    lines.push('allow=alaw');
    lines.push(`outbound_auth=${t.name}-auth`);
    lines.push(`aors=${t.name}`);
    if (t.fromUser) lines.push(`from_user=${t.fromUser}`);
    if (t.fromDomain) lines.push(`from_domain=${t.fromDomain}`);
    lines.push('rtp_symmetric=yes');
    lines.push('force_rport=yes');
    lines.push('rewrite_contact=yes');
    lines.push('');
    if (t.registration) {
      lines.push(`[${t.name}-reg]`);
      lines.push('type=registration');
      lines.push(`outbound_auth=${t.name}-auth`);
      lines.push(`server_uri=sip:${t.host}:${t.port}`);
      lines.push(`client_uri=sip:${t.username ?? ''}@${t.host}`);
      lines.push('retry_interval=60');
      lines.push('forbidden_retry_interval=600');
      lines.push('expiration=3600');
      lines.push('');
    }
    lines.push(`[${t.name}-identify]`);
    lines.push('type=identify');
    lines.push(`endpoint=${t.name}`);
    lines.push(`match=${t.host}`);
    lines.push('');
  }
  return lines.join('\n');
}

export function renderTrunksDialplan(): string {
  const trunks = listTrunks();
  const lines: string[] = [];
  lines.push('; AUTO-GENERATED by Web (/trunks).');
  lines.push(`; updated_at: ${new Date().toISOString()}`);
  lines.push('');
  // Inbound: from-trunk から DID に応じて internal にルーティング
  lines.push('[from-trunk]');
  for (const t of trunks) {
    if (t.didInbound) {
      lines.push(`; --- inbound for ${t.name} -> ${t.didInbound} ---`);
      lines.push(`exten => ${t.didInbound},1,NoOp(inbound from ${t.name})`);
      lines.push(` same => n,Goto(internal,${t.didInbound},1)`);
    }
  }
  // Catch-all
  lines.push('exten => _X.,1,NoOp(no inbound route)');
  lines.push(' same => n,Hangup()');
  lines.push('');

  // Outbound: internal context にエクステンションを追加 (例: prefix が "0" の trunk)
  if (trunks.some((t) => t.outboundPrefix)) {
    lines.push('[internal]');
    for (const t of trunks) {
      if (!t.outboundPrefix) continue;
      lines.push(`; --- outbound via ${t.name} prefix ${t.outboundPrefix} ---`);
      lines.push(`exten => _${t.outboundPrefix}X.,1,NoOp(outbound via ${t.name})`);
      lines.push(` same => n,Dial(PJSIP/\${EXTEN}@${t.name},60,tTkK)`);
      lines.push(' same => n,Hangup()');
    }
    lines.push('');
  }
  return lines.join('\n');
}

export async function writeTrunksConfigAndReload(): Promise<void> {
  // PJSIP trunks
  const pjsip = renderTrunksPjsipConfig();
  await fs.mkdir(PJSIP_OUT_DIR, { recursive: true });
  await fs.writeFile(path.join(PJSIP_OUT_DIR, 'trunks.conf'), pjsip, 'utf-8');
  // dialplan trunks
  await writeDialplanFile('trunks.conf', renderTrunksDialplan());
  // pjsip 全体を書き直してから reload (extensions.ts の pjsip.d/extensions.conf も再生成)
  await writePjsipConfigAndReload();
  await signalAsteriskReload();
}
