import { describe, expect, it } from 'vitest';
import {
  SCHEMA_ID_V1,
  buildEventId,
  collectLegacyErrors,
  collectV1Errors,
  findForbiddenKey,
  isCallDirection,
  isEventKind,
  isLegacyMeta,
  isOpenpbxEventV1,
} from '../schema';

const validV1 = {
  schema: SCHEMA_ID_V1,
  eventId: 'openpbx:clinic-main:1.0',
  source: 'openpbx',
  pbxInstanceId: 'clinic-main',
  workspaceExternalKey: 'tamura-hifuka',
  call: {
    uniqueId: '1.0',
    kind: 'same_day_reservation',
    direction: 'inbound',
    extension: '9001',
    callerId: '1001',
    callerName: 'Reception 1001',
    calleeExtension: '9001',
    durationSec: null,
  },
  recording: {
    fileName: '1.0-9001-1001.wav',
    relativePath: '1.0-9001-1001.wav',
    contentType: 'audio/wav',
    sizeBytes: null,
    sha256: null,
  },
  receivedAt: '2026-05-17T13:27:03Z',
};

describe('schema enums', () => {
  it('isEventKind', () => {
    expect(isEventKind('same_day_reservation')).toBe(true);
    expect(isEventKind('callback_request')).toBe(true);
    expect(isEventKind('no_recording')).toBe(true);
    expect(isEventKind('unknown')).toBe(false);
    expect(isEventKind(123)).toBe(false);
  });

  it('isCallDirection', () => {
    expect(isCallDirection('inbound')).toBe(true);
    expect(isCallDirection('outbound')).toBe(true);
    expect(isCallDirection('internal')).toBe(true);
    expect(isCallDirection('sideways')).toBe(false);
  });
});

describe('collectV1Errors', () => {
  it('accepts a valid event', () => {
    expect(collectV1Errors(validV1)).toEqual([]);
    expect(isOpenpbxEventV1(validV1)).toBe(true);
  });

  it('rejects wrong schema id', () => {
    const e = { ...validV1, schema: 'command-room-pbx/event/v0' };
    expect(collectV1Errors(e)).toContain(`schema must be "${SCHEMA_ID_V1}"`);
  });

  it('rejects missing pbxInstanceId', () => {
    const { pbxInstanceId: _drop, ...rest } = validV1;
    expect(collectV1Errors(rest)).toContain('pbxInstanceId must be non-empty string');
  });

  it('rejects bad receivedAt (not UTC ISO)', () => {
    const e = { ...validV1, receivedAt: '2026/05/17 13:27:03' };
    expect(collectV1Errors(e)).toContain('receivedAt must be UTC ISO8601 (Z-terminated)');
  });

  it('rejects unknown kind', () => {
    const e = { ...validV1, call: { ...validV1.call, kind: 'whatever' } };
    expect(collectV1Errors(e).some((s) => s.startsWith('call.kind must be one of'))).toBe(true);
  });

  it('rejects sha256 not hex', () => {
    const e = {
      ...validV1,
      recording: { ...validV1.recording, sha256: 'ZZ_not_hex' },
    };
    expect(collectV1Errors(e).some((s) => s.startsWith('recording.sha256 must be'))).toBe(true);
  });

  it('rejects path traversal in relativePath', () => {
    const e = {
      ...validV1,
      recording: { ...validV1.recording, relativePath: '../escape.wav' },
    };
    expect(collectV1Errors(e).some((s) => s.includes('relativePath must be relative'))).toBe(true);
  });

  it('rejects basename containing path separator', () => {
    const e = {
      ...validV1,
      recording: { ...validV1.recording, fileName: 'sub/dir/x.wav' },
    };
    expect(collectV1Errors(e).some((s) => s.includes('fileName must be basename only'))).toBe(true);
  });

  it('accepts recording=null', () => {
    expect(collectV1Errors({ ...validV1, recording: null })).toEqual([]);
  });
});

describe('findForbiddenKey (boundary guard)', () => {
  it('flags top-level audio key', () => {
    expect(findForbiddenKey({ audio: 'xxx' })?.key).toBe('audio');
  });

  it('flags nested transcript key', () => {
    const hit = findForbiddenKey({ call: { transcript: 'hi' } });
    expect(hit?.key).toBe('transcript');
    expect(hit?.path).toBe('call.transcript');
  });

  it('flags nested signed_url', () => {
    const hit = findForbiddenKey({ recording: { signed_url: 'https://...' } });
    expect(hit?.key).toBe('signed_url');
  });

  it('flags bearer / token / api_key / password / credential', () => {
    expect(findForbiddenKey({ bearer: 'x' })?.key).toBe('bearer');
    expect(findForbiddenKey({ token: 'x' })?.key).toBe('token');
    expect(findForbiddenKey({ api_key: 'x' })?.key).toBe('api_key');
    expect(findForbiddenKey({ apiKey: 'x' })?.key).toBe('apiKey');
    expect(findForbiddenKey({ password: 'x' })?.key).toBe('password');
    expect(findForbiddenKey({ credential: 'x' })?.key).toBe('credential');
  });

  it('does not flag harmless keys', () => {
    expect(findForbiddenKey({ extension: '9001', callerName: 'x' })).toBeNull();
  });

  it('flags through arrays', () => {
    const hit = findForbiddenKey({ items: [{ ok: 1 }, { token: 't' }] });
    expect(hit?.key).toBe('token');
    expect(hit?.path).toBe('items[1].token');
  });

  it('rejects v1 event with forbidden key injected', () => {
    const bad = { ...validV1, recording: { ...validV1.recording, signed_url: 'x' } };
    expect(collectV1Errors(bad).some((s) => s.startsWith('forbidden key'))).toBe(true);
  });
});

describe('legacy validator', () => {
  it('accepts the shape that notify-event.sh emits', () => {
    const legacy = {
      schema: 'command-room-pbx/v1',
      source: 'asterisk',
      kind: 'same_day_reservation',
      extension: '9001',
      callerId: '1001',
      callerName: 'Reception 1001',
      uniqueId: '1.0',
      recordingFile: '1.0-9001-1001.wav',
      receivedAt: '2026-05-17T13:27:03Z',
    };
    expect(collectLegacyErrors(legacy)).toEqual([]);
    expect(isLegacyMeta(legacy)).toBe(true);
  });

  it('rejects wrong schema', () => {
    const legacy = {
      schema: 'command-room-pbx/event/v1',
      source: 'asterisk',
      kind: '',
      extension: '',
      callerId: '',
      callerName: '',
      uniqueId: '',
      recordingFile: '',
      receivedAt: '',
    };
    expect(isLegacyMeta(legacy)).toBe(false);
  });
});

describe('buildEventId', () => {
  it('joins with colons', () => {
    expect(buildEventId('clinic-main', '1779019798.0')).toBe('openpbx:clinic-main:1779019798.0');
  });
});
