import { listPickupGroups, type PickupGroup } from '@/lib/pickupGroups';
import { listExtensions } from '@/lib/extensions';
import {
  createPickupGroupAction,
  updatePickupGroupAction,
  deletePickupGroupAction,
} from '@/app/actions';
import { ConfirmButton } from '@/components/ConfirmButton';
import { requireAccount } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function PickupGroupsPage() {
  await requireAccount();
  const groups = listPickupGroups();
  const exts = listExtensions().map((e) => e.number);
  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-lg font-semibold">ピックアップグループ</h2>
        <p className="text-xs text-slate-500">
          同じグループに属する内線同士で <span className="font-mono">*8</span> をダイヤルすると
          他端末の呼出を代理応答できます。グループに追加された内線は次回登録時から有効。
        </p>
        <p className="mt-1 text-xs text-slate-500">
          利用可能な内線: <span className="font-mono">{exts.join(', ') || 'なし'}</span>
        </p>
      </header>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">新規追加</h3>
        <PickupForm action={createPickupGroupAction} submitLabel="追加" />
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">登録済み ({groups.length})</h3>
        {groups.length === 0 ? (
          <p className="text-sm text-slate-500">まだピックアップグループがありません。</p>
        ) : (
          <ul className="divide-y divide-slate-200">
            {groups.map((g) => (
              <li key={g.id} className="py-3">
                <PickupForm
                  action={updatePickupGroupAction}
                  initial={g}
                  submitLabel="保存"
                  deleteAction={deletePickupGroupAction}
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
  initial?: PickupGroup;
  submitLabel: string;
  deleteAction?: (formData: FormData) => Promise<void>;
}

function PickupForm({ action, initial, submitLabel, deleteAction }: Props) {
  const isEdit = !!initial;
  return (
    <form action={action} className="grid grid-cols-1 gap-3 sm:grid-cols-[200px_1fr_auto]">
      <label className="text-xs text-slate-600">
        グループ名
        <input
          name="name"
          required
          defaultValue={initial?.name ?? ''}
          readOnly={isEdit}
          pattern="[A-Za-z0-9_-]{1,32}"
          placeholder="例: reception"
          className="mt-1 w-full rounded border border-slate-300 px-2 py-1 font-mono text-sm read-only:bg-slate-100"
        />
      </label>
      <label className="text-xs text-slate-600">
        メンバー内線 (空白 / カンマ区切り)
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
          className="rounded-md border border-slate-300 bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-500"
        >
          {submitLabel}
        </button>
        {isEdit && deleteAction && (
          <ConfirmButton
            confirmText={`ピックアップグループ ${initial.name} を削除しますか？`}
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
