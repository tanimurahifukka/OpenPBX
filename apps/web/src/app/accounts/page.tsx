import { listAccounts, requireRole, type Account } from '@/lib/auth';
import {
  createAccountAction,
  updateAccountRoleAction,
  updateAccountDisplayNameAction,
  updateAccountPasswordAction,
  deleteAccountAction,
} from '@/app/actions';
import { ConfirmButton } from '@/components/ConfirmButton';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function AccountsPage() {
  const me = await requireRole('admin');
  const accounts = listAccounts();
  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-lg font-semibold">アカウント管理</h2>
        <p className="text-xs text-slate-500">
          ログインユーザーの追加・編集・削除。ロール: user (読み取り中心) / supervisor (運用) / admin (全権)。
          自分自身の削除・降格、最後の admin の降格はブロックされます。
        </p>
      </header>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">新規追加</h3>
        <form action={createAccountAction} className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_1fr_140px_auto]">
          <label className="text-xs text-slate-600">
            ユーザー名
            <input name="username" required pattern="[A-Za-z0-9_-]{3,32}" placeholder="3-32文字"
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm" />
          </label>
          <label className="text-xs text-slate-600">
            表示名
            <input name="displayName" placeholder="表示名"
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm" />
          </label>
          <label className="text-xs text-slate-600">
            パスワード
            <input name="password" type="password" required minLength={8} placeholder="8文字以上"
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm" />
          </label>
          <label className="text-xs text-slate-600">
            ロール
            <select name="role" defaultValue="user"
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm">
              <option value="user">user</option>
              <option value="supervisor">supervisor</option>
              <option value="admin">admin</option>
            </select>
          </label>
          <div className="flex items-end">
            <button type="submit" className="rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white">
              追加
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">一覧 ({accounts.length})</h3>
        <ul className="divide-y divide-slate-200">
          {accounts.map((a) => (
            <AccountRow key={a.id} account={a} isMe={a.id === me.id} />
          ))}
        </ul>
      </section>
    </div>
  );
}

function AccountRow({ account: a, isMe }: { account: Account; isMe: boolean }) {
  return (
    <li className="py-3">
      <div className="flex items-baseline gap-3 text-sm">
        <span className="font-mono font-semibold">{a.username}</span>
        {isMe && (
          <span className="rounded-full border border-primary-300 bg-primary-50 px-2 py-0.5 text-xs font-semibold text-primary-700">
            あなた
          </span>
        )}
        <span className="text-xs text-slate-500">{a.role}</span>
        {a.totpEnabled && (
          <span className="rounded-full border border-primary-300 bg-primary-50 px-2 py-0.5 text-xs text-primary-700">
            2FA
          </span>
        )}
        <span className="ml-auto text-xs text-slate-400">{a.createdAt}</span>
      </div>

      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_140px_1fr]">
        <form action={updateAccountDisplayNameAction} className="flex gap-2">
          <input type="hidden" name="id" value={a.id} />
          <label className="flex-1 text-[11px] text-slate-500">
            表示名
            <input name="displayName" defaultValue={a.displayName ?? ''} placeholder="表示名"
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-xs" />
          </label>
          <button type="submit" className="mt-5 shrink-0 rounded border border-slate-300 bg-white px-2 py-1 text-xs hover:bg-slate-50">
            更新
          </button>
        </form>

        <form action={updateAccountRoleAction} className="flex gap-2">
          <input type="hidden" name="id" value={a.id} />
          <label className="flex-1 text-[11px] text-slate-500">
            ロール
            <select name="role" defaultValue={a.role}
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-xs">
              <option value="user">user</option>
              <option value="supervisor">supervisor</option>
              <option value="admin">admin</option>
            </select>
          </label>
          <button type="submit" className="mt-5 shrink-0 rounded border border-slate-300 bg-white px-2 py-1 text-xs hover:bg-slate-50">
            更新
          </button>
        </form>

        <form action={updateAccountPasswordAction} className="flex gap-2">
          <input type="hidden" name="id" value={a.id} />
          <label className="flex-1 text-[11px] text-slate-500">
            パスワード
            <input name="password" type="password" minLength={8} placeholder="新しいパスワード"
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-xs" />
          </label>
          <button type="submit" className="mt-5 shrink-0 rounded border border-slate-300 bg-white px-2 py-1 text-xs hover:bg-slate-50">
            更新
          </button>
        </form>
      </div>

      {!isMe && (
        <div className="mt-2">
          <form action={deleteAccountAction}>
            <input type="hidden" name="id" value={a.id} />
            <ConfirmButton
              confirmText={`アカウント "${a.username}" を削除しますか？`}
              className="rounded border border-red-300 bg-white px-2 py-1 text-xs text-red-700 hover:bg-red-50"
            >
              削除
            </ConfirmButton>
          </form>
        </div>
      )}
    </li>
  );
}
