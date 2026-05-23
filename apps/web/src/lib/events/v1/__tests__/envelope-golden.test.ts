import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { buildEnvelope } from '../emit';
import type { EmitConfig } from '../emit';
import { assertOpenpbxEventV1, type OpenpbxEventV1 } from '../schema';

// fixtures/openpbx-event-v1/*.envelope.json と buildEnvelope() 出力が一致することを
// 担保する golden test。
// 目的:
//   - command-room 側との contract review でこの fixture を共通参照点にする
//   - sourceType / localPointer.type / sourceAccountId の生成式が壊れたとき即気づく

// apps/web/src/lib/events/v1/__tests__/ から repo ルートまで 7 階層上がる
const FIXTURE_DIR = path.resolve(__dirname, '../../../../../../../fixtures/openpbx-event-v1');

const cfg: EmitConfig = {
  endpoint: 'https://example.com/api/v1/external-events',
  token: 'tok',
  workspaceId: '00000000-0000-0000-0000-000000000001',
  sourceAccountId: null, // pbx:<pbxInstanceId> にフォールバックされることを確認
  batchLimit: 20,
  timeoutMs: 15000,
};

function loadFixture(name: string) {
  const meta = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, `${name}.meta.json`), 'utf8'));
  const envelope = JSON.parse(
    fs.readFileSync(path.join(FIXTURE_DIR, `${name}.envelope.json`), 'utf8'),
  );
  return { meta, envelope };
}

describe('envelope golden fixtures', () => {
  it('same_day_reservation: parse + buildEnvelope → fixture と一致', () => {
    const { meta, envelope } = loadFixture('same_day_reservation');
    assertOpenpbxEventV1(meta);
    const event: OpenpbxEventV1 = meta;
    const built = buildEnvelope(event, cfg);
    expect(built).toEqual(envelope);
  });

  it('callback_request: parse + buildEnvelope → fixture と一致', () => {
    const { meta, envelope } = loadFixture('callback_request');
    assertOpenpbxEventV1(meta);
    const event: OpenpbxEventV1 = meta;
    const built = buildEnvelope(event, cfg);
    expect(built).toEqual(envelope);
  });

  it('no_recording: parse + buildEnvelope → fixture と一致 (recording=null パスを通る)', () => {
    const { meta, envelope } = loadFixture('no_recording');
    assertOpenpbxEventV1(meta);
    const event: OpenpbxEventV1 = meta;
    const built = buildEnvelope(event, cfg);
    expect(built).toEqual(envelope);
  });

  it('sourceType は "phone_stt" 固定 (command-room IngestSourceType enum 再利用)', () => {
    const { meta } = loadFixture('same_day_reservation');
    assertOpenpbxEventV1(meta);
    const event: OpenpbxEventV1 = meta;
    const built = buildEnvelope(event, cfg);
    expect(built.sourceType).toBe('phone_stt');
  });

  it('localPointer.type は "pbx_edge" 固定 (command-room discriminated union variant)', () => {
    const { meta } = loadFixture('same_day_reservation');
    assertOpenpbxEventV1(meta);
    const event: OpenpbxEventV1 = meta;
    const built = buildEnvelope(event, cfg);
    expect(built.localPointer.type).toBe('pbx_edge');
  });

  it('sourceAccountId 未指定なら pbx:<pbxInstanceId> へフォールバック', () => {
    const { meta } = loadFixture('same_day_reservation');
    assertOpenpbxEventV1(meta);
    const event: OpenpbxEventV1 = meta;
    const built = buildEnvelope(event, { ...cfg, sourceAccountId: null });
    expect(built.sourceAccountId).toBe(`pbx:${event.pbxInstanceId}`);
  });
});
