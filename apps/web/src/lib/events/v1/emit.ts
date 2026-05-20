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
  batchLimit: number;
  timeoutMs: number;
}

export function resolveEmitConfig(): EmitConfig | null {
  const endpoint = process.env.EVENT_PUSH_URL;
  const token = process.env.EVENT_PUSH_TOKEN;
  if (!endpoint || !token) return null;
  const batchLimit = Number(process.env.EVENT_PUSH_BATCH ?? '20') || 20;
  const timeoutMs = Number(process.env.EVENT_PUSH_TIMEOUT_MS ?? '15000') || 15_000;
  return { endpoint, token, batchLimit, timeoutMs };
}

// command-room /api/v1/external-events に乗せる envelope。
// 形は contracts/openpbx-event-v1.md §3.2 と整合。
export interface ExternalEventEnvelope {
  sourceType: 'pbx_edge';
  sourceAccountId: string;
  externalId: string;
  payload: OpenpbxEventV1;
}

export function buildEnvelope(event: OpenpbxEventV1): ExternalEventEnvelope {
  return {
    sourceType: 'pbx_edge',
    sourceAccountId: event.pbxInstanceId,
    externalId: event.eventId,
    payload: event,
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
        authorization: `Bearer ${cfg.token}`,
      },
      body: JSON.stringify(buildEnvelope(event)),
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
  if (res.status >= 400 && res.status < 500) {
    // contract 違反 / auth 失敗 → 再送しない。
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

const KEY = '__commandRoomEventV1Push';
export function startEventV1PushLoop(): void {
  const cfg = resolveEmitConfig();
  if (!cfg) {
    console.log('[event-v1] push disabled (set EVENT_PUSH_URL + EVENT_PUSH_TOKEN to enable)');
    return;
  }
  const g = globalThis as unknown as Record<string, NodeJS.Timeout | undefined>;
  if (g[KEY]) return;
  g[KEY] = setInterval(() => {
    pushPending(cfg).catch((e) => console.error('[event-v1] push error', e));
  }, 15_000);
  pushPending(cfg).catch((e) => console.error('[event-v1] initial push error', e));
}

export function stopEventV1PushLoop(): void {
  const g = globalThis as unknown as Record<string, NodeJS.Timeout | undefined>;
  const t = g[KEY];
  if (t) {
    clearInterval(t);
    g[KEY] = undefined;
  }
}
