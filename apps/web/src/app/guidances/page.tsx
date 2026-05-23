import { listGuidances } from '@/lib/guidances';
import { deleteGuidanceAction } from '@/app/actions';
import { ConfirmButton } from '@/components/ConfirmButton';
import { requireAccount } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function GuidancesPage() {
  await requireAccount();
  const items = listGuidances();
  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-lg font-semibold">共通ガイダンス</h2>
        <p className="text-xs text-slate-500">
          IVR や着信フローで再生する音声ファイル (wav)。<code className="rounded bg-slate-100 px-1">name</code>{' '}
          は Asterisk の <code className="rounded bg-slate-100 px-1">Playback(...)</code>{' '}
          にそのまま渡るパス (例 <code>custom/ivr-welcome</code>)。8 kHz mono PCM 推奨。
        </p>
        <p className="mt-1 text-xs text-slate-500">
          ホスト Mac で <code className="rounded bg-slate-100 px-1">./host-tts/make-prompts.sh</code> を実行すれば、
          Kyoko 声の標準セット (ivr-*) を一括生成できます。
        </p>
      </header>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">wav アップロード</h3>
        <form
          method="post"
          action="/api/guidances"
          encType="multipart/form-data"
          className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto]"
        >
          <label className="text-xs text-slate-600">
            name (拡張子なし、例: custom/ivr-welcome)
            <input
              name="name"
              required
              pattern="[A-Za-z0-9_/-]{1,80}"
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1 font-mono text-sm"
            />
          </label>
          <label className="text-xs text-slate-600">
            wav ファイル
            <input
              type="file"
              name="file"
              accept="audio/wav,.wav"
              required
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
            />
          </label>
          <div className="flex items-end">
            <button
              type="submit"
              className="rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
            >
              アップロード
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">一覧 ({items.length})</h3>
        {items.length === 0 ? (
          <p className="text-sm text-slate-500">まだ登録されたガイダンスがありません。</p>
        ) : (
          <ul className="divide-y divide-slate-200">
            {items.map((g) => (
              <li key={g.name} className="flex items-center gap-3 py-2 text-sm">
                <span className="font-mono">{g.name}</span>
                <span className="text-xs text-slate-500">
                  {g.source} / {g.size ?? '-'} bytes
                </span>
                <span className="ml-auto text-xs text-slate-500">{g.updatedAt}</span>
                <form action={deleteGuidanceAction}>
                  <input type="hidden" name="name" value={g.name} />
                  <ConfirmButton
                    confirmText={`ガイダンス ${g.name} を削除しますか？`}
                    className="rounded border border-red-300 bg-white px-2 py-0.5 text-xs text-red-700 hover:bg-red-50"
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
