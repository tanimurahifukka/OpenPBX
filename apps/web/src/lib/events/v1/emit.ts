// command-room への HTTP push（feature flag OFF 既定）。
// env が揃ったときだけ起動する。送信先は command-room 既存の
// POST /api/v1/external-events に envelope で包んで送る。
//
// command-room 側の SourceConnectorDefinition.key = "openpbx_edge"
// （Step 5 で catalog 追加）に紐付ける。

import {
  listPending,
  markDead,
  markFailed,
  markSent,
  type OutboxRow,
} from './outbox';
import type { OpenpbxEventV1 } from './schema';

export interface EmitConfig {
  endpoint: string;
  token: string;
  /** command-room の Workspace UUID。OpenpbxEventV1.workspaceExternalKey とは別。 */
  workspaceId: string;
  /** command-room SourceAccount.id（任意、未指定なら pbxInstanceId プレフィックスから生成）。 */
  sourceAccountId: string | null;
  batchLimit: number;
  timeoutMs: number;
}

export function resolveEmitConfig(): EmitConfig | null {
  // Settings DB (Web UI で設定可能) → env 変数 の優先順で読む。
  // env が入っていればそちらが勝つ (既存 docker-compose 運用と互換)。
  let crConfig: import('../../../lib/settings').CommandRoomConfig | null = null;
  try {
    const { getCommandRoomConfig } = require('../../../lib/settings') as typeof import('../../../lib/settings');
    crConfig = getCommandRoomConfig();
  } catch {
    // settings テーブルが無い極初期起動。env のみで判定。
  }
  const endpoint = crConfig?.pushUrl || process.env.EVENT_PUSH_URL || '';
  const token = crConfig?.pushToken || process.env.EVENT_PUSH_TOKEN || '';
  const workspaceId = crConfig?.workspaceId || process.env.EVENT_PUSH_WORKSPACE_ID || '';
  if (!endpoint || !token || !workspaceId) return null;
  const sourceAccountId = crConfig?.sourceAccountId || process.env.EVENT_PUSH_SOURCE_ACCOUNT_ID || null;
  const batchLimit = Number(process.env.EVENT_PUSH_BATCH ?? '20') || 20;
  const timeoutMs = Number(process.env.EVENT_PUSH_TIMEOUT_MS ?? '15000') || 15_000;
  return { endpoint, token, workspaceId, sourceAccountId, batchLimit, timeoutMs };
}

// disabled の理由を operator に分かりやすく返す。
export function describeMissingEmitConfig(): string[] {
  let crConfig: import('../../../lib/settings').CommandRoomConfig | null = null;
  try {
    const { getCommandRoomConfig } = require('../../../lib/settings') as typeof import('../../../lib/settings');
    crConfig = getCommandRoomConfig();
  } catch { /* settings not available yet */ }
  if (crConfig?.configured) return [];
  const missing: string[] = [];
  if (!process.env.EVENT_PUSH_URL) missing.push('EVENT_PUSH_URL');
  if (!process.env.EVENT_PUSH_TOKEN) missing.push('EVENT_PUSH_TOKEN');
  if (!process.env.EVENT_PUSH_WORKSPACE_ID) missing.push('EVENT_PUSH_WORKSPACE_ID');
  return missing;
}

// command-room /api/v1/external-events の `incomingUpsertPayloadSchema` (strict) に
// 整合する envelope。
//
// 重要:
//   - sourceType は command-room の `IngestSourceType` enum 値を使う必要があり、
//     OpenPBX 由来は既存 "phone_stt" を再利用する（新 enum 値を追加しない方針）。
//   - localPointer.type="pbx_edge" は command-room PR2 で追加した discriminated
//     union variant。recordingRelativePath は recording null のとき null。
//   - metadataJson に OpenpbxEventV1 本体を入れる。command-room 側 upsert は
//     metadataJson.kind を top-level に昇格して AutomationRule にかける。
export interface ExternalEventEnvelope {
  workspaceId: string;
  sourceType: 'phone_stt';
  sourceAccountId: string;
  externalId: string;
  summary?: string;
  localPointer: {
    type: 'pbx_edge';
    pbxInstanceId: string;
    uniqueId: string;
    recordingRelativePath: string | null;
    uri: string;
  };
  metadataJson: OpenpbxEventV1;
}

// kind → 日本語ラベル (UI の WorkItem title 用)。
// 未知 kind は raw を返す (contract が future-extend されたとき WorkItem 側を
// 壊さない)。
function jaLabelForKind(kind: string): string {
  switch (kind) {
    case 'same_day_reservation':
      return '当日予約';
    case 'callback_request':
      return '折返し依頼';
    case 'no_recording':
      return '録音なし';
    case 'internal_call':
      return '内線通話';
    case 'voicemail':
      return '留守電';
    case 'missed_call':
      return '不在着信';
    default:
      return kind;
  }
}

// "21:15" のような時計表示 (orchestrator fallback が title に時刻を含めないので
// caller 別の通話を見分けるためここで足す)。
function formatJstClock(iso: string): string {
  try {
    const d = new Date(iso);
    // UTC+9 を ad-hoc に: 元 ISO の Z 部分を足す。
    const utc = d.getTime();
    const jst = new Date(utc + 9 * 60 * 60 * 1000);
    const hh = String(jst.getUTCHours()).padStart(2, '0');
    const mm = String(jst.getUTCMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  } catch {
    return '';
  }
}

export function buildEnvelope(event: OpenpbxEventV1, cfg: EmitConfig): ExternalEventEnvelope {
  const recordingRel = event.recording?.relativePath ?? null;
  const uri = recordingRel
    ? `pbx://${event.pbxInstanceId}/${event.call.uniqueId}/${recordingRel}`
    : `pbx://${event.pbxInstanceId}/${event.call.uniqueId}`;
  const sourceAccountId = cfg.sourceAccountId ?? `pbx:${event.pbxInstanceId}`;

  // WorkItem の title で 1 通話 1 行が見分けられるよう、caller と発生時刻 (JST)
  // と uniqueId 末尾 (衝突避け) を含める。
  const label = jaLabelForKind(event.call.kind);
  const clock = formatJstClock(event.receivedAt);
  const callerLabel = event.call.callerName?.trim() || event.call.callerId || 'unknown';
  const uniqueShort = event.call.uniqueId.split('.')[0] || event.call.uniqueId;
  const summary = clock
    ? `[${clock}] ${label} (${event.call.extension}) ${callerLabel} #${uniqueShort}`
    : `${label} (${event.call.extension}) ${callerLabel} #${uniqueShort}`;

  return {
    workspaceId: cfg.workspaceId,
    sourceType: 'phone_stt',
    sourceAccountId,
    externalId: event.eventId,
    summary,
    localPointer: {
      type: 'pbx_edge',
      pbxInstanceId: event.pbxInstanceId,
      uniqueId: event.call.uniqueId,
      recordingRelativePath: recordingRel,
      uri,
    },
    metadataJson: event,
  };
}

export interface PushResult {
  status: 'sent' | 'failed' | 'dead';
  httpStatus?: number;
  error?: string;
}

export async function pushOne(
  row: OutboxRow,
  cfg: EmitConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<PushResult> {
  let event: OpenpbxEventV1;
  try {
    event = JSON.parse(row.payloadJson) as OpenpbxEventV1;
  } catch (e) {
    return { status: 'dead', error: `payload parse error: ${(e as Error).message}` };
  }

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), cfg.timeoutMs);
  let res: Response;
  try {
    res = await fetchImpl(cfg.endpoint, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'content-type': 'application/json',
        // command-room 側 /api/v1/external-events は X-Command-Room-Device-Token を読む
        // (LocalNode device-token 認証経路)。Authorization Bearer ではない。
        'x-command-room-device-token': cfg.token,
      },
      body: JSON.stringify(buildEnvelope(event, cfg)),
    });
  } catch (e) {
    clearTimeout(t);
    return { status: 'failed', error: `network: ${(e as Error).message}` };
  }
  clearTimeout(t);

  if (res.status >= 200 && res.status < 300) {
    return { status: 'sent', httpStatus: res.status };
  }
  const errBody = await res.text().catch(() => '');
  // 4xx の分類:
  //   400 / 422 = contract 違反 → 再送しても通らない (dead)
  //   401 / 403 = device-token / 権限ミス → 設定修正で復活する余地あり (failed, 再送可能)
  //   404       = endpoint URL の typo / workspace 削除 → 設定修正で復活 (failed)
  //   409       = 重複 (idempotency) → 既に取り込まれた扱い (sent)
  //   429       = rate limit → リトライ (failed)
  //   その他 4xx = 安全側で dead (異常ケースとして alert される)
  if (res.status === 409) {
    return { status: 'sent', httpStatus: res.status };
  }
  if (res.status === 401 || res.status === 403 || res.status === 404 || res.status === 429) {
    return { status: 'failed', httpStatus: res.status, error: `${res.status}: ${errBody.slice(0, 200)}` };
  }
  if (res.status >= 400 && res.status < 500) {
    return { status: 'dead', httpStatus: res.status, error: `${res.status}: ${errBody.slice(0, 200)}` };
  }
  return { status: 'failed', httpStatus: res.status, error: `${res.status}: ${errBody.slice(0, 200)}` };
}

export interface PushBatchResult {
  attempted: number;
  sent: number;
  failed: number;
  dead: number;
}

export async function pushPending(
  cfg: EmitConfig | null = resolveEmitConfig(),
  fetchImpl: typeof fetch = fetch,
): Promise<PushBatchResult> {
  const result: PushBatchResult = { attempted: 0, sent: 0, failed: 0, dead: 0 };
  if (!cfg) return result;
  const rows = listPending(cfg.batchLimit);
  for (const row of rows) {
    result.attempted += 1;
    const r = await pushOne(row, cfg, fetchImpl);
    if (r.status === 'sent') {
      markSent(row.eventId);
      result.sent += 1;
    } else if (r.status === 'dead') {
      markDead(row.eventId, r.error ?? 'dead');
      result.dead += 1;
    } else {
      markFailed(row.eventId, r.error ?? 'failed');
      result.failed += 1;
    }
  }
  return result;
}

/** 1 tick ぶんの push を実行する。テストでスパイ可能なよう export する。 */
export function runPushTick(): void {
  pushPending().catch((e) => console.error('[event-v1] push error', e));
}

const KEY = '__commandRoomEventV1Push';
export function startEventV1PushLoop(): void {
  const g = globalThis as unknown as Record<string, NodeJS.Timeout | undefined>;
  if (g[KEY]) return;
  const cfg = resolveEmitConfig();
  if (!cfg) {
    const missing = describeMissingEmitConfig();
    console.log(
      `[event-v1] push disabled. set the following env to enable: ${missing.join(', ')}` +
        ' (outbox は積まれ続け、設定後の最初の tick で送られる)',
    );
  }
  g[KEY] = setInterval(() => {
    runPushTick();
  }, 15_000);
  runPushTick();
}

export function stopEventV1PushLoop(): void {
  const g = globalThis as unknown as Record<string, NodeJS.Timeout | undefined>;
  const t = g[KEY];
  if (t) {
    clearInterval(t);
    g[KEY] = undefined;
  }
}
