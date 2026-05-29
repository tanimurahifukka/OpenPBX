import { listBlacklist } from '@/lib/blacklist';
import { addBlacklistAction, deleteBlacklistAction } from '@/app/actions';
import { ConfirmButton } from '@/components/ConfirmButton';
import { requireRole } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function BlacklistPage() {
  await requireRole('admin', 'supervisor');
  const items = listBlacklist();
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h2 className="text-lg font-semibold">着信拒否 (ブラックリスト)</h2>
        <p className="text-xs text-slate-500">
          ここに登録した番号からの外線着信は応答せず切断します。末尾に <code className="font-mono">*</code> を付けると前方一致 (例:{' '}
          <code className="font-mono">09012*</code>)。通話履歴の「ブロック」からも追加できます。
        </p>
      </header>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">新規追加</h3>
        <form action={addBlacklistAction} className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_2fr_auto]">
          <label className="text-xs text-slate-600">
            番号
            <input
              name="number"
              required
              inputMode="tel"
              pattern="[0-9+*]{2,20}"
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
              placeholder="例: 0312345678 / 09012*"
              aria-label="拒否する番号"
            />
          </label>
          <label className="text-xs text-slate-600">
            理由 (任意)
            <input
              name="reason"
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
              placeholder="例: 迷惑営業"
              aria-label="理由"
            />
          </label>
          <div className="flex items-end">
            <button
              type="submit"
              className="rounded-md border border-slate-300 bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-400"
            >
              追加
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">登録済み ({items.length})</h3>
        {items.length === 0 ? (
          <p className="text-sm text-slate-500">着信拒否に登録された番号はありません。</p>
        ) : (
          <ul className="divide-y divide-slate-200">
            {items.map((e) => (
              <li key={e.number} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="font-mono text-sm text-slate-800">{e.number}</p>
                  {e.reason && <p className="truncate text-xs text-slate-500">{e.reason}</p>}
                </div>
                <form action={deleteBlacklistAction}>
                  <input type="hidden" name="number" value={e.number} />
                  <ConfirmButton
                    confirmText={`${e.number} を着信拒否から削除しますか？`}
                    className="rounded-md border border-danger bg-white px-3 py-1.5 text-xs font-semibold text-danger hover:bg-danger-light focus:outline-none focus:ring-2 focus:ring-danger"
                    aria-label={`${e.number} を削除`}
                  >
                    削除
                  </ConfirmButton>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
