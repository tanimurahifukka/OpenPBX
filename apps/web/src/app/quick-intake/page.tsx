import { listExtensions } from '@/lib/extensions';
import { requireAccount } from '@/lib/auth';
import { quickIntakeAction } from '@/app/actions';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function QuickIntakePage() {
  await requireAccount();
  const exts = listExtensions();
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <header>
        <h2 className="text-lg font-semibold">クイック起票</h2>
        <p className="text-xs text-slate-500">
          内線番号と患者番号 (5 桁) だけで素早く起票します。患者番号が未登録なら自動で作成し、
          そのまま問診フロー (<code>/triage</code>) に移動します。
        </p>
      </header>

      <form action={quickIntakeAction} className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
        <label className="block text-xs text-slate-600">
          自分の内線番号
          <input
            name="extension"
            list="ext-list"
            required
            inputMode="numeric"
            pattern="[0-9]{2,6}"
            placeholder="例: 1001"
            autoFocus
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1 font-mono text-base"
          />
          <datalist id="ext-list">
            {exts.map((e) => (
              <option key={e.number} value={e.number}>
                {e.displayName ?? ''}
              </option>
            ))}
          </datalist>
        </label>
        <label className="block text-xs text-slate-600">
          患者番号 (5 桁)
          <input
            name="patientId"
            required
            inputMode="numeric"
            pattern="\d{5}"
            maxLength={5}
            placeholder="例: 12345"
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1 font-mono text-2xl tracking-widest"
          />
        </label>
        <label className="block text-xs text-slate-600">
          ひとことメモ (任意)
          <input
            name="note"
            placeholder="例: 階段から落ちた / 腰が痛い"
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
          />
        </label>
        <button
          type="submit"
          className="w-full rounded bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          起票 → 問診へ進む
        </button>
      </form>

      <p className="text-xs text-slate-500">
        起票履歴は <a href="/patients" className="text-blue-700 hover:underline">/patients</a> から日付ごとに確認できます。
      </p>
    </div>
  );
}
