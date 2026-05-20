import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { enrichDuration, enrichRecording, upgradeLegacyEvent } from '../upgrade';
import { SCHEMA_ID_LEGACY } from '../schema';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// apps/web/src/lib/events/v1/__tests__ → repo root は 7 階層上
const REPO_ROOT = path.resolve(__dirname, '../../../../../../..');
const FIXTURES = path.join(REPO_ROOT, 'fixtures/openpbx-event-v1');

function loadFixture(name: string): unknown {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES, name), 'utf-8'));
}

const env = {
  pbxInstanceId: 'clinic-main',
  workspaceExternalKey: 'tamura-hifuka',
};

describe('upgradeLegacyEvent → fixtures (ゴールデン)', () => {
  it('same_day_reservation: 純粋 upgrade で fixture と一致する', () => {
    const legacy = {
      schema: SCHEMA_ID_LEGACY,
      source: 'asterisk',
      kind: 'same_day_reservation',
      extension: '9001',
      callerId: '1001',
      callerName: 'Reception 1001',
      uniqueId: '1779019798.0',
      recordingFile: '1779019798.0-9001-1001.wav',
      receivedAt: '2026-05-17T13:27:03Z',
    };
    const v1 = upgradeLegacyEvent(legacy, env);
    expect(v1).toEqual(loadFixture('same_day_reservation.meta.json'));
  });

  it('callback_request: upgrade → enrichRecording → enrichDuration で fixture と一致する', () => {
    const legacy = {
      schema: SCHEMA_ID_LEGACY,
      source: 'asterisk',
      kind: 'callback_request',
      extension: '9002',
      callerId: '1002',
      callerName: 'Reception 1002',
      uniqueId: '1779019812.4',
      recordingFile: '1779019812.4-9002-1002.wav',
      receivedAt: '2026-05-17T13:30:59Z',
    };
    let v1 = upgradeLegacyEvent(legacy, env);
    v1 = enrichRecording(v1, {
      sizeBytes: 752044,
      sha256: '9f6a1cbb6e21fb4e3a8bd1a4b07e3f9d2c95d7b1f0a44c9e3b6e8c2f1d5a7b9c',
    });
    v1 = enrichDuration(v1, 47);
    expect(v1).toEqual(loadFixture('callback_request.meta.json'));
  });

  it('no_recording: recordingFile="" のとき recording=null になり fixture と一致する', () => {
    const legacy = {
      schema: SCHEMA_ID_LEGACY,
      source: 'asterisk',
      kind: 'no_recording',
      extension: '9000',
      callerId: '1003',
      callerName: 'Reception 1003',
      uniqueId: '1779019841.7',
      recordingFile: '',
      receivedAt: '2026-05-17T13:34:08Z',
    };
    let v1 = upgradeLegacyEvent(legacy, env);
    v1 = enrichDuration(v1, 3);
    expect(v1).toEqual(loadFixture('no_recording.meta.json'));
    expect(v1.recording).toBeNull();
    expect(v1.call.calleeExtension).toBeNull();
  });
});

describe('upgradeLegacyEvent invariants', () => {
  it('eventId = openpbx:<pbxInstanceId>:<uniqueId>', () => {
    const v1 = upgradeLegacyEvent(
      {
        schema: SCHEMA_ID_LEGACY,
        source: 'asterisk',
        kind: 'same_day_reservation',
        extension: '9001',
        callerId: '',
        callerName: '',
        uniqueId: 'abc.42',
        recordingFile: 'abc.42-9001-.wav',
        receivedAt: '2026-05-17T00:00:00Z',
      },
      { pbxInstanceId: 'clinic-x', workspaceExternalKey: 'ws' },
    );
    expect(v1.eventId).toBe('openpbx:clinic-x:abc.42');
  });

  it('unknown legacy kind は例外', () => {
    expect(() =>
      upgradeLegacyEvent(
        {
          schema: SCHEMA_ID_LEGACY,
          source: 'asterisk',
          kind: 'mystery',
          extension: '9001',
          callerId: '',
          callerName: '',
          uniqueId: '1.0',
          recordingFile: '',
          receivedAt: '2026-05-17T00:00:00Z',
        },
        env,
      ),
    ).toThrow(/unknown legacy kind/);
  });

  it('invalid legacy meta は例外', () => {
    expect(() => upgradeLegacyEvent({}, env)).toThrow(/invalid legacy meta/);
  });

  it('recordingPathResolver で relativePath を差し替えられる', () => {
    const v1 = upgradeLegacyEvent(
      {
        schema: SCHEMA_ID_LEGACY,
        source: 'asterisk',
        kind: 'same_day_reservation',
        extension: '9001',
        callerId: '1001',
        callerName: 'Reception 1001',
        uniqueId: '1.0',
        recordingFile: '1.0-9001-1001.wav',
        receivedAt: '2026-05-17T00:00:00Z',
      },
      {
        pbxInstanceId: 'clinic-main',
        workspaceExternalKey: 'tamura-hifuka',
        recordingPathResolver: (f) => `2026/05/${f}`,
      },
    );
    expect(v1.recording?.relativePath).toBe('2026/05/1.0-9001-1001.wav');
    expect(v1.recording?.fileName).toBe('1.0-9001-1001.wav');
  });
});
