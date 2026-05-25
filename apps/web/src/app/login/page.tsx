import { redirect } from 'next/navigation';
import { loginAction } from '@/app/actions';
import { getCurrentAccount } from '@/lib/auth';
import { hasAnyAccounts } from '@/lib/settings';

export const dynamic = 'force-dynamic';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; err?: string }>;
}) {
  const sp = await searchParams;
  // アカウントが 1 件も無い = 初回起動。ログインフォームを出しても
  // 入力する認証情報が存在しないので、ウィザードに回す。
  if (!hasAnyAccounts()) redirect('/setup/wizard');
  const account = await getCurrentAccount();
  if (account) redirect(sp.next ?? '/');

  return (
    <div className="mx-auto max-w-sm space-y-4 py-12">
      <header>
        <h2 className="text-lg font-semibold">ログイン</h2>
        <p className="text-xs text-slate-500">OpenPBX 管理画面</p>
      </header>
      <form action={loginAction} className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
        <input type="hidden" name="next" value={sp.next ?? '/'} />
        <label className="block text-xs text-slate-600">
          ユーザー名
          <input
            name="username"
            required
            autoComplete="username"
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
          />
        </label>
        <label className="block text-xs text-slate-600">
          パスワード
          <input
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
          />
        </label>
        <label className="block text-xs text-slate-600">
          2FA コード (有効な場合)
          <input
            name="totp"
            inputMode="numeric"
            pattern="[0-9]{6}"
            autoComplete="one-time-code"
            placeholder="6 桁"
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1 font-mono text-sm"
          />
        </label>
        {sp.err && <p className="text-xs text-red-600">ログインに失敗しました。</p>}
        <button
          type="submit"
          className="w-full rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700"
        >
          ログイン
        </button>
        <p className="text-[10px] text-slate-400">
          初回は <code>admin / admin-please-change</code> でログインして、すぐ /accounts でパスワードを変更してください。
        </p>
      </form>
    </div>
  );
}
