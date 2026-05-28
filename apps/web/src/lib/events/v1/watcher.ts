// notify-event.sh が data/inbox/*.meta.json に置く旧 command-room-pbx/v1 を tail し、
// command-room-pbx/event/v1 に upgrade して data/outbox-v1/<eventId>.json に並置する。
// 既存 inbox の中身は一切変更しない（破壊しないため）。
//
// 起動: startEventV1Loop()（singleton）。lib/db.ts から CDR loop と並んで呼ばれる。

import fs from 'node:fs/promises';
import fssync from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

import { upgradeLegacyEvent, enrichRecording } from './upgrade';
import {
  countByStatus,
  upsertPending,
  type OutboxStatus,
} from './outbox';
import { type OpenpbxEventV1, type OpenpbxLegacyMetaV0, isLegacyMeta } from './schema';
import { recordMessageFromEvent } from '../../voicemail';

function envOr(name: string, fallback: string): string {
  const v = process.env[name];
  return v && v.length > 0 ? v : fallback;
}

function envOptional(name: string): string | undefined {
  const v = process.env[name];
  return v && v.length > 0 ? v : undefined;
}

export interface EventV1WatcherConfig {
  inboxDir: string;
  outboxDir: string;
  recordingsDir: string;
  pbxInstanceId: string;
  workspaceExternalKey: string;
  // sha256 計算は I/O 重いので既定 OFF。enable=true で計算する。
  computeRecordingMetrics: boolean;
}

export function resolveWatcherConfig(): EventV1WatcherConfig {
  return {
    inboxDir: envOr('EVENT_INBOX_DIR', '/app/data/inbox'),
    outboxDir: envOr('EVENT_OUTBOX_V1_DIR', '/app/data/outbox-v1'),
    recordingsDir: envOr('EVENT_RECORDINGS_DIR', '/app/data/recordings'),
    pbxInstanceId: envOr('OPENPBX_INSTANCE_ID', 'pbx-dev'),
    workspaceExternalKey: envOr('OPENPBX_WORKSPACE_KEY', 'workspace-dev'),
    computeRecordingMetrics: envOptional('EVENT_COMPUTE_RECORDING_METRICS') === '1',
  };
}

export interface ProcessOnceResult {
  scanned: number;
  upgraded: number;
  skipped: number;
  errors: number;
  outboxCounts: Record<OutboxStatus, number>;
}

async function safeReadJson(p: string): Promise<unknown | null> {
  try {
    const text = await fs.readFile(p, 'utf-8');
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function computeMetrics(
  wavPath: string,
): Promise<{ sizeBytes: number | null; sha256: string | null }> {
  try {
    const st = await fs.stat(wavPath);
    if (!st.isFile()) return { sizeBytes: null, sha256: null };
    const sha = crypto.createHash('sha256');
    const stream = fssync.createReadStream(wavPath);
    for await (const chunk of stream) sha.update(chunk as Buffer);
    return { sizeBytes: st.size, sha256: sha.digest('hex') };
  } catch {
    return { sizeBytes: null, sha256: null };
  }
}

async function writeAtomic(filePath: string, body: string): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tmp = `${filePath}.tmp`;
  await fs.writeFile(tmp, body);
  await fs.rename(tmp, filePath);
}

function isLikelyLegacyMetaFilename(name: string): boolean {
  // notify-event.sh が出すファイル名は <basename>.meta.json か <uniqueId>.meta.json
  return name.endsWith('.meta.json');
}

function recordVoicemailSideEffect(legacy: OpenpbxLegacyMetaV0): void {
  if (legacy.kind !== 'voicemail') return;
  try {
    const msg = recordMessageFromEvent({
      boxNumber: legacy.extension,
      callerId: legacy.callerId,
      callerName: legacy.callerName,
      uniqueId: legacy.uniqueId,
      recordingFile: legacy.recordingFile || undefined,
    });
    if (!msg) {
      console.warn('[event-v1] voicemail box not found for event', legacy.extension, legacy.uniqueId);
    }
  } catch (e) {
    console.warn('[event-v1] voicemail record failed', legacy.uniqueId, (e as Error).message);
  }
}

// In-memory mtime cursor。プロセス起動時はリセットされ全走査するが、その後は
// この時刻より新しい meta.json のみを対象にして毎 tick の I/O を抑える。
// 冪等性は outbox ファイル存在チェック + upsertPending の ON CONFLICT で別途担保。
let mtimeCursorMs = 0;

export function _resetMtimeCursorForTests(): void {
  mtimeCursorMs = 0;
}

export async function processOnce(
  cfg: EventV1WatcherConfig = resolveWatcherConfig(),
): Promise<ProcessOnceResult> {
  const result: ProcessOnceResult = {
    scanned: 0,
    upgraded: 0,
    skipped: 0,
    errors: 0,
    outboxCounts: { pending: 0, sent: 0, dead: 0 },
  };

  let entries: string[] = [];
  try {
    entries = await fs.readdir(cfg.inboxDir);
  } catch {
    // inbox がまだ無いだけ。次回拾う。
    return result;
  }

  let maxSeenMtimeMs = mtimeCursorMs;

  for (const name of entries) {
    if (!isLikelyLegacyMetaFilename(name)) continue;
    const fullPath = path.join(cfg.inboxDir, name);
    // cursor より古いファイルは前回処理済みとみなしてスキップ。
    // 同 ms に複数生成された場合の取りこぼし回避のため `>=` ではなく `>` で比較する。
    // (cursor 確定の直前に生まれたファイルは次 tick で拾う。)
    let mtimeMs = 0;
    try {
      const st = await fs.stat(fullPath);
      mtimeMs = st.mtimeMs;
      if (mtimeCursorMs > 0 && mtimeMs <= mtimeCursorMs) continue;
      if (mtimeMs > maxSeenMtimeMs) maxSeenMtimeMs = mtimeMs;
    } catch {
      // stat 失敗 (一時ファイル等) は無視。次 tick で再評価。
      continue;
    }
    result.scanned += 1;
    const raw = await safeReadJson(fullPath);
    if (!raw) {
      result.errors += 1;
      continue;
    }
    if (!isLegacyMeta(raw)) {
      // 旧 v1 でない（既に新フォーマットや別ツール由来）はスキップ。
      result.skipped += 1;
      continue;
    }

    let event: OpenpbxEventV1;
    try {
      event = upgradeLegacyEvent(raw, {
        pbxInstanceId: cfg.pbxInstanceId,
        workspaceExternalKey: cfg.workspaceExternalKey,
      });
    } catch (e) {
      console.warn('[event-v1] upgrade failed', name, (e as Error).message);
      result.errors += 1;
      continue;
    }

    recordVoicemailSideEffect(raw);

    if (event.recording && cfg.computeRecordingMetrics) {
      const wavPath = path.join(cfg.recordingsDir, event.recording.fileName);
      const metrics = await computeMetrics(wavPath);
      event = enrichRecording(event, metrics);
    }

    const outboxPath = path.join(cfg.outboxDir, `${event.eventId}.json`);
    let isNew = false;
    try {
      // 既にファイルがあれば内容を比較せず冪等 skip（eventId 不変かつ atomic write 済みのため）。
      await fs.access(outboxPath);
    } catch {
      await writeAtomic(outboxPath, JSON.stringify(event, null, 2) + '\n');
      isNew = true;
    }

    const inserted = upsertPending(event.eventId, event);
    if (isNew || inserted) result.upgraded += 1;
    else result.skipped += 1;
  }

  // 次回 tick 用に cursor を進める。
  // エラーで処理失敗した meta は cursor の対象に含まれてしまうと再走査されない。
  // ただし errors > 0 のときは cursor を据え置きにして次 tick で再試行する。
  if (result.errors === 0 && maxSeenMtimeMs > mtimeCursorMs) {
    mtimeCursorMs = maxSeenMtimeMs;
  }

  try {
    result.outboxCounts = countByStatus();
  } catch {
    // db 未初期化（テスト直接呼び出し等）は無視。
  }
  return result;
}

// 10 秒ごとに processOnce。CDR ループと同パターン。
const KEY = '__commandRoomEventV1Ticker';
export function startEventV1Loop(): void {
  const g = globalThis as unknown as Record<string, NodeJS.Timeout | undefined>;
  if (g[KEY]) return;
  const cfg = resolveWatcherConfig();
  g[KEY] = setInterval(() => {
    processOnce(cfg).catch((e) => console.error('[event-v1] tick error', e));
  }, 10_000);
  processOnce(cfg).catch((e) => console.error('[event-v1] initial tick error', e));
}

export function stopEventV1Loop(): void {
  const g = globalThis as unknown as Record<string, NodeJS.Timeout | undefined>;
  const t = g[KEY];
  if (t) {
    clearInterval(t);
    g[KEY] = undefined;
  }
}
