import { afterEach, describe, expect, it } from 'vitest';
import { resolveEmitConfig, describeMissingEmitConfig } from '../emit';

// resolveEmitConfig は process.env を直接読むので、テスト毎に snapshot して戻す。
const SNAPSHOT_KEYS = [
  'EVENT_PUSH_URL',
  'EVENT_PUSH_TOKEN',
  'EVENT_PUSH_WORKSPACE_ID',
  'EVENT_PUSH_SOURCE_ACCOUNT_ID',
  'EVENT_PUSH_BATCH',
  'EVENT_PUSH_TIMEOUT_MS',
] as const;

function snap(): Record<string, string | undefined> {
  const s: Record<string, string | undefined> = {};
  for (const k of SNAPSHOT_KEYS) s[k] = process.env[k];
  return s;
}

function restore(s: Record<string, string | undefined>) {
  for (const k of SNAPSHOT_KEYS) {
    if (s[k] === undefined) delete process.env[k];
    else process.env[k] = s[k];
  }
}

describe('resolveEmitConfig', () => {
  let snapshot: Record<string, string | undefined>;

  afterEach(() => restore(snapshot));

  it('3 つの必須 env が揃っていれば config を返す', () => {
    snapshot = snap();
    process.env.EVENT_PUSH_URL = 'https://example.com/api/v1/external-events';
    process.env.EVENT_PUSH_TOKEN = 'tok';
    process.env.EVENT_PUSH_WORKSPACE_ID = 'ws-1';
    const cfg = resolveEmitConfig();
    expect(cfg).not.toBeNull();
    expect(cfg!.endpoint).toBe('https://example.com/api/v1/external-events');
    expect(cfg!.token).toBe('tok');
    expect(cfg!.workspaceId).toBe('ws-1');
    expect(cfg!.batchLimit).toBe(20);
    expect(cfg!.timeoutMs).toBe(15000);
    expect(cfg!.sourceAccountId).toBeNull();
  });

  it('どれか 1 つでも欠けると null を返す', () => {
    snapshot = snap();
    process.env.EVENT_PUSH_URL = 'https://example.com';
    process.env.EVENT_PUSH_TOKEN = 'tok';
    delete process.env.EVENT_PUSH_WORKSPACE_ID;
    expect(resolveEmitConfig()).toBeNull();
  });

  it('describeMissingEmitConfig は欠けている env 名を返す (operator-friendly)', () => {
    snapshot = snap();
    delete process.env.EVENT_PUSH_URL;
    process.env.EVENT_PUSH_TOKEN = 'tok';
    delete process.env.EVENT_PUSH_WORKSPACE_ID;
    expect(describeMissingEmitConfig()).toEqual(['EVENT_PUSH_URL', 'EVENT_PUSH_WORKSPACE_ID']);
  });

  it('全て埋まっていれば describeMissingEmitConfig は空配列', () => {
    snapshot = snap();
    process.env.EVENT_PUSH_URL = 'https://example.com';
    process.env.EVENT_PUSH_TOKEN = 'tok';
    process.env.EVENT_PUSH_WORKSPACE_ID = 'ws-1';
    expect(describeMissingEmitConfig()).toEqual([]);
  });
});
