import { listExtensions } from '@/lib/extensions';
import {
  createExtensionAction,
  updateExtensionAction,
  deleteExtensionAction,
} from '@/app/actions';
import { ConfirmButton } from '@/components/ConfirmButton';
import { requireAccount } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function ExtensionsPage() {
  await requireAccount();
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
    cfwdUnconditional?: string | null;
    cfwdBusy?: string | null;
    cfwdNoanswer?: string | null;
    dnd?: boolean;
  };
  submitLabel: string;
  deleteAction?: (formData: FormData) => Promise<void>;
}

function hasForwarding(initial?: ExtensionFormProps['initial']): boolean {
  return !!(initial?.dnd || initial?.cfwdUnconditional || initial?.cfwdBusy || initial?.cfwdNoanswer);
}

function forwardingBadge(initial?: ExtensionFormProps['initial']) {
  if (!initial) return null;
  const tags: string[] = [];
  if (initial.dnd) tags.push('DND');
  if (initial.cfwdUnconditional) tags.push('無条件転送');
  else if (initial.cfwdBusy || initial.cfwdNoanswer) tags.push('条件付き転送');
  if (tags.length === 0) return null;
  return (
    <span className="ml-2 rounded bg-warning-light px-1.5 py-0.5 text-[11px] font-medium text-warning-dark">
      ● {tags.join(' / ')}
    </span>
  );
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
          className="mt-1 w-full rounded border border-slate-300 px-2 py-1 font-mono text-sm read-only:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-primary-400"
          placeholder="例: 1003"
          aria-label="内線番号"
        />
      </label>
      <label className="text-xs text-slate-600">
        表示名
        <input
          name="displayName"
          defaultValue={initial?.displayName ?? ''}
          className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
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
          className="mt-1 w-full rounded border border-slate-300 px-2 py-1 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
          placeholder="4 文字以上"
        />
      </label>
      <label className="text-xs text-slate-600">
        メモ
        <input
          name="note"
          defaultValue={initial?.note ?? ''}
          className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
          placeholder="任意"
        />
      </label>
      <label className="flex items-center gap-2 text-xs text-slate-600 sm:col-span-5">
        <input type="checkbox" name="webrtc" defaultChecked={initial?.webrtc ?? false} className="h-4 w-4" />
        WebRTC を有効化 (/softphone でブラウザ電話)
      </label>

      <details className="rounded border border-slate-200 bg-slate-50 p-3 sm:col-span-5" open={hasForwarding(initial)}>
        <summary className="cursor-pointer text-xs font-semibold text-slate-700">
          転送・DND{forwardingBadge(initial)}
        </summary>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="text-xs text-slate-600">
            無条件転送先
            <input
              name="cfwdUnconditional"
              defaultValue={initial?.cfwdUnconditional ?? ''}
              inputMode="numeric"
              pattern="[0-9+]{2,15}"
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
              placeholder="内線/外線。例: 1002"
              aria-label="無条件転送先"
            />
          </label>
          <label className="text-xs text-slate-600">
            話中転送先
            <input
              name="cfwdBusy"
              defaultValue={initial?.cfwdBusy ?? ''}
              inputMode="numeric"
              pattern="[0-9+]{2,15}"
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
              placeholder="任意"
              aria-label="話中転送先"
            />
          </label>
          <label className="text-xs text-slate-600">
            無応答転送先
            <input
              name="cfwdNoanswer"
              defaultValue={initial?.cfwdNoanswer ?? ''}
              inputMode="numeric"
              pattern="[0-9+]{2,15}"
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
              placeholder="任意"
              aria-label="無応答転送先"
            />
          </label>
        </div>
        <label className="mt-3 flex items-center gap-2 text-xs text-slate-600">
          <input type="checkbox" name="dnd" defaultChecked={initial?.dnd ?? false} className="h-4 w-4" />
          DND (取り込み中 / 着信拒否) を有効化
        </label>
        <p className="mt-2 text-[11px] text-slate-500">
          外線 (携帯など) への転送には outbound prefix を設定した SIP トランクが必要です。無条件転送が最優先、次に DND、その後に話中/無応答転送が判定されます。
        </p>
      </details>

      <div className="flex items-end gap-2">
        <button
          type="submit"
          className="rounded-md border border-slate-300 bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-400"
        >
          {submitLabel}
        </button>
        {isEdit && deleteAction && (
          <ConfirmButton
            confirmText={`内線 ${initial.number} を削除しますか？`}
            formAction={deleteAction}
            className="rounded-md border border-danger bg-white px-3 py-1.5 text-xs font-semibold text-danger hover:bg-danger-light focus:outline-none focus:ring-2 focus:ring-danger"
            aria-label={`内線 ${initial.number} を削除`}
          >
            削除
          </ConfirmButton>
        )}
      </div>
    </form>
  );
}
