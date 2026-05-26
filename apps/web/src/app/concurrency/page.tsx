import { listSnapshots, currentChannels, startConcurrencyLoop } from '@/lib/concurrency';
import { requireAccount } from '@/lib/auth';
import { formatJst, toIsoUtc } from '@/lib/datetime';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function ConcurrencyPage() {
  await requireAccount();
  startConcurrencyLoop();
  const now = currentChannels();
  const snapshots = listSnapshots(60 * 24).slice(-180);
  const max = Math.max(1, ...snapshots.map((s) => s.channels));
  return (
    <div className="space-y-4">
      <header>
        <h2 className="text-lg font-semibold">同時通話数</h2>
        <p className="text-xs text-slate-500">
          AMI から取得した端末状態をもとに、30 秒ごとに集計した分単位のスナップショット。
        </p>
      </header>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="text-sm">
          現在の同時通話数: <span className="font-mono text-2xl font-bold">{now}</span>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="mb-2 text-sm font-semibold text-slate-700">
          直近 {snapshots.length} 分 (ピーク {max})
        </h3>
        <div className="flex items-end gap-px overflow-x-auto" style={{ height: 120 }} aria-label="同時通話数グラフ">
          {snapshots.map((s) => {
            const h = Math.max(2, Math.round((s.channels / max) * 100));
            return (
              <div
                key={s.minute}
                className="w-1 bg-brand-500"
                title={`${formatJst(s.minute)} : ${s.channels}`}
                style={{ height: `${h}%` }}
              />
            );
          })}
        </div>
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-slate-500">明細</summary>
          <ul className="mt-2 max-h-72 overflow-y-auto divide-y divide-slate-200 text-xs">
            {snapshots
              .slice()
              .reverse()
              .map((s) => (
                <li key={s.minute} className="flex items-center justify-between py-1">
                  <time className="font-mono" dateTime={toIsoUtc(s.minute) ?? ''}>
                    {formatJst(s.minute)}
                  </time>
                  <span className="font-mono">{s.channels} ch</span>
                </li>
              ))}
          </ul>
        </details>
      </section>
    </div>
  );
}
