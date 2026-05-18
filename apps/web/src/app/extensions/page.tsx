import { listExtensions } from '@/lib/extensions';
import {
  createExtensionAction,
  updateExtensionAction,
  deleteExtensionAction,
} from '@/app/actions';
import { ConfirmButton } from '@/components/ConfirmButton';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function ExtensionsPage() {
  const items = listExtensions();
  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-lg font-semibold">内線端末管理</h2>
        <p className="text-xs text-slate-500">
          追加・編集・削除した内線は Asterisk に自動 reload されます。Groundwire 等の SIP クライアントから「Server: Mac の IP」「Username/Auth Username: 内線番号」「Password: secret」で登録してください。
        </p>
      </header>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">新規追加</h3>
        <ExtensionForm action={createExtensionAction} submitLabel="追加" />
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">登録済み ({items.length})</h3>
        {items.length === 0 ? (
          <p className="text-sm text-slate-500">まだ内線が登録されていません。</p>
        ) : (
          <ul className="divide-y divide-slate-200">
            {items.map((e) => (
              <li key={e.number} className="py-3">
                <ExtensionForm
                  action={updateExtensionAction}
                  initial={e}
                  submitLabel="保存"
                  deleteAction={deleteExtensionAction}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

interface ExtensionFormProps {
  action: (formData: FormData) => Promise<void>;
  initial?: {
    number: string;
    displayName: string | null;
    secret: string;
    note: string | null;
    webrtc?: boolean;
  };
  submitLabel: string;
  deleteAction?: (formData: FormData) => Promise<void>;
}

function ExtensionForm({ action, initial, submitLabel, deleteAction }: ExtensionFormProps) {
  const isEdit = !!initial;
  return (
    <form action={action} className="grid grid-cols-1 gap-3 sm:grid-cols-[120px_1fr_1fr_1fr_auto]">
      <label className="text-xs text-slate-600">
        内線番号
        <input
          name="number"
          required
          defaultValue={initial?.number ?? ''}
          readOnly={isEdit}
          inputMode="numeric"
          pattern="[0-9]{2,6}"
          className="mt-1 w-full rounded border border-slate-300 px-2 py-1 font-mono text-sm read-only:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="例: 1003"
          aria-label="内線番号"
        />
      </label>
      <label className="text-xs text-slate-600">
        表示名
        <input
          name="displayName"
          defaultValue={initial?.displayName ?? ''}
          className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="例: Nurse 1003"
        />
      </label>
      <label className="text-xs text-slate-600">
        パスワード (secret)
        <input
          name="secret"
          required
          minLength={4}
          defaultValue={initial?.secret ?? ''}
          className="mt-1 w-full rounded border border-slate-300 px-2 py-1 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="4 文字以上"
        />
      </label>
      <label className="text-xs text-slate-600">
        メモ
        <input
          name="note"
          defaultValue={initial?.note ?? ''}
          className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="任意"
        />
      </label>
      <label className="flex items-center gap-2 text-xs text-slate-600 sm:col-span-5">
        <input type="checkbox" name="webrtc" defaultChecked={initial?.webrtc ?? false} className="h-4 w-4" />
        WebRTC を有効化 (/softphone でブラウザ電話)
      </label>
      <div className="flex items-end gap-2">
        <button
          type="submit"
          className="rounded-md border border-slate-300 bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {submitLabel}
        </button>
        {isEdit && deleteAction && (
          <ConfirmButton
            confirmText={`内線 ${initial.number} を削除しますか？`}
            formAction={deleteAction}
            className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500"
            aria-label={`内線 ${initial.number} を削除`}
          >
            削除
          </ConfirmButton>
        )}
      </div>
    </form>
  );
}
