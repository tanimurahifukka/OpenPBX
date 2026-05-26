import { listTrunks, type SipTrunk } from '@/lib/trunks';
import { requireRole } from '@/lib/auth';
import { upsertTrunkAction, deleteTrunkAction } from '@/app/actions';
import { ConfirmButton } from '@/components/ConfirmButton';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function TrunksPage() {
  await requireRole('admin');
  const trunks = listTrunks();
  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-lg font-semibold">SIP trunk (外線)</h2>
        <p className="text-xs text-slate-500">
          外線プロバイダ (Twilio Elastic SIP, 楽天コミュニケーションズ, NTT 法人 etc.) との接続を管理します。
          <span className="font-mono">outbound_prefix</span> を設定すると、その prefix で始まる発信を trunk へ。
          <span className="font-mono">did_inbound</span> を設定すると、その番号宛の着信を internal context の同番号にルーティング。
        </p>
      </header>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">新規 / 更新</h3>
        <TrunkForm action={upsertTrunkAction} submitLabel="保存" />
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">登録済み ({trunks.length})</h3>
        {trunks.length === 0 ? (
          <p className="text-sm text-slate-500">まだ trunk がありません。</p>
        ) : (
          <ul className="divide-y divide-slate-200">
            {trunks.map((t) => (
              <li key={t.id} className="py-3">
                <TrunkForm action={upsertTrunkAction} initial={t} submitLabel="保存" deleteAction={deleteTrunkAction} />
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
  initial?: SipTrunk;
  submitLabel: string;
  deleteAction?: (formData: FormData) => Promise<void>;
}

function TrunkForm({ action, initial, submitLabel, deleteAction }: Props) {
  const isEdit = !!initial;
  return (
    <form action={action} className="grid grid-cols-1 gap-3 sm:grid-cols-[180px_1fr_100px_1fr_1fr_auto]">
      <input name="name"
        required pattern="[A-Za-z0-9_-]{1,32}"
        defaultValue={initial?.name ?? ''} readOnly={isEdit} placeholder="trunk name"
        className="rounded border border-slate-300 px-2 py-1 font-mono text-sm read-only:bg-slate-100" />
      <input name="host" required defaultValue={initial?.host ?? ''} placeholder="host (e.g. sip.example.com)"
        className="rounded border border-slate-300 px-2 py-1 font-mono text-sm" />
      <input name="port" type="number" min={1} max={65535} defaultValue={initial?.port ?? 5060}
        className="rounded border border-slate-300 px-2 py-1 font-mono text-sm" />
      <input name="username" defaultValue={initial?.username ?? ''} placeholder="username"
        className="rounded border border-slate-300 px-2 py-1 font-mono text-sm" />
      <input name="secret" type="password" defaultValue={initial?.secret ?? ''} placeholder="secret"
        className="rounded border border-slate-300 px-2 py-1 font-mono text-sm" />
      <div className="flex items-center gap-2">
        <button type="submit" className="rounded bg-brand px-3 py-1.5 text-xs font-semibold text-white">
          {submitLabel}
        </button>
        {isEdit && deleteAction && (
          <ConfirmButton
            confirmText={`trunk ${initial.name} を削除しますか？`}
            formAction={deleteAction}
            className="rounded border border-melon-300 bg-white px-2 py-1 text-xs text-melon-500"
          >
            削除
          </ConfirmButton>
        )}
      </div>
      <label className="text-xs text-slate-600">
        from_user
        <input name="fromUser" defaultValue={initial?.fromUser ?? ''}
          className="mt-1 w-full rounded border border-slate-300 px-2 py-1 font-mono text-sm" />
      </label>
      <label className="text-xs text-slate-600">
        from_domain
        <input name="fromDomain" defaultValue={initial?.fromDomain ?? ''}
          className="mt-1 w-full rounded border border-slate-300 px-2 py-1 font-mono text-sm" />
      </label>
      <label className="text-xs text-slate-600">
        did_inbound
        <input name="didInbound" defaultValue={initial?.didInbound ?? ''} placeholder="例: 0312345678"
          className="mt-1 w-full rounded border border-slate-300 px-2 py-1 font-mono text-sm" />
      </label>
      <label className="text-xs text-slate-600">
        outbound_prefix
        <input name="outboundPrefix" defaultValue={initial?.outboundPrefix ?? ''} placeholder="例: 0"
          className="mt-1 w-full rounded border border-slate-300 px-2 py-1 font-mono text-sm" />
      </label>
      <label className="text-xs text-slate-600 sm:col-span-2">
        メモ
        <input name="note" defaultValue={initial?.note ?? ''}
          className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm" />
      </label>
      <label className="flex items-center gap-2 text-xs text-slate-600">
        <input type="checkbox" name="registration" defaultChecked={initial?.registration ?? true} className="h-4 w-4" />
        register する
      </label>
    </form>
  );
}
