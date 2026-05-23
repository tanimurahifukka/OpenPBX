import { listPhonebook, type PhonebookEntry } from '@/lib/phonebook';
import {
  createPhonebookAction,
  updatePhonebookAction,
  deletePhonebookAction,
} from '@/app/actions';
import { ConfirmButton } from '@/components/ConfirmButton';
import { requireAccount } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface SearchParams {
  q?: string;
}

export default async function PhonebookPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireAccount();
  const sp = await searchParams;
  const entries = listPhonebook(sp.q);
  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-lg font-semibold">電話帳 (連絡先 / 顧客)</h2>
        <p className="text-xs text-slate-500">
          全端末から共通参照する連絡先。顧客・取引先・スタッフなど業種を問わず登録できます。
          <code>/api/phonebook/lookup?number=...</code> で番号逆引きできます。
        </p>
      </header>

      <form method="get" className="flex items-center gap-2">
        <input
          name="q"
          defaultValue={sp.q ?? ''}
          placeholder="名前 / 番号 / 組織 / カテゴリで検索"
          className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm"
          aria-label="検索"
        />
        <button type="submit" className="rounded bg-blue-600 px-3 py-1 text-xs font-semibold text-white">
          検索
        </button>
      </form>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">新規追加</h3>
        <PhonebookForm action={createPhonebookAction} submitLabel="追加" />
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">一覧 ({entries.length})</h3>
        {entries.length === 0 ? (
          <p className="text-sm text-slate-500">該当エントリがありません。</p>
        ) : (
          <ul className="divide-y divide-slate-200">
            {entries.map((e) => (
              <li key={e.id} className="py-3">
                <PhonebookForm
                  action={updatePhonebookAction}
                  initial={e}
                  submitLabel="保存"
                  deleteAction={deletePhonebookAction}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

interface Props {
  action: (formData: FormData) => Promise<void>;
  initial?: PhonebookEntry;
  submitLabel: string;
  deleteAction?: (formData: FormData) => Promise<void>;
}

function PhonebookForm({ action, initial, submitLabel, deleteAction }: Props) {
  const isEdit = !!initial;
  return (
    <form action={action} className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_160px_1fr_140px_1fr_auto]">
      {isEdit && <input type="hidden" name="id" value={initial.id} />}
      <label className="text-xs text-slate-600">
        名前
        <input
          name="name"
          required
          defaultValue={initial?.name ?? ''}
          className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
        />
      </label>
      <label className="text-xs text-slate-600">
        番号
        <input
          name="number"
          required
          defaultValue={initial?.number ?? ''}
          className="mt-1 w-full rounded border border-slate-300 px-2 py-1 font-mono text-sm"
        />
      </label>
      <label className="text-xs text-slate-600">
        組織 / 会社
        <input
          name="org"
          defaultValue={initial?.org ?? ''}
          placeholder="例: ○○商事 / ○○病院"
          className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
        />
      </label>
      <label className="text-xs text-slate-600">
        カテゴリ
        <input
          name="category"
          defaultValue={initial?.category ?? ''}
          placeholder="例: 顧客 / 取引先 / スタッフ"
          className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
        />
      </label>
      <label className="text-xs text-slate-600">
        メモ
        <input
          name="note"
          defaultValue={initial?.note ?? ''}
          className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
        />
      </label>
      <div className="flex items-end gap-2">
        <button
          type="submit"
          className="rounded-md border border-slate-300 bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
        >
          {submitLabel}
        </button>
        {isEdit && deleteAction && (
          <ConfirmButton
            confirmText={`「${initial.name}」を電話帳から削除しますか？`}
            formAction={deleteAction}
            className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50"
          >
            削除
          </ConfirmButton>
        )}
      </div>
    </form>
  );
}
