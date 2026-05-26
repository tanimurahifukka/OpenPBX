import { requireRole } from '@/lib/auth';
import { getPolicy, listIpAllow } from '@/lib/policy';
import {
  updatePolicyAction,
  upsertIpAllowAction,
  deleteIpAllowAction,
} from '@/app/actions';
import { ConfirmButton } from '@/components/ConfirmButton';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function SecurityPage() {
  await requireRole('admin');
  const p = getPolicy();
  const ips = listIpAllow();
  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-lg font-semibold">セキュリティ</h2>
        <p className="text-xs text-slate-500">
          パスワードポリシー / IP アクセス制御 / 2FA 設定。リバプロを使う場合は X-Forwarded-For が必要。
        </p>
      </header>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">パスワードポリシー</h3>
        <form action={updatePolicyAction} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <label className="text-xs text-slate-600">
            最小文字数
            <input
              type="number"
              name="minLength"
              defaultValue={p.minLength}
              min={4}
              max={64}
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
            />
          </label>
          {([
            ['requireLowercase', '小文字必須', p.requireLowercase],
            ['requireUppercase', '大文字必須', p.requireUppercase],
            ['requireDigit', '数字必須', p.requireDigit],
            ['requireSymbol', '記号必須', p.requireSymbol],
          ] as const).map(([k, label, val]) => (
            <label key={k} className="flex items-center gap-2 text-xs text-slate-600">
              <input type="checkbox" name={k} defaultChecked={val} className="h-4 w-4" />
              {label}
            </label>
          ))}
          <label className="text-xs text-slate-600">
            ローテーション (日, 0=無効)
            <input
              type="number"
              name="rotationDays"
              defaultValue={p.rotationDays}
              min={0}
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
            />
          </label>
          <label className="text-xs text-slate-600">
            ロックアウト試行回数
            <input
              type="number"
              name="lockoutThreshold"
              defaultValue={p.lockoutThreshold}
              min={1}
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
            />
          </label>
          <div className="col-span-2 sm:col-span-4">
            <button
              type="submit"
              className="rounded bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-500"
            >
              保存
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">IP アクセス制御 ({ips.length})</h3>
        <p className="mb-3 text-xs text-slate-500">
          1 件も登録されていなければ全 IP を許可します。登録すると、リスト外の IP からはログイン拒否。
        </p>
        <form action={upsertIpAllowAction} className="mb-3 grid grid-cols-[1fr_1fr_auto] gap-2">
          <input
            name="cidr"
            required
            placeholder="例: 192.168.1.0/24 or 203.0.113.5/32"
            className="rounded border border-slate-300 px-2 py-1 font-mono text-sm"
          />
          <input
            name="note"
            placeholder="メモ"
            className="rounded border border-slate-300 px-2 py-1 text-sm"
          />
          <button type="submit" className="rounded bg-primary px-3 py-1 text-xs font-semibold text-white">
            追加 / 更新
          </button>
        </form>
        {ips.length === 0 ? (
          <p className="text-sm text-slate-500">未登録 (全 IP 許可状態)。</p>
        ) : (
          <ul className="divide-y divide-slate-200">
            {ips.map((i) => (
              <li key={i.cidr} className="flex items-center gap-3 py-2 text-sm">
                <span className="w-48 font-mono">{i.cidr}</span>
                <span className="flex-1 text-slate-600">{i.note ?? '-'}</span>
                <form action={deleteIpAllowAction}>
                  <input type="hidden" name="cidr" value={i.cidr} />
                  <ConfirmButton
                    confirmText={`${i.cidr} を許可リストから削除しますか？`}
                    className="rounded border border-danger bg-white px-2 py-0.5 text-xs text-danger hover:bg-danger-light"
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
