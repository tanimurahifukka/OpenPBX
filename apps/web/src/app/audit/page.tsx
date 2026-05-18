import { listAudit, listLoginHistory, requireRole } from '@/lib/auth';
import { formatJst, toIsoUtc } from '@/lib/datetime';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function AuditPage() {
  await requireRole('admin', 'supervisor');
  const audit = listAudit(200);
  const logins = listLoginHistory(100);
  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-lg font-semibold">操作 / ログイン履歴</h2>
        <p className="text-xs text-slate-500">設定変更や認証イベントの監査ログ (最新 200 + 100 件)。</p>
      </header>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="mb-2 text-sm font-semibold text-slate-700">操作履歴 ({audit.length})</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-2 py-1 text-left">時刻 (JST)</th>
                <th className="px-2 py-1 text-left">操作者</th>
                <th className="px-2 py-1 text-left">アクション</th>
                <th className="px-2 py-1 text-left">対象</th>
                <th className="px-2 py-1 text-left">IP</th>
                <th className="px-2 py-1 text-left">詳細</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {audit.map((a, i) => (
                <tr key={i}>
                  <td className="px-2 py-1 font-mono">
                    <time dateTime={toIsoUtc(a.created_at) ?? ''}>{formatJst(a.created_at)}</time>
                  </td>
                  <td className="px-2 py-1 font-mono">{a.actor ?? '-'}</td>
                  <td className="px-2 py-1 font-mono">{a.action}</td>
                  <td className="px-2 py-1 font-mono">{a.target ?? '-'}</td>
                  <td className="px-2 py-1 font-mono">{a.ip ?? '-'}</td>
                  <td className="px-2 py-1 font-mono">{a.details ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="mb-2 text-sm font-semibold text-slate-700">ログイン履歴 ({logins.length})</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-2 py-1 text-left">時刻 (JST)</th>
                <th className="px-2 py-1 text-left">username</th>
                <th className="px-2 py-1 text-left">結果</th>
                <th className="px-2 py-1 text-left">IP</th>
                <th className="px-2 py-1 text-left">User-Agent</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {logins.map((l, i) => (
                <tr key={i}>
                  <td className="px-2 py-1 font-mono">
                    <time dateTime={toIsoUtc(l.created_at) ?? ''}>{formatJst(l.created_at)}</time>
                  </td>
                  <td className="px-2 py-1 font-mono">{l.username}</td>
                  <td className="px-2 py-1">
                    <span
                      className={`rounded-full border px-2 py-0.5 ${l.success ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-red-300 bg-red-50 text-red-800'}`}
                    >
                      {l.success ? '成功' : '失敗'}
                    </span>
                  </td>
                  <td className="px-2 py-1 font-mono">{l.ip ?? '-'}</td>
                  <td className="px-2 py-1 truncate font-mono">{l.user_agent ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
