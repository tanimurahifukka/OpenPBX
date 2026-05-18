import { requireRole } from '@/lib/auth';
import { listUpgrades } from '@/lib/upgrades';
import { scheduleUpgradeAction, deleteUpgradeAction } from '@/app/actions';
import { ConfirmButton } from '@/components/ConfirmButton';
import { formatJst, toIsoUtc } from '@/lib/datetime';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function UpgradesPage() {
  await requireRole('admin');
  const jobs = listUpgrades();
  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-lg font-semibold">バージョンアップ予約</h2>
        <p className="text-xs text-slate-500">
          Asterisk / Web イメージの基底タグ切替予定を記録します。実際の docker compose pull / up は
          ホスト側で実行する必要があります (本リポは予約管理のみ)。
        </p>
      </header>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">新規予約</h3>
        <form action={scheduleUpgradeAction} className="grid grid-cols-1 gap-3 sm:grid-cols-[200px_1fr_1fr_1fr_auto]">
          <label className="text-xs text-slate-600">
            予定日時 (UTC ISO)
            <input
              name="scheduledAt"
              required
              type="datetime-local"
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1 font-mono text-sm"
            />
          </label>
          <label className="text-xs text-slate-600">
            asterisk image
            <input
              name="asteriskImage"
              required
              placeholder="例: ubuntu:24.04"
              defaultValue="ubuntu:22.04"
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1 font-mono text-sm"
            />
          </label>
          <label className="text-xs text-slate-600">
            web image
            <input
              name="webImage"
              placeholder="例: node:22-bookworm-slim"
              defaultValue="node:20-bookworm-slim"
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1 font-mono text-sm"
            />
          </label>
          <label className="text-xs text-slate-600">
            メモ
            <input
              name="note"
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
            />
          </label>
          <div className="flex items-end">
            <button type="submit" className="rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white">
              予約
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">予約 ({jobs.length})</h3>
        {jobs.length === 0 ? (
          <p className="text-sm text-slate-500">予約はありません。</p>
        ) : (
          <table className="min-w-full text-xs">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-2 py-1 text-left">予定 (JST)</th>
                <th className="px-2 py-1 text-left">asterisk</th>
                <th className="px-2 py-1 text-left">web</th>
                <th className="px-2 py-1 text-left">メモ</th>
                <th className="px-2 py-1 text-left">適用</th>
                <th className="px-2 py-1"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {jobs.map((j) => (
                <tr key={j.id}>
                  <td className="px-2 py-1 font-mono">
                    <time dateTime={toIsoUtc(j.scheduledAt) ?? ''}>{formatJst(j.scheduledAt)}</time>
                  </td>
                  <td className="px-2 py-1 font-mono">{j.asteriskImage}</td>
                  <td className="px-2 py-1 font-mono">{j.webImage ?? '-'}</td>
                  <td className="px-2 py-1">{j.note ?? '-'}</td>
                  <td className="px-2 py-1 font-mono">{j.appliedAt ? formatJst(j.appliedAt) : '未適用'}</td>
                  <td className="px-2 py-1">
                    <form action={deleteUpgradeAction}>
                      <input type="hidden" name="id" value={j.id} />
                      <ConfirmButton
                        confirmText={`予約 #${j.id} を削除しますか？`}
                        className="rounded border border-red-300 bg-white px-2 py-0.5 text-xs text-red-700"
                      >
                        削除
                      </ConfirmButton>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
