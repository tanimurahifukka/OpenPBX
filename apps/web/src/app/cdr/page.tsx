import { listCdr, startCdrIngestLoop } from '@/lib/cdr';
import { formatJst, toIsoUtc } from '@/lib/datetime';
import { requireAccount } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface SearchParams {
  from?: string;
  to?: string;
  src?: string;
  dst?: string;
  disposition?: string;
}

export default async function CdrPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireAccount();
  startCdrIngestLoop();
  const sp = await searchParams;
  const rows = listCdr({
    from: sp.from,
    to: sp.to,
    src: sp.src,
    dst: sp.dst,
    disposition: sp.disposition,
    limit: 300,
  });

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h2 className="text-lg font-semibold">発着信履歴 (CDR)</h2>
        <p className="text-xs text-slate-500">
          Asterisk の cdr_csv (Master.csv) を 10 秒ごとに取り込み。最新 300 件まで表示。
        </p>
      </header>

      <form method="get" className="grid grid-cols-1 gap-3 rounded-lg border border-slate-200 bg-white p-3 sm:grid-cols-[1fr_1fr_1fr_1fr_auto]">
        <input
          name="src"
          defaultValue={sp.src ?? ''}
          placeholder="発信元 (src) を含む"
          className="rounded border border-slate-300 px-2 py-1 text-sm"
          aria-label="src フィルタ"
        />
        <input
          name="dst"
          defaultValue={sp.dst ?? ''}
          placeholder="宛先 (dst) を含む"
          className="rounded border border-slate-300 px-2 py-1 text-sm"
          aria-label="dst フィルタ"
        />
        <select
          name="disposition"
          defaultValue={sp.disposition ?? ''}
          className="rounded border border-slate-300 px-2 py-1 text-sm"
          aria-label="disposition フィルタ"
        >
          <option value="">— 全 disposition —</option>
          <option value="ANSWERED">ANSWERED</option>
          <option value="NO ANSWER">NO ANSWER</option>
          <option value="BUSY">BUSY</option>
          <option value="FAILED">FAILED</option>
        </select>
        <input
          name="from"
          defaultValue={sp.from ?? ''}
          placeholder="YYYY-MM-DD HH:MM:SS (UTC)"
          className="rounded border border-slate-300 px-2 py-1 font-mono text-xs"
          aria-label="from"
        />
        <button
          type="submit"
          className="rounded bg-brand px-3 py-1 text-xs font-semibold text-white hover:bg-brand-500"
        >
          検索
        </button>
      </form>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">
          通話記録がまだありません。内線同士で通話してみてください。
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-600">
              <tr>
                <th className="px-2 py-2 text-left">開始 (JST)</th>
                <th className="px-2 py-2 text-left">発信元</th>
                <th className="px-2 py-2 text-left">宛先</th>
                <th className="px-2 py-2 text-right">通話</th>
                <th className="px-2 py-2 text-right">うち応答</th>
                <th className="px-2 py-2 text-left">結果</th>
                <th className="px-2 py-2 text-left font-mono">uniqueid</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {rows.map((r) => (
                <tr key={r.uniqueid} className="hover:bg-slate-50">
                  <td className="px-2 py-1 font-mono text-xs">
                    <time dateTime={toIsoUtc(r.startAt) ?? ''}>{formatJst(r.startAt)}</time>
                  </td>
                  <td className="px-2 py-1 font-mono">{r.src ?? '-'}</td>
                  <td className="px-2 py-1 font-mono">{r.dst ?? '-'}</td>
                  <td className="px-2 py-1 text-right font-mono">{r.duration}s</td>
                  <td className="px-2 py-1 text-right font-mono">{r.billsec}s</td>
                  <td className="px-2 py-1">
                    <span
                      className={`rounded-full border px-2 py-0.5 text-xs ${
                        r.disposition === 'ANSWERED'
                          ? 'border-brand-300 bg-brand-50 text-brand-700'
                          : r.disposition === 'NO ANSWER'
                            ? 'border-amber-300 bg-banana-50 text-banana-500'
                            : r.disposition === 'BUSY'
                              ? 'border-orange-300 bg-orange-50 text-orange-800'
                              : r.disposition === 'FAILED'
                                ? 'border-melon-300 bg-melon-50 text-melon-600'
                                : 'border-slate-300 bg-slate-50 text-slate-700'
                      }`}
                    >
                      {r.disposition ?? '-'}
                    </span>
                  </td>
                  <td className="px-2 py-1 font-mono text-xs text-slate-500">{r.uniqueid}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
