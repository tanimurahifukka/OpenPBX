import type Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs/promises';
import { getDb } from './db';
import { pickupGroupsOf } from './pickupGroups';
import { getNetworkSettings, type NetworkSettings } from './network';
import { writeDialplanFile } from './dialplan';
import { renderMohSetLine } from './moh';

export interface Extension {
  number: string;
  displayName: string | null;
  secret: string;
  note: string | null;
  webrtc: boolean;
  cfwdUnconditional: string | null;
  cfwdBusy: string | null;
  cfwdNoanswer: string | null;
  dnd: boolean;
  updatedAt: string;
}

export class InvalidExtensionError extends Error {}

const NUMBER_RE = /^[0-9]{2,6}$/; // 内線番号: 2〜6桁の数字
// 転送先: 内線 (1001) と外線 (09012345678 / +8190...) の両方を許可。
// 外線は [internal] のトランク outbound prefix ルートが処理する。
const FWD_TARGET_RE = /^[0-9+]{2,15}$/;
const PJSIP_OUT_DIR = process.env.PJSIP_OUT_DIR ?? '/asterisk/pjsip.d';
const DIALPLAN_OUT_DIR = process.env.DIALPLAN_OUT_DIR ?? '/asterisk/dialplan.d';
const ASTERISK_SIGNAL_DIR = process.env.ASTERISK_SIGNAL_DIR ?? '/asterisk/signals';

interface ExtensionRow {
  number: string;
  display_name: string | null;
  secret: string;
  note: string | null;
  updated_at: string;
  webrtc?: number;
  cfwd_unconditional?: string | null;
  cfwd_busy?: string | null;
  cfwd_noanswer?: string | null;
  dnd?: number;
}

function rowToExtension(r: ExtensionRow): Extension {
  return {
    number: r.number,
    displayName: r.display_name,
    secret: r.secret,
    note: r.note,
    webrtc: !!r.webrtc,
    cfwdUnconditional: r.cfwd_unconditional ?? null,
    cfwdBusy: r.cfwd_busy ?? null,
    cfwdNoanswer: r.cfwd_noanswer ?? null,
    dnd: !!r.dnd,
    updatedAt: r.updated_at,
  };
}

const SELECT_COLS =
  'number, display_name, secret, note, webrtc, cfwd_unconditional, cfwd_busy, cfwd_noanswer, dnd, updated_at';

export function listExtensions(db: Database.Database = getDb()): Extension[] {
  const rows = db
    .prepare(`SELECT ${SELECT_COLS} FROM extensions ORDER BY number`)
    .all() as ExtensionRow[];
  return rows.map(rowToExtension);
}

export function getExtension(number: string, db: Database.Database = getDb()): Extension | null {
  const row = db
    .prepare(`SELECT ${SELECT_COLS} FROM extensions WHERE number = ?`)
    .get(number) as ExtensionRow | undefined;
  return row ? rowToExtension(row) : null;
}

export interface UpsertExtensionInput {
  number: string;
  displayName?: string;
  secret: string;
  note?: string;
  webrtc?: boolean;
  cfwdUnconditional?: string | null;
  cfwdBusy?: string | null;
  cfwdNoanswer?: string | null;
  dnd?: boolean;
}

function validateFwd(label: string, v: string | null | undefined): void {
  if (v && !FWD_TARGET_RE.test(v)) {
    throw new InvalidExtensionError(`${label} は内線または外線番号 (数字 / +、2〜15 桁)`);
  }
}

function validate(input: UpsertExtensionInput): void {
  if (!NUMBER_RE.test(input.number)) {
    throw new InvalidExtensionError('number は 2〜6 桁の数字で指定してください');
  }
  if (!input.secret || input.secret.length < 4) {
    throw new InvalidExtensionError('secret (パスワード) は 4 文字以上で必須です');
  }
  if (/["\\\n\r]/.test(input.secret)) {
    throw new InvalidExtensionError('secret に " \\ 改行は使えません');
  }
  validateFwd('無条件転送先', input.cfwdUnconditional);
  validateFwd('話中転送先', input.cfwdBusy);
  validateFwd('無応答転送先', input.cfwdNoanswer);
}

export function createExtension(input: UpsertExtensionInput, db: Database.Database = getDb()): Extension {
  validate(input);
  if (getExtension(input.number, db)) {
    throw new InvalidExtensionError(`内線 ${input.number} は既に存在します`);
  }
  db.prepare(
    `INSERT INTO extensions
       (number, display_name, secret, note, webrtc, cfwd_unconditional, cfwd_busy, cfwd_noanswer, dnd, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
  ).run(
    input.number,
    input.displayName ?? null,
    input.secret,
    input.note ?? null,
    input.webrtc ? 1 : 0,
    input.cfwdUnconditional || null,
    input.cfwdBusy || null,
    input.cfwdNoanswer || null,
    input.dnd ? 1 : 0,
  );
  return getExtension(input.number, db)!;
}

export function updateExtension(input: UpsertExtensionInput, db: Database.Database = getDb()): Extension {
  validate(input);
  const existing = getExtension(input.number, db);
  if (!existing) {
    throw new InvalidExtensionError(`内線 ${input.number} は存在しません`);
  }
  db.prepare(
    `UPDATE extensions
        SET display_name = ?, secret = ?, note = ?, webrtc = ?,
            cfwd_unconditional = ?, cfwd_busy = ?, cfwd_noanswer = ?, dnd = ?,
            updated_at = datetime('now')
      WHERE number = ?`,
  ).run(
    input.displayName ?? null,
    input.secret,
    input.note ?? null,
    input.webrtc ? 1 : 0,
    input.cfwdUnconditional || null,
    input.cfwdBusy || null,
    input.cfwdNoanswer || null,
    input.dnd ? 1 : 0,
    input.number,
  );
  return getExtension(input.number, db)!;
}

export function deleteExtension(number: string, db: Database.Database = getDb()): boolean {
  if (!NUMBER_RE.test(number)) {
    throw new InvalidExtensionError('number 形式が不正です');
  }
  const info = db.prepare('DELETE FROM extensions WHERE number = ?').run(number);
  return info.changes > 0;
}

// PJSIP transport セクション (UDP/TCP/WSS) を生成する。
// Docker Desktop 上ではスマホや Tailnet の CIDR を local_net に入れると
// external_* の書き換えが止まりやすい。通常は external_* のみを設定し、
// local_net は Asterisk から直接到達できるネットワークに限る。
export function renderTransportConfig(net: NetworkSettings = getNetworkSettings()): string {
  const lines: string[] = [];
  lines.push('; AUTO-GENERATED by Web (/network). 手で編集しないこと。');
  lines.push(`; updated_at: ${new Date().toISOString()}`);
  lines.push('');

  const renderExtras = () => {
    const out: string[] = [];
    if (net.externalIp) out.push(`external_media_address=${net.externalIp}`);
    const sig = net.externalSignalingIp ?? net.externalIp;
    if (sig) out.push(`external_signaling_address=${sig}`);
    if (net.localNet) {
      // カンマ区切り → 複数行 local_net= に分解
      for (const cidr of net.localNet.split(',').map((c) => c.trim()).filter(Boolean)) {
        out.push(`local_net=${cidr}`);
      }
    }
    return out;
  };

  // UDP
  lines.push('[transport-udp]');
  lines.push('type=transport');
  lines.push('protocol=udp');
  lines.push('bind=0.0.0.0:5060');
  lines.push('allow_reload=yes');
  for (const e of renderExtras()) lines.push(e);
  lines.push('');

  // TCP
  lines.push('[transport-tcp]');
  lines.push('type=transport');
  lines.push('protocol=tcp');
  lines.push('bind=0.0.0.0:5060');
  lines.push('allow_reload=yes');
  for (const e of renderExtras()) lines.push(e);
  lines.push('');

  // WSS (WebRTC)
  lines.push('[transport-wss]');
  lines.push('type=transport');
  lines.push('protocol=wss');
  lines.push('bind=0.0.0.0:8089');
  lines.push('allow_reload=yes');
  lines.push('cert_file=/etc/asterisk/certs/asterisk.pem');
  lines.push('priv_key_file=/etc/asterisk/certs/asterisk.key');
  for (const e of renderExtras()) lines.push(e);
  lines.push('');

  // 内線エンドポイント用テンプレート群 (旧 pjsip.conf にあったもの)
  lines.push('[endpoint-internal](!)');
  lines.push('type=endpoint');
  lines.push('context=internal');
  lines.push('disallow=all');
  lines.push('allow=ulaw');
  lines.push('allow=alaw');
  lines.push('allow=opus');
  lines.push('direct_media=no');
  lines.push('rtp_symmetric=yes');
  lines.push('force_rport=yes');
  lines.push('rewrite_contact=yes');
  lines.push('');

  lines.push('[endpoint-webrtc](!)');
  lines.push('type=endpoint');
  lines.push('context=internal');
  lines.push('disallow=all');
  lines.push('allow=opus');
  lines.push('allow=ulaw');
  lines.push('allow=alaw');
  lines.push('webrtc=yes');
  lines.push('use_avpf=yes');
  lines.push('media_use_received_transport=yes');
  lines.push('rtcp_mux=yes');
  lines.push('dtls_auto_generate_cert=yes');
  lines.push('dtls_verify=fingerprint');
  lines.push('ice_support=yes');
  lines.push('transport=transport-wss');
  lines.push('direct_media=no');
  lines.push('rtp_symmetric=yes');
  lines.push('force_rport=yes');
  lines.push('rewrite_contact=yes');
  lines.push('');

  lines.push('[auth-userpass](!)');
  lines.push('type=auth');
  lines.push('auth_type=userpass');
  lines.push('');

  lines.push('[aor-single](!)');
  lines.push('type=aor');
  lines.push('max_contacts=1');
  lines.push('remove_existing=yes');
  lines.push('qualify_frequency=30');
  lines.push('');

  return lines.join('\n');
}

// Asterisk の pjsip.d/extensions.conf を再生成する。
export async function renderPjsipConfig(
  rows: Extension[] = listExtensions(),
  pickupOf: (n: string) => string[] = pickupGroupsOf,
): Promise<string> {
  const blocks: string[] = [
    '; AUTO-GENERATED by Web (/extensions). 手で編集しないこと。',
    `; updated_at: ${new Date().toISOString()}`,
    '',
  ];
  for (const e of rows) {
    const cidName = (e.displayName ?? `Ext ${e.number}`).replace(/"/g, '');
    const pickupNames = pickupOf(e.number);
    const templateName = e.webrtc ? 'endpoint-webrtc' : 'endpoint-internal';
    blocks.push(`[${e.number}](${templateName})`);
    blocks.push(`auth=auth${e.number}`);
    blocks.push(`aors=${e.number}`);
    blocks.push(`callerid="${cidName}" <${e.number}>`);
    if (pickupNames.length > 0) {
      blocks.push(`named_call_group=${pickupNames.join(',')}`);
      blocks.push(`named_pickup_group=${pickupNames.join(',')}`);
    }
    blocks.push('');
    blocks.push(`[auth${e.number}](auth-userpass)`);
    blocks.push(`username=${e.number}`);
    blocks.push(`password=${e.secret}`);
    blocks.push('');
    blocks.push(`[${e.number}](aor-single)`);
    blocks.push('');
  }
  return blocks.join('\n');
}

// 転送 / DND が設定された内線だけ、明示 exten を [internal] に生成する。
// 明示エントリは静的 extensions.conf の _100X パターンより優先されるため、
// 未設定の内線は従来どおり _100X が処理する (挙動不変)。
// 転送先 (内線/外線) は Goto(internal,<target>,1) に統一し、外線はトランクの
// outbound prefix ルートが処理する。
export function renderExtensionRoutingDialplan(rows: Extension[] = listExtensions()): string {
  const lines: string[] = [];
  lines.push('; AUTO-GENERATED by Web (/extensions). 手で編集しないこと。');
  lines.push(`; updated_at: ${new Date().toISOString()}`);
  lines.push('; 転送 / DND 設定のある内線のみ明示 exten を生成 (_100X より優先)。');
  lines.push('');
  lines.push('[internal]');
  const routed = rows.filter(
    (e) => e.dnd || e.cfwdUnconditional || e.cfwdBusy || e.cfwdNoanswer,
  );
  if (routed.length === 0) {
    lines.push('; (転送 / DND 設定の内線なし)');
    lines.push('');
    return lines.join('\n');
  }
  for (const e of routed) {
    lines.push(`; --- ${e.number} ${e.displayName ?? ''} ---`);
    lines.push(`exten => ${e.number},1,NoOp(routing ${e.number} dnd=${e.dnd ? 1 : 0})`);
    if (e.dnd) {
      lines.push(' same => n,Hangup(BUSY)');
      lines.push('');
      continue;
    }
    if (e.cfwdUnconditional) {
      lines.push(` same => n,NoOp(unconditional forward to ${e.cfwdUnconditional})`);
      lines.push(` same => n,Goto(internal,${e.cfwdUnconditional},1)`);
      lines.push('');
      continue;
    }
    // 通常着信: 録音 + イベント + MOH。話中/無応答で転送。
    lines.push(' same => n,Set(EVENT_KIND=internal_call)');
    lines.push(` same => n,Set(EVENT_EXT=${e.number})`);
    lines.push(
      ` same => n,Set(RECORD_FILE=\${RECORDINGS_DIR}/\${UNIQUEID}-\${CALLERID(num)}-to-${e.number}.wav)`,
    );
    lines.push(' same => n,MixMonitor(${RECORD_FILE})');
    lines.push(` same => n,${renderMohSetLine()}`);
    lines.push(` same => n,Dial(PJSIP/${e.number},30,tTkKm)`);
    if (e.cfwdBusy) {
      lines.push(' same => n,GotoIf($["${DIALSTATUS}"="BUSY"]?fwd-busy)');
      lines.push(' same => n,GotoIf($["${DIALSTATUS}"="CHANUNAVAIL"]?fwd-busy)');
    }
    if (e.cfwdNoanswer) {
      lines.push(' same => n,GotoIf($["${DIALSTATUS}"="NOANSWER"]?fwd-noanswer)');
    }
    lines.push(' same => n,Hangup()');
    if (e.cfwdBusy) {
      lines.push(` same => n(fwd-busy),Goto(internal,${e.cfwdBusy},1)`);
    }
    if (e.cfwdNoanswer) {
      lines.push(` same => n(fwd-noanswer),Goto(internal,${e.cfwdNoanswer},1)`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

export async function writePjsipConfigAndReload(): Promise<{ path: string; reloaded: boolean }> {
  await fs.mkdir(PJSIP_OUT_DIR, { recursive: true });
  // transports.conf (Tailscale 等 external IP 反映)
  await fs.writeFile(path.join(PJSIP_OUT_DIR, 'transports.conf'), renderTransportConfig(), 'utf-8');
  const content = await renderPjsipConfig();
  const outPath = path.join(PJSIP_OUT_DIR, 'extensions.conf');
  await fs.writeFile(outPath, content, 'utf-8');

  // Asterisk の #include は対象ファイルが無い / glob 0 件マッチで親 conf
  // 全体を parse error にする。最低 1 ファイル保証で防ぐ:
  //   - pjsip.conf -> #include "pjsip.d/trunks.conf"
  //     trunks 未設定で trunks.conf が無いと endpoint / transport / auth 全消失
  //   - extensions.conf -> #include "dialplan.d/*.conf"
  //     dialplan.d/ が空だと pbx_config declined to load → 内線→特番が Not Found
  const trunksPath = path.join(PJSIP_OUT_DIR, 'trunks.conf');
  try {
    await fs.access(trunksPath);
  } catch {
    await fs.writeFile(
      trunksPath,
      '; placeholder (no SIP trunks configured yet; /trunks Server Action overwrites this)\n',
      'utf-8',
    );
  }
  await fs.mkdir(DIALPLAN_OUT_DIR, { recursive: true });
  const dialplanPlaceholder = path.join(DIALPLAN_OUT_DIR, '_placeholder.conf');
  try {
    await fs.access(dialplanPlaceholder);
  } catch {
    await fs.writeFile(
      dialplanPlaceholder,
      '; placeholder (Asterisk #include "dialplan.d/*.conf" requires >=1 file)\n',
      'utf-8',
    );
  }

  // 内線の転送 / DND ルーティング dialplan を同時に再生成する。
  await writeDialplanFile('extensions-routing.conf', renderExtensionRoutingDialplan());

  let reloaded = false;
  try {
    await fs.mkdir(ASTERISK_SIGNAL_DIR, { recursive: true });
    await fs.writeFile(path.join(ASTERISK_SIGNAL_DIR, 'reload'), String(Date.now()), 'utf-8');
    reloaded = true;
  } catch (e) {
    console.error('[extensions] failed to signal reload', e);
  }
  return { path: outPath, reloaded };
}
