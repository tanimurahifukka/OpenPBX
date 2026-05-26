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
          <input
            name="username"
            required
            pattern="[A-Za-z0-9_-]{3,32}"
            placeholder="username (3-32文字)"
            className="rounded border border-slate-300 px-2 py-1 text-sm"
          />
          <input
            name="displayName"
            placeholder="表示名"
            className="rounded border border-slate-300 px-2 py-1 text-sm"
          />
          <input
            name="password"
            type="password"
            required
            minLength={8}
            placeholder="password (8文字以上)"
            className="rounded border border-slate-300 px-2 py-1 text-sm"
          />
          <select name="role" defaultValue="user" className="rounded border border-slate-300 px-2 py-1 text-sm">
            <option value="user">user</option>
            <option value="supervisor">supervisor</option>
            <option value="admin">admin</option>
          </select>
          <button type="submit" className="rounded bg-brand px-3 py-1.5 text-xs font-semibold text-white">
            追加
          </button>
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
    <li className="space-y-2 py-3">
      <div className="flex items-baseline gap-3 text-sm">
        <span className="font-mono">{a.username}</span>
        {isMe && (
          <span className="rounded-full border border-brand-300 bg-brand-50 px-2 py-0.5 text-[10px] font-semibold text-brand-700">
            あなた
          </span>
        )}
        <span className="text-slate-600">{a.displayName ?? '-'}</span>
        <span className="text-xs text-slate-500">{a.role}</span>
        {a.totpEnabled && (
          <span className="rounded-full border border-brand-300 bg-brand-50 px-2 py-0.5 text-[10px] text-brand-700">
            2FA
          </span>
        )}
        <span className="ml-auto text-xs text-slate-400">{a.createdAt}</span>
      </div>

      {/* 表示名 */}
      <form action={updateAccountDisplayNameAction} className="grid grid-cols-[1fr_auto] gap-2">
        <input type="hidden" name="id" value={a.id} />
        <input
          name="displayName"
          defaultValue={a.displayName ?? ''}
          placeholder="表示名"
          className="rounded border border-slate-300 px-2 py-1 text-xs"
        />
        <button type="submit" className="rounded border border-slate-300 bg-white px-2 py-1 text-xs">
          表示名を更新
        </button>
      </form>

      {/* ロール */}
      <form action={updateAccountRoleAction} className="grid grid-cols-[140px_auto] gap-2">
        <input type="hidden" name="id" value={a.id} />
        <select name="role" defaultValue={a.role} className="rounded border border-slate-300 px-2 py-1 text-xs">
          <option value="user">user</option>
          <option value="supervisor">supervisor</option>
          <option value="admin">admin</option>
        </select>
        <button type="submit" className="rounded border border-slate-300 bg-white px-2 py-1 text-xs">
          ロールを更新
        </button>
      </form>

      {/* パスワード */}
      <form action={updateAccountPasswordAction} className="grid grid-cols-[1fr_auto] gap-2">
        <input type="hidden" name="id" value={a.id} />
        <input
          name="password"
          type="password"
          minLength={8}
          placeholder="新しいパスワード"
          className="rounded border border-slate-300 px-2 py-1 text-xs"
        />
        <button type="submit" className="rounded border border-slate-300 bg-white px-2 py-1 text-xs">
          パスワードを更新
        </button>
      </form>

      {/* 削除 */}
      {!isMe && (
        <form action={deleteAccountAction}>
          <input type="hidden" name="id" value={a.id} />
          <ConfirmButton
            confirmText={`アカウント "${a.username}" を削除しますか？`}
            className="rounded border border-melon-300 bg-white px-2 py-1 text-xs text-melon-500 hover:bg-melon-50"
          >
            削除
          </ConfirmButton>
        </form>
      )}
    </li>
  );
}
