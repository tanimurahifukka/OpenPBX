import { listIvrMenus, type IvrMenu } from '@/lib/ivr';
import {
  upsertIvrAction,
  deleteIvrAction,
} from '@/app/actions';
import { ConfirmButton } from '@/components/ConfirmButton';
import { requireAccount } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function IvrPage() {
  await requireAccount();
  const menus = listIvrMenus();
  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-lg font-semibold">IVR (自動音声応答)</h2>
        <p className="text-xs text-slate-500">
          IVR メニューを編集すると、Asterisk の <code className="rounded bg-slate-100 px-1">[ivr-&lt;番号&gt;]</code>{' '}
          コンテキストが自動生成されます。ガイダンスは <code className="rounded bg-slate-100 px-1">custom/ivr-welcome</code>{' '}
          のようなパスで指定 (sounds/custom/ にある wav を参照)。
        </p>
      </header>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">新規 / 更新</h3>
        <IvrForm action={upsertIvrAction} submitLabel="保存" />
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">登録済み ({menus.length})</h3>
        {menus.length === 0 ? (
          <p className="text-sm text-slate-500">まだ IVR がありません。</p>
        ) : (
          <ul className="divide-y divide-slate-200">
            {menus.map((m) => (
              <li key={m.id} className="py-3">
                <IvrForm action={upsertIvrAction} initial={m} submitLabel="保存" deleteAction={deleteIvrAction} />
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
  initial?: IvrMenu;
  submitLabel: string;
  deleteAction?: (formData: FormData) => Promise<void>;
}

function IvrForm({ action, initial, submitLabel, deleteAction }: Props) {
  const isEdit = !!initial;
  // options を改行区切り "digit|action|target|label" 形式で編集
  const optsText = initial?.options
    .map((o) => `${o.digit}|${o.action}|${o.target ?? ''}|${o.label ?? ''}`)
    .join('\n');

  return (
    <form action={action} className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[140px_1fr_120px_120px]">
        <label className="text-xs text-slate-600">
          番号
          <input
            name="number"
            required
            pattern="[0-9]{2,6}"
            defaultValue={initial?.number ?? ''}
            readOnly={isEdit}
            placeholder="例: 9000"
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1 font-mono text-sm read-only:bg-slate-100"
          />
        </label>
        <label className="text-xs text-slate-600">
          表示名
          <input
            name="name"
            defaultValue={initial?.name ?? ''}
            placeholder="例: メインメニュー"
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
          />
        </label>
        <label className="text-xs text-slate-600">
          リトライ回数
          <input
            name="maxRetries"
            type="number"
            min={1}
            max={10}
            defaultValue={initial?.maxRetries ?? 3}
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1 font-mono text-sm"
          />
        </label>
        <label className="text-xs text-slate-600">
          入力待ち (秒)
          <input
            name="waitSeconds"
            type="number"
            min={1}
            max={60}
            defaultValue={initial?.waitSeconds ?? 6}
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1 font-mono text-sm"
          />
        </label>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        {(['welcomePrompt', 'menuPrompt', 'invalidPrompt', 'goodbyePrompt'] as const).map((k) => (
          <label key={k} className="text-xs text-slate-600">
            {k}
            <input
              name={k}
              defaultValue={(initial?.[k] ?? '') as string}
              placeholder="例: custom/ivr-menu"
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1 font-mono text-sm"
            />
          </label>
        ))}
      </div>
      <label className="block text-xs text-slate-600">
        分岐 (1 行 1 項目、形式: <code>digit|action|target|label</code>)<br />
        action は <code>goto_extension</code> / <code>goto_ringgroup</code> / <code>hangup</code>
        <textarea
          name="options"
          rows={6}
          defaultValue={optsText ?? '1|goto_extension|9001|当日予約\n2|goto_extension|9002|折返し依頼\n0|goto_extension|1001|スタッフ'}
          className="mt-1 w-full rounded border border-slate-300 px-2 py-1 font-mono text-xs"
        />
      </label>
      <div className="flex items-center gap-2">
        <button
          type="submit"
          className="rounded-md border border-slate-300 bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
        >
          {submitLabel}
        </button>
        {isEdit && deleteAction && (
          <ConfirmButton
            confirmText={`IVR ${initial.number} を削除しますか？`}
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
