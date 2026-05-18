// Asterisk のチャネル数を AMI 経由で取得し、分単位スナップショットを取り続ける。
// 永続化は concurrency_snapshots テーブル。

import { getDb } from './db';
import { amiClient } from './ami';

interface Row {
  minute_at: string;
  channels: number;
}

export interface ConcurrencyPoint {
  minute: string; // "YYYY-MM-DD HH:MM:00" UTC
  channels: number;
}

export function listSnapshots(limitMinutes = 60 * 24): ConcurrencyPoint[] {
  return (
    getDb()
      .prepare('SELECT minute_at, channels FROM concurrency_snapshots ORDER BY minute_at DESC LIMIT ?')
      .all(limitMinutes) as Row[]
  )
    .map((r) => ({ minute: r.minute_at, channels: r.channels }))
    .reverse();
}

// 現時点のアクティブチャネル数 (in-use ステート数で近似)
export function currentChannels(): number {
  const cli = amiClient();
  return cli.getDevices().filter((d) => d.state === 'inuse' || d.state === 'ringing' || d.state === 'ringinuse').length;
}

function minuteKey(): string {
  const d = new Date();
  d.setUTCSeconds(0, 0);
  return d.toISOString().slice(0, 16).replace('T', ' ') + ':00';
}

const KEY = '__commandRoomConcurrencyTicker';
export function startConcurrencyLoop(): void {
  const g = globalThis as unknown as Record<string, NodeJS.Timeout | undefined>;
  if (g[KEY]) return;
  const tick = () => {
    try {
      const ch = currentChannels();
      const minute = minuteKey();
      // 同分内の最大値を保持する
      getDb()
        .prepare(
          `INSERT INTO concurrency_snapshots (minute_at, channels)
           VALUES (?, ?)
           ON CONFLICT(minute_at) DO UPDATE SET
             channels = MAX(channels, excluded.channels)`,
        )
        .run(minute, ch);
    } catch (e) {
      console.error('[concurrency] tick error', e);
    }
  };
  g[KEY] = setInterval(tick, 30_000);
  tick();
}
