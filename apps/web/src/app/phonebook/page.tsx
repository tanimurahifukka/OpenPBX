import { listPhonebook, type PhonebookEntry } from '@/lib/phonebook';
import {
  createPhonebookAction,
  updatePhonebookAction,
  deletePhonebookAction,
} from '@/app/actions';
import { ConfirmButton } from '@/components/ConfirmButton';
import { requireAccount } from '@/lib/auth';
import { UPSTREAM_BRAND } from '@/lib/branding';

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
      <header className="space-y-2">
        <h2 className="text-lg font-semibold">電話帳 (連絡先 / 顧客)</h2>
        <p className="text-xs text-slate-500">
          全端末から共通参照する連絡先。顧客・取引先・スタッフなど業種を問わず登録できます。
          着信時の発信者表示や、クリックトゥコールの相手選択に使います。
        </p>
        <div className="rounded-md border border-warning bg-warning-light px-3 py-2 text-xs text-warning-dark">
          <p className="font-semibold">📒 この電話帳は番号を見分けるためのローカルメモです。</p>
          <ul className="mt-1 list-disc pl-5 space-y-0.5">
            <li>診療内容・相談内容・案件詳細・契約金額など機微情報は書かないでください。</li>
            <li>
              詳しい対応内容は{' '}
              <strong>{UPSTREAM_BRAND.shortName}</strong>{' '}
              側の「対応カード」に残してください。電話帳には書きません。
            </li>
            <li>顧客の詳しい属性 (生年月日 / 住所 / 病歴 / 個別事情) は別システムで管理してください。</li>
            <li>OpenPBX を OSS として共有する際、この電話帳は一緒にエクスポートされます。</li>
          </ul>
        </div>
      </header>

      <form method="get" className="flex items-center gap-2">
        <input
          name="q"
          defaultValue={sp.q ?? ''}
          placeholder="名前 / 番号 / 組織 / カテゴリで検索"
          className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm"
          aria-label="検索"
        />
        <button type="submit" className="rounded bg-primary px-3 py-1 text-xs font-semibold text-white">
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
        ひとことメモ
        <input
          name="note"
          defaultValue={initial?.note ?? ''}
          placeholder={`例: 午前中に連絡しやすい / 代表番号 ※詳細は ${UPSTREAM_BRAND.shortName} の対応カードへ`}
          maxLength={120}
          className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
        />
      </label>
      <div className="flex items-end gap-2">
        <button
          type="submit"
          className="rounded-md border border-slate-300 bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-500"
        >
          {submitLabel}
        </button>
        {isEdit && deleteAction && (
          <ConfirmButton
            confirmText={`「${initial.name}」を電話帳から削除しますか？`}
            formAction={deleteAction}
            className="rounded-md border border-danger bg-white px-3 py-1.5 text-xs font-semibold text-danger hover:bg-danger-light"
          >
            削除
          </ConfirmButton>
        )}
      </div>
    </form>
  );
}
