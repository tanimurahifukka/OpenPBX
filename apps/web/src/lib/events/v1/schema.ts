// command-room-pbx/event/v1 イベント契約の TypeScript 型と validator。
// 仕様: ../../../../../../docs/contracts/openpbx-event-v1.md
// 依存ゼロ。Zod を入れず、純関数の guard / collect-errors で表現する。

export const SCHEMA_ID_V1 = 'command-room-pbx/event/v1' as const;
export const SCHEMA_ID_LEGACY = 'command-room-pbx/v1' as const;

export type EventKind = 'same_day_reservation' | 'callback_request' | 'no_recording';
export type CallDirection = 'inbound' | 'outbound' | 'internal';

const KIND_VALUES: readonly EventKind[] = [
  'same_day_reservation',
  'callback_request',
  'no_recording',
];
const DIRECTION_VALUES: readonly CallDirection[] = ['inbound', 'outbound', 'internal'];

export interface OpenpbxEventRecordingV1 {
  fileName: string;
  relativePath: string;
  contentType: string;
  sizeBytes: number | null;
  sha256: string | null;
}

export interface OpenpbxEventCallV1 {
  uniqueId: string;
  kind: EventKind;
  direction: CallDirection;
  extension: string;
  callerId: string;
  callerName: string;
  calleeExtension: string | null;
  durationSec: number | null;
}

export interface OpenpbxEventV1 {
  schema: typeof SCHEMA_ID_V1;
  eventId: string;
  source: 'openpbx';
  pbxInstanceId: string;
  workspaceExternalKey: string;
  call: OpenpbxEventCallV1;
  recording: OpenpbxEventRecordingV1 | null;
  receivedAt: string;
}

// 旧 notify-event.sh が出す形（asterisk/notify-event.sh と一致）。
export interface OpenpbxLegacyMetaV0 {
  schema: typeof SCHEMA_ID_LEGACY;
  source: string; // 'asterisk' 固定だが緩める
  kind: string; // EventKind と被るが、未知 kind も受け取れるよう緩める
  extension: string;
  callerId: string;
  callerName: string;
  uniqueId: string;
  recordingFile: string; // '' のとき録音なし
  receivedAt: string;
}

export function isEventKind(v: unknown): v is EventKind {
  return typeof v === 'string' && (KIND_VALUES as readonly string[]).includes(v);
}

export function isCallDirection(v: unknown): v is CallDirection {
  return typeof v === 'string' && (DIRECTION_VALUES as readonly string[]).includes(v);
}

const ISO_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
const SHA256_RE = /^[0-9a-f]{64}$/;
const PATH_TRAVERSAL_RE = /(^|\/)\.\.(\/|$)/;

// command-room 側 FORBIDDEN_PAYLOAD_KEYS と整合する境界ガード。
// 音声原本 / 全文 transcript / 署名URL / token / secret 等のキーを再帰検査して reject する。
const FORBIDDEN_KEY_RE =
  /^(?:audio|transcript|transcription|signed[_-]?url|presigned[_-]?url|token|access[_-]?token|refresh[_-]?token|bearer|secret|password|passwd|credential|credentials|api[_-]?key|private[_-]?key|authorization)$/i;

export interface ForbiddenKeyHit {
  path: string;
  key: string;
}

export function findForbiddenKey(obj: unknown, path = ''): ForbiddenKeyHit | null {
  if (obj === null || typeof obj !== 'object') return null;
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      const hit = findForbiddenKey(obj[i], `${path}[${i}]`);
      if (hit) return hit;
    }
    return null;
  }
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (FORBIDDEN_KEY_RE.test(k)) return { path: path ? `${path}.${k}` : k, key: k };
    const hit = findForbiddenKey(v, path ? `${path}.${k}` : k);
    if (hit) return hit;
  }
  return null;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

export function collectLegacyErrors(p: unknown): string[] {
  const errs: string[] = [];
  if (!isObject(p)) return ['root must be object'];
  if (p.schema !== SCHEMA_ID_LEGACY) errs.push(`schema must be "${SCHEMA_ID_LEGACY}"`);
  if (typeof p.source !== 'string') errs.push('source must be string');
  if (typeof p.kind !== 'string') errs.push('kind must be string');
  if (typeof p.extension !== 'string') errs.push('extension must be string');
  if (typeof p.callerId !== 'string') errs.push('callerId must be string');
  if (typeof p.callerName !== 'string') errs.push('callerName must be string');
  if (!isNonEmptyString(p.uniqueId)) errs.push('uniqueId must be non-empty string');
  if (typeof p.recordingFile !== 'string') errs.push('recordingFile must be string');
  if (!isNonEmptyString(p.receivedAt) || !ISO_UTC_RE.test(p.receivedAt as string)) {
    errs.push('receivedAt must be UTC ISO8601 (Z-terminated)');
  }
  return errs;
}

export function isLegacyMeta(p: unknown): p is OpenpbxLegacyMetaV0 {
  return collectLegacyErrors(p).length === 0;
}

function collectRecordingErrors(r: unknown, basePath: string): string[] {
  const errs: string[] = [];
  if (!isObject(r)) {
    errs.push(`${basePath} must be object or null`);
    return errs;
  }
  if (!isNonEmptyString(r.fileName)) errs.push(`${basePath}.fileName must be non-empty string`);
  else if (r.fileName.includes('/') || r.fileName.includes('\\')) {
    errs.push(`${basePath}.fileName must be basename only (no path separators)`);
  }
  if (!isNonEmptyString(r.relativePath)) errs.push(`${basePath}.relativePath must be non-empty string`);
  else if (PATH_TRAVERSAL_RE.test(r.relativePath as string) || (r.relativePath as string).startsWith('/')) {
    errs.push(`${basePath}.relativePath must be relative and must not contain ".."`);
  }
  if (!isNonEmptyString(r.contentType)) errs.push(`${basePath}.contentType must be non-empty string`);
  if (r.sizeBytes !== null && !(typeof r.sizeBytes === 'number' && Number.isInteger(r.sizeBytes) && r.sizeBytes >= 0)) {
    errs.push(`${basePath}.sizeBytes must be non-negative integer or null`);
  }
  if (r.sha256 !== null && !(typeof r.sha256 === 'string' && SHA256_RE.test(r.sha256))) {
    errs.push(`${basePath}.sha256 must be 64-char lowercase hex or null`);
  }
  return errs;
}

function collectCallErrors(c: unknown, basePath: string): string[] {
  const errs: string[] = [];
  if (!isObject(c)) {
    errs.push(`${basePath} must be object`);
    return errs;
  }
  if (!isNonEmptyString(c.uniqueId)) errs.push(`${basePath}.uniqueId must be non-empty string`);
  if (!isEventKind(c.kind)) errs.push(`${basePath}.kind must be one of ${KIND_VALUES.join('|')}`);
  if (!isCallDirection(c.direction)) errs.push(`${basePath}.direction must be one of ${DIRECTION_VALUES.join('|')}`);
  if (!isNonEmptyString(c.extension)) errs.push(`${basePath}.extension must be non-empty string`);
  if (typeof c.callerId !== 'string') errs.push(`${basePath}.callerId must be string`);
  if (typeof c.callerName !== 'string') errs.push(`${basePath}.callerName must be string`);
  if (c.calleeExtension !== null && typeof c.calleeExtension !== 'string') {
    errs.push(`${basePath}.calleeExtension must be string or null`);
  }
  if (c.durationSec !== null && !(typeof c.durationSec === 'number' && c.durationSec >= 0)) {
    errs.push(`${basePath}.durationSec must be non-negative number or null`);
  }
  return errs;
}

export function collectV1Errors(p: unknown): string[] {
  const errs: string[] = [];
  if (!isObject(p)) return ['root must be object'];
  if (p.schema !== SCHEMA_ID_V1) errs.push(`schema must be "${SCHEMA_ID_V1}"`);
  if (!isNonEmptyString(p.eventId)) errs.push('eventId must be non-empty string');
  if (p.source !== 'openpbx') errs.push('source must be "openpbx"');
  if (!isNonEmptyString(p.pbxInstanceId)) errs.push('pbxInstanceId must be non-empty string');
  if (!isNonEmptyString(p.workspaceExternalKey)) errs.push('workspaceExternalKey must be non-empty string');
  errs.push(...collectCallErrors((p as { call: unknown }).call, 'call'));
  if ((p as { recording: unknown }).recording !== null) {
    errs.push(...collectRecordingErrors((p as { recording: unknown }).recording, 'recording'));
  }
  if (!isNonEmptyString(p.receivedAt) || !ISO_UTC_RE.test(p.receivedAt as string)) {
    errs.push('receivedAt must be UTC ISO8601 (Z-terminated)');
  }

  // 境界ガード: 禁止キー混入は schema validation の一部として弾く。
  const forbidden = findForbiddenKey(p);
  if (forbidden) errs.push(`forbidden key "${forbidden.key}" at "${forbidden.path}"`);

  return errs;
}

export function isOpenpbxEventV1(p: unknown): p is OpenpbxEventV1 {
  return collectV1Errors(p).length === 0;
}

export function assertOpenpbxEventV1(p: unknown): asserts p is OpenpbxEventV1 {
  const errs = collectV1Errors(p);
  if (errs.length) throw new Error(`invalid ${SCHEMA_ID_V1}: ${errs.join('; ')}`);
}

export function buildEventId(pbxInstanceId: string, uniqueId: string): string {
  return `openpbx:${pbxInstanceId}:${uniqueId}`;
}
