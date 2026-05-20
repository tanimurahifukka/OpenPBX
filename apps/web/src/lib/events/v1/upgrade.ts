// 旧 command-room-pbx/v1 (notify-event.sh 出力) → 新 command-room-pbx/event/v1。
// 純関数（IO なし）。録音メトリクス（sha256 / sizeBytes / durationSec）は
// I/O が必要なので別関数 enrichRecording / enrichDuration に分離。

import {
  type CallDirection,
  type EventKind,
  type OpenpbxEventV1,
  type OpenpbxLegacyMetaV0,
  SCHEMA_ID_V1,
  assertOpenpbxEventV1,
  buildEventId,
  collectLegacyErrors,
} from './schema';

export interface UpgradeEnv {
  pbxInstanceId: string;
  workspaceExternalKey: string;
  // 録音のホスト相対パス（基本は basename のまま、ディレクトリ階層がある運用なら差し替え）。
  // 既定は basename 一致。
  recordingPathResolver?: (recordingFile: string) => string;
  contentType?: string;
}

const DEFAULT_KIND_DIRECTION: Record<EventKind, CallDirection> = {
  same_day_reservation: 'inbound',
  callback_request: 'inbound',
  no_recording: 'inbound',
};

function inferKind(raw: string): EventKind {
  if (raw === 'same_day_reservation' || raw === 'callback_request' || raw === 'no_recording') {
    return raw;
  }
  // 未知 kind は明示的に no_recording 扱いにせず例外を投げる。
  throw new Error(`unknown legacy kind "${raw}"; extend EventKind first`);
}

export function upgradeLegacyEvent(legacy: unknown, env: UpgradeEnv): OpenpbxEventV1 {
  const errs = collectLegacyErrors(legacy);
  if (errs.length) throw new Error('invalid legacy meta: ' + errs.join('; '));
  const l = legacy as OpenpbxLegacyMetaV0;

  const kind = inferKind(l.kind);
  const direction = DEFAULT_KIND_DIRECTION[kind];
  const hasRecording = l.recordingFile.length > 0;
  const calleeExtension = kind === 'no_recording' ? null : l.extension;

  const recording = hasRecording
    ? {
        fileName: l.recordingFile,
        relativePath: env.recordingPathResolver
          ? env.recordingPathResolver(l.recordingFile)
          : l.recordingFile,
        contentType: env.contentType ?? 'audio/wav',
        sizeBytes: null,
        sha256: null,
      }
    : null;

  const out: OpenpbxEventV1 = {
    schema: SCHEMA_ID_V1,
    eventId: buildEventId(env.pbxInstanceId, l.uniqueId),
    source: 'openpbx',
    pbxInstanceId: env.pbxInstanceId,
    workspaceExternalKey: env.workspaceExternalKey,
    call: {
      uniqueId: l.uniqueId,
      kind,
      direction,
      extension: l.extension,
      callerId: l.callerId,
      callerName: l.callerName,
      calleeExtension,
      durationSec: null,
    },
    recording,
    receivedAt: l.receivedAt,
  };

  assertOpenpbxEventV1(out);
  return out;
}

export interface RecordingMetrics {
  sizeBytes: number | null;
  sha256: string | null;
}

export function enrichRecording(event: OpenpbxEventV1, metrics: RecordingMetrics): OpenpbxEventV1 {
  if (!event.recording) return event;
  const next: OpenpbxEventV1 = {
    ...event,
    recording: {
      ...event.recording,
      sizeBytes: metrics.sizeBytes,
      sha256: metrics.sha256,
    },
  };
  assertOpenpbxEventV1(next);
  return next;
}

export function enrichDuration(event: OpenpbxEventV1, durationSec: number | null): OpenpbxEventV1 {
  const next: OpenpbxEventV1 = {
    ...event,
    call: { ...event.call, durationSec },
  };
  assertOpenpbxEventV1(next);
  return next;
}
