import { listRates, listBilling } from '@/lib/billing';
import { requireRole } from '@/lib/auth';
import { upsertRateAction, deleteRateAction } from '@/app/actions';
import { ConfirmButton } from '@/components/ConfirmButton';
import { formatJst, toIsoUtc } from '@/lib/datetime';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function BillingPage() {
  await requireRole('admin', 'supervisor');
  const rates = listRates();
  const billing = listBilling();
  const total = billing.reduce((a, b) => a + b.cost, 0);
  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-lg font-semibold">課金明細</h2>
        <p className="text-xs text-slate-500">
          発信先 prefix ごとのレートを設定し、CDR と組み合わせて通話コストを算出。直近 1000 件まで。
        </p>
      </header>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">レート表 ({rates.length})</h3>
        <form action={upsertRateAction} className="mb-3 grid grid-cols-[100px_1fr_120px_120px_auto] gap-2">
          <input
            name="prefix"
            required
            placeholder="prefix (例: 0)"
            className="rounded border border-slate-300 px-2 py-1 font-mono text-sm"
          />
          <input
            name="label"
            placeholder="メモ (例: 国内固定)"
            className="rounded border border-slate-300 px-2 py-1 text-sm"
          />
          <input
            name="perMin"
            type="number"
            step="0.01"
            min={0}
            placeholder="円/分"
            required
            className="rounded border border-slate-300 px-2 py-1 font-mono text-sm"
          />
          <input
            name="setupFee"
            type="number"
            step="0.01"
            min={0}
            placeholder="接続料"
            className="rounded border border-slate-300 px-2 py-1 font-mono text-sm"
          />
          <button type="submit" className="rounded bg-brand px-3 py-1 text-xs font-semibold text-white">
            追加/更新
          </button>
        </form>
        {rates.length === 0 ? (
          <p className="text-sm text-slate-500">未登録。</p>
        ) : (
          <ul className="divide-y divide-slate-200">
            {rates.map((r) => (
              <li key={r.id} className="flex items-center gap-3 py-2 text-sm">
                <span className="w-20 font-mono">{r.prefix}</span>
                <span className="flex-1">{r.label ?? '-'}</span>
                <span className="font-mono">¥{r.perMin.toFixed(2)}/分</span>
                <span className="font-mono">+¥{r.setupFee.toFixed(2)}</span>
                <form action={deleteRateAction}>
                  <input type="hidden" name="prefix" value={r.prefix} />
                  <ConfirmButton
                    confirmText={`レート ${r.prefix} を削除しますか？`}
                    className="rounded border border-melon-300 bg-white px-2 py-0.5 text-xs text-melon-500 hover:bg-melon-50"
                  >
                    削除
                  </ConfirmButton>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="mb-2 text-sm font-semibold text-slate-700">
          通話明細 ({billing.length} 件 / 合計 ¥{total.toFixed(2)})
        </h3>
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-2 py-1 text-left">開始</th>
                <th className="px-2 py-1 text-left">src</th>
                <th className="px-2 py-1 text-left">dst</th>
                <th className="px-2 py-1 text-right">通話秒</th>
                <th className="px-2 py-1 text-left">レート</th>
                <th className="px-2 py-1 text-right">コスト</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {billing.map((b) => (
                <tr key={b.uniqueid}>
                  <td className="px-2 py-1 font-mono">
                    <time dateTime={toIsoUtc(b.startAt) ?? ''}>{formatJst(b.startAt)}</time>
                  </td>
                  <td className="px-2 py-1 font-mono">{b.src ?? '-'}</td>
                  <td className="px-2 py-1 font-mono">{b.dst ?? '-'}</td>
                  <td className="px-2 py-1 text-right font-mono">{b.billsec}</td>
                  <td className="px-2 py-1 font-mono">{b.rate?.prefix ?? '-'}</td>
                  <td className="px-2 py-1 text-right font-mono">¥{b.cost.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
