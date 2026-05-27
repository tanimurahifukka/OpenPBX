import { requireAccount } from '@/lib/auth';
import { listBoxes, listMessages, countByStatus, type VmMessageStatus } from '@/lib/voicemail';
import { formatJst } from '@/lib/datetime';
import {
  upsertVoicemailBoxAction,
  deleteVoicemailBoxAction,
  updateVoicemailMessageAction,
  deleteVoicemailMessageAction,
} from '@/app/actions';
import { ConfirmButton } from '@/components/ConfirmButton';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const STATUS_LABEL: Record<VmMessageStatus, string> = {
  new: '未確認',
  read: '確認済み',
  callback_done: '折返し済み',
};
const STATUS_BADGE: Record<VmMessageStatus, string> = {
  new: 'bg-red-50 text-red-700 ring-red-200',
  read: 'bg-yellow-50 text-yellow-700 ring-yellow-200',
  callback_done: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
};

export default async function VoicemailPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; err?: string; status?: string }>;
}) {
  await requireAccount();
  const params = await searchParams;
  const boxes = listBoxes();
  const filterStatus = params.status as VmMessageStatus | undefined;
  const messages = listMessages(filterStatus ? { status: filterStatus } : {});
  const counts = countByStatus();
  const total = counts.new + counts.read + counts.callback_done;

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-lg font-semibold">留守番電話</h2>
        <p className="text-xs text-slate-500">留守電ボックスの管理とメッセージ一覧</p>
      </header>

      {params.ok && (
        <div className="rounded-md bg-emerald-50 px-4 py-2 text-sm text-emerald-800">{params.ok}</div>
      )}
      {params.err && (
        <div className="rounded-md bg-red-50 px-4 py-2 text-sm text-red-800">{params.err}</div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="全件" value={total} href="/voicemail" active={!filterStatus} />
        <StatCard label="未確認" value={counts.new} href="/voicemail?status=new" active={filterStatus === 'new'} accent="text-red-600" />
        <StatCard label="確認済み" value={counts.read} href="/voicemail?status=read" active={filterStatus === 'read'} accent="text-yellow-600" />
        <StatCard label="折返し済み" value={counts.callback_done} href="/voicemail?status=callback_done" active={filterStatus === 'callback_done'} accent="text-emerald-600" />
      </div>

      {/* Messages */}
      <section>
        <h3 className="mb-2 text-sm font-semibold text-slate-700">
          メッセージ {filterStatus && `— ${STATUS_LABEL[filterStatus]}`}
        </h3>
        {messages.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
            {filterStatus ? `${STATUS_LABEL[filterStatus]}のメッセージはありません` : '留守電がまだありません'}
          </p>
        ) : (
          <ul className="divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white">
            {messages.map((m) => (
              <li key={m.id} className="p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ${STATUS_BADGE[m.status]}`}>
                    {STATUS_LABEL[m.status]}
                  </span>
                  <span className="font-mono text-sm font-semibold">{m.callerId}</span>
                  {m.callerName && <span className="text-xs text-slate-500">{m.callerName}</span>}
                  <span className="text-[11px] text-slate-400">→ {m.boxName || m.boxNumber}</span>
                  {m.durationSec != null && (
                    <span className="text-xs text-slate-500">{m.durationSec}秒</span>
                  )}
                  <time className="ml-auto text-xs text-slate-500" dateTime={m.createdAt}>
                    {formatJst(m.createdAt)}
                  </time>
                </div>

                {m.recordingFile && (
                  <audio
                    controls
                    preload="none"
                    src={`/api/recordings/${encodeURIComponent(m.recordingFile.split('/').pop() ?? m.recordingFile)}`}
                    className="mt-2 w-full"
                    aria-label={`留守電 ${m.callerId}`}
                  />
                )}

                <div className="mt-2 flex flex-wrap gap-2">
                  {m.status === 'new' && (
                    <form action={updateVoicemailMessageAction}>
                      <input type="hidden" name="id" value={m.id} />
                      <input type="hidden" name="status" value="read" />
                      <button type="submit" className="rounded-md border border-yellow-200 bg-yellow-50 px-3 py-1 text-xs font-semibold text-yellow-700 hover:bg-yellow-100">
                        確認済みにする
                      </button>
                    </form>
                  )}
                  {(m.status === 'new' || m.status === 'read') && (
                    <form action={updateVoicemailMessageAction}>
                      <input type="hidden" name="id" value={m.id} />
                      <input type="hidden" name="status" value="callback_done" />
                      <button type="submit" className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-100">
                        折返し済みにする
                      </button>
                    </form>
                  )}
                  <form action={deleteVoicemailMessageAction}>
                    <input type="hidden" name="id" value={m.id} />
                    <ConfirmButton
                      confirmText="この留守電を削除しますか？"
                      className="rounded-md border border-red-200 bg-white px-3 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
                    >
                      削除
                    </ConfirmButton>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Box management */}
      <section>
        <h3 className="mb-2 text-sm font-semibold text-slate-700">留守電ボックス管理</h3>
        <div className="space-y-3">
          {boxes.map((box) => (
            <div key={box.id} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3">
              <div className="min-w-0 flex-1">
                <p className="font-mono text-sm font-bold">{box.number}</p>
                <p className="truncate text-xs text-slate-500">{box.name || '(名前なし)'}</p>
                {box.prompt && <p className="text-[11px] text-slate-400">音声: {box.prompt}</p>}
              </div>
              <form action={deleteVoicemailBoxAction}>
                <input type="hidden" name="number" value={box.number} />
                <ConfirmButton
                  confirmText={`留守電 ${box.number} を削除しますか？`}
                  className="rounded-md border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
                >
                  削除
                </ConfirmButton>
              </form>
            </div>
          ))}

          <details className="rounded-lg border border-slate-200 bg-white p-4">
            <summary className="cursor-pointer text-xs font-bold text-slate-700">
              + 留守電ボックスを追加
            </summary>
            <form action={upsertVoicemailBoxAction} className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="text-[11px] font-semibold text-slate-500">
                番号
                <input
                  name="number"
                  required
                  pattern="[0-9]{2,6}"
                  placeholder="9100"
                  className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 font-mono text-sm shadow-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                />
              </label>
              <label className="text-[11px] font-semibold text-slate-500">
                名前
                <input
                  name="name"
                  placeholder="代表留守電"
                  className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                />
              </label>
              <label className="text-[11px] font-semibold text-slate-500">
                音声ガイダンス
                <input
                  name="prompt"
                  placeholder="custom/vm-intro"
                  className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 font-mono text-sm shadow-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                />
              </label>
              <div className="sm:col-span-3">
                <button
                  type="submit"
                  className="rounded-md bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-500"
                >
                  追加
                </button>
              </div>
            </form>
          </details>
        </div>
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  href,
  active,
  accent,
}: {
  label: string;
  value: number;
  href: string;
  active: boolean;
  accent?: string;
}) {
  return (
    <a
      href={href}
      className={`rounded-lg border p-3 text-center transition ${active ? 'border-emerald-300 bg-emerald-50 shadow-sm' : 'border-slate-200 bg-white hover:border-emerald-200 hover:bg-emerald-50/50'}`}
    >
      <p className={`font-mono text-2xl font-bold ${accent ?? 'text-slate-900'}`}>{value}</p>
      <p className="text-[11px] font-semibold text-slate-500">{label}</p>
    </a>
  );
}
