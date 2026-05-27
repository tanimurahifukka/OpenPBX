import { listRingGroups, type RingGroup } from '@/lib/ringGroups';
import { listExtensions } from '@/lib/extensions';
import {
  createRingGroupAction,
  updateRingGroupAction,
  deleteRingGroupAction,
} from '@/app/actions';
import { ConfirmButton } from '@/components/ConfirmButton';
import { requireAccount } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function RingGroupsPage() {
  await requireAccount();
  const groups = listRingGroups();
  const extensions = listExtensions();
  const extOptions = extensions.map((e) => e.number);
  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-lg font-semibold">着信グループ</h2>
        <p className="text-xs text-slate-500">
          複数の内線を同時または順次呼び出すグループ。6XXX 帯の番号を割り当てて Asterisk dialplan に
          自動反映します。
        </p>
        <p className="mt-1 text-xs text-slate-500">
          利用可能な内線番号: <span className="font-mono">{extOptions.join(', ') || 'なし'}</span>
        </p>
      </header>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">新規追加</h3>
        <RingGroupForm action={createRingGroupAction} submitLabel="追加" />
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">登録済み ({groups.length})</h3>
        {groups.length === 0 ? (
          <p className="text-sm text-slate-500">まだ着信グループがありません。</p>
        ) : (
          <ul className="divide-y divide-slate-200">
            {groups.map((g) => (
              <li key={g.id} className="py-3">
                <RingGroupForm
                  action={updateRingGroupAction}
                  initial={g}
                  submitLabel="保存"
                  deleteAction={deleteRingGroupAction}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

interface FormProps {
  action: (formData: FormData) => Promise<void>;
  initial?: RingGroup;
  submitLabel: string;
  deleteAction?: (formData: FormData) => Promise<void>;
}

function RingGroupForm({ action, initial, submitLabel, deleteAction }: FormProps) {
  const isEdit = !!initial;
  return (
    <form action={action} className="grid grid-cols-1 gap-3 sm:grid-cols-[120px_1fr_120px_100px_1fr_auto]">
      <label className="text-xs text-slate-600">
        グループ番号
        <input
          name="number"
          required
          defaultValue={initial?.number ?? ''}
          readOnly={isEdit}
          inputMode="numeric"
          pattern="[0-9]{2,6}"
          placeholder="例: 6000"
          className="mt-1 w-full rounded border border-slate-300 px-2 py-1 font-mono text-sm read-only:bg-slate-100"
        />
      </label>
      <label className="text-xs text-slate-600">
        表示名
        <input
          name="name"
          defaultValue={initial?.name ?? ''}
          placeholder="例: 受付グループ"
          className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
        />
      </label>
      <label className="text-xs text-slate-600">
        戦略
        <select
          name="strategy"
          defaultValue={initial?.strategy ?? 'ringall'}
          className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
        >
          <option value="ringall">同時 (ringall)</option>
          <option value="linear">順次 (linear)</option>
        </select>
      </label>
      <label className="text-xs text-slate-600">
        呼出秒
        <input
          name="ringSeconds"
          type="number"
          min={5}
          max={180}
          defaultValue={initial?.ringSeconds ?? 30}
          className="mt-1 w-full rounded border border-slate-300 px-2 py-1 font-mono text-sm"
        />
      </label>
      <label className="text-xs text-slate-600">
        メンバー (空白/カンマ区切り)
        <input
          name="members"
          defaultValue={initial?.members.join(',') ?? ''}
          placeholder="例: 1001,1002,1003"
          pattern="[0-9,\s]*"
          title="カンマ区切りの内線番号"
          className="mt-1 w-full rounded border border-slate-300 px-2 py-1 font-mono text-sm"
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
            confirmText={`着信グループ ${initial.number} を削除しますか？`}
            formAction={deleteAction}
            className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50"
          >
            削除
          </ConfirmButton>
        )}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:col-span-6 sm:grid-cols-[200px_1fr]">
        <label className="text-xs text-slate-600">
          応答なし時
          <select
            name="fallbackAction"
            defaultValue={initial?.fallbackAction ?? 'hangup'}
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
          >
            <option value="hangup">切断</option>
            <option value="goto_extension">内線へ転送</option>
            <option value="goto_ivr">IVR へ転送</option>
            <option value="goto_voicemail">留守番電話</option>
          </select>
        </label>
        <label className="text-xs text-slate-600">
          転送先番号（切断以外は必須）
          <input
            name="fallbackTarget"
            defaultValue={initial?.fallbackTarget ?? ''}
            placeholder="例: 9100（切断以外は入力必須）"
            inputMode="numeric"
            pattern="[0-9]{2,6}"
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1 font-mono text-sm"
          />
        </label>
      </div>
    </form>
  );
}
