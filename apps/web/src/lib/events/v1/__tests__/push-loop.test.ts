/**
 * startEventV1PushLoop のふるまいを検証する。
 *
 * 検証ポイント:
 *  1. resolveEmitConfig() が null を返す初期状態でも interval が開始される
 *     (古いコードは early-return していたが、新コードは必ず起動する)
 *  2. タイマー経過後に pushPending() が呼ばれ、その結果 listPending() が実行される
 *     (config を再解決するため、config が後から有効になっても自動的に拾われる)
 *  3. 二重起動ガード (KEY) が働き、二度目の startEventV1PushLoop() は interval を追加しない
 *
 * モック戦略:
 *  - outbox モジュールを vi.mock で差し替え、listPending の呼び出しを観測する。
 *  - config は process.env.EVENT_PUSH_* で制御する (settings DB は存在しないので
 *    resolveEmitConfig は env fallback を使う)。
 *  - vi.useFakeTimers で setInterval の進行を制御する。
 */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from 'vitest';

// outbox モジュールをモックして DB 依存を排除
vi.mock('../outbox', () => ({
  listPending: vi.fn().mockReturnValue([]),
  markSent: vi.fn(),
  markFailed: vi.fn(),
  markDead: vi.fn(),
}));

import * as outboxModule from '../outbox';
import { startEventV1PushLoop, stopEventV1PushLoop } from '../emit';

const KEY = '__commandRoomEventV1Push';

const ENV_KEYS = [
  'EVENT_PUSH_URL',
  'EVENT_PUSH_TOKEN',
  'EVENT_PUSH_WORKSPACE_ID',
] as const;

function snapEnv(): Record<string, string | undefined> {
  const s: Record<string, string | undefined> = {};
  for (const k of ENV_KEYS) s[k] = process.env[k];
  return s;
}

function restoreEnv(s: Record<string, string | undefined>) {
  for (const k of ENV_KEYS) {
    if (s[k] === undefined) delete process.env[k];
    else process.env[k] = s[k];
  }
}

function clearLoopKey() {
  const g = globalThis as unknown as Record<string, NodeJS.Timeout | undefined>;
  if (g[KEY]) {
    clearInterval(g[KEY]);
    g[KEY] = undefined;
  }
}

describe('startEventV1PushLoop', () => {
  let envSnapshot: Record<string, string | undefined>;
  let listPendingSpy: MockInstance;

  beforeEach(() => {
    vi.useFakeTimers();
    envSnapshot = snapEnv();
    // 初期状態: config 未設定 (config = null)
    delete process.env.EVENT_PUSH_URL;
    delete process.env.EVENT_PUSH_TOKEN;
    delete process.env.EVENT_PUSH_WORKSPACE_ID;
    listPendingSpy = vi.mocked(outboxModule.listPending);
    listPendingSpy.mockClear();
  });

  afterEach(() => {
    stopEventV1PushLoop();
    clearLoopKey();
    restoreEnv(envSnapshot);
    vi.useRealTimers();
  });

  it('config が null でも interval を開始する (early-return しない)', () => {
    startEventV1PushLoop();

    const g = globalThis as unknown as Record<string, NodeJS.Timeout | undefined>;
    expect(g[KEY]).toBeDefined();
  });

  it('config が null のとき initial pushPending は no-op で listPending を呼ばない', async () => {
    startEventV1PushLoop();
    // initial tick: pushPending() は resolveEmitConfig() = null なので早期リターン
    await vi.advanceTimersByTimeAsync(0);
    expect(listPendingSpy).not.toHaveBeenCalled();
  });

  it('config が揃ったあとの tick で listPending が呼ばれる', async () => {
    // 最初は config なし → interval 開始
    startEventV1PushLoop();

    // config を後から有効化 (設定保存をシミュレート)
    process.env.EVENT_PUSH_URL = 'https://cr.example.com/api/v1/external-events';
    process.env.EVENT_PUSH_TOKEN = 'tok';
    process.env.EVENT_PUSH_WORKSPACE_ID = 'ws-1';

    // 15 秒進める
    await vi.advanceTimersByTimeAsync(15_000);

    // tick の中で pushPending() → resolveEmitConfig() が有効な config を返す → listPending が呼ばれる
    expect(listPendingSpy).toHaveBeenCalled();
  });

  it('最初から config が揃っている場合: initial tick + 15 秒後 tick の両方で listPending が呼ばれる', async () => {
    process.env.EVENT_PUSH_URL = 'https://cr.example.com/api/v1/external-events';
    process.env.EVENT_PUSH_TOKEN = 'tok';
    process.env.EVENT_PUSH_WORKSPACE_ID = 'ws-1';

    startEventV1PushLoop();
    // initial pushPending は同期的には完了しないが Promise 解決を待つ
    await vi.advanceTimersByTimeAsync(0);
    const callsAfterInitial = listPendingSpy.mock.calls.length;
    expect(callsAfterInitial).toBeGreaterThanOrEqual(1);

    await vi.advanceTimersByTimeAsync(15_000);
    expect(listPendingSpy.mock.calls.length).toBeGreaterThan(callsAfterInitial);
  });

  it('二重起動ガード: 2 回目の startEventV1PushLoop() は interval を追加しない', async () => {
    process.env.EVENT_PUSH_URL = 'https://cr.example.com/api/v1/external-events';
    process.env.EVENT_PUSH_TOKEN = 'tok';
    process.env.EVENT_PUSH_WORKSPACE_ID = 'ws-1';

    startEventV1PushLoop();
    await vi.advanceTimersByTimeAsync(0);
    const callsAfterFirst = listPendingSpy.mock.calls.length;

    startEventV1PushLoop(); // 2 回目は no-op のはず

    // initial pushPending は増えない
    expect(listPendingSpy.mock.calls.length).toBe(callsAfterFirst);

    // timer を進めた際、interval は 1 本だけ動く
    await vi.advanceTimersByTimeAsync(15_000);
    const callsAfterTick = listPendingSpy.mock.calls.length;

    // 1 本なら: callsAfterFirst + 1
    expect(callsAfterTick).toBe(callsAfterFirst + 1);
  });
});
