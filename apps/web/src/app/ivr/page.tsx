import { listIvrMenus } from '@/lib/ivr';
import { upsertIvrAction, deleteIvrAction } from '@/app/actions';
import { IvrEditor, type GuidanceChoice } from './IvrEditor';
import { requireAccount } from '@/lib/auth';
import { listGuidances } from '@/lib/guidances';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function IvrPage() {
  await requireAccount();
  const menus = listIvrMenus();
  const guidances: GuidanceChoice[] = listGuidances().map((g) => ({
    path: g.name,
    // 任意の text フィールドを優先的にラベルにし、無ければ name (Asterisk path) を見せる。
    label: g.text?.trim() ? `${g.name} — ${g.text.slice(0, 40)}` : g.name,
  }));
  const totalBranches = menus.reduce((sum, menu) => sum + menu.options.length, 0);
  const callerIdRoutes = menus.reduce((sum, menu) => sum + menu.callerIdRoutes.length, 0);
  const afterHoursMenus = menus.filter((menu) => menu.afterHoursAction).length;

  return (
    <div className="space-y-5 pb-10">
      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-2xl text-slate-700">
                ←
              </span>
              <div className="min-w-0">
                <p className="text-xs font-bold text-emerald-700">IVR / 自動音声応答</p>
                <h2 className="truncate text-2xl font-bold tracking-tight text-slate-950">
                  ルール設定
                </h2>
              </div>
            </div>

            <div className="flex w-full items-center gap-2 lg:w-[340px]">
              <input
                aria-label="発信テスト番号"
                value="09012345678"
                readOnly
                className="h-10 min-w-0 flex-1 rounded-md border border-slate-200 bg-slate-50 px-3 font-mono text-sm text-slate-500"
              />
              <button
                type="button"
                className="flex h-10 w-12 items-center justify-center rounded-md bg-emerald-600 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700"
                aria-label="発信テスト"
              >
                ☎
              </button>
            </div>
          </div>

          <nav className="mt-5 flex gap-2 overflow-x-auto border-b border-slate-200 pb-0" aria-label="IVRルール">
            {menus.length === 0 ? (
              <span className="border-b-2 border-emerald-600 px-2 pb-3 text-xs font-bold text-emerald-700">
                ルール①
              </span>
            ) : (
              menus.map((menu, index) => (
                <a
                  key={menu.id}
                  href={`#ivr-${menu.number}`}
                  className={`shrink-0 border-b-2 px-2 pb-3 text-xs font-bold transition ${
                    index === 0
                      ? 'border-emerald-600 text-emerald-700'
                      : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
                  }`}
                >
                  ルール{toCircled(index + 1)}
                </a>
              ))
            )}
            <a
              href="#ivr-new"
              className="shrink-0 border-b-2 border-transparent px-2 pb-3 text-xs font-bold text-slate-500 transition hover:border-slate-300 hover:text-slate-700"
            >
              新規作成
            </a>
          </nav>
        </div>

        <div className="bg-[#f4f6f3] px-4 py-5 sm:px-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatusCard label="登録ルール" value={menus.length} unit="件" />
            <StatusCard label="分岐" value={totalBranches} unit="個" />
            <StatusCard label="CallerID" value={callerIdRoutes} unit="条件" />
            <StatusCard label="営業時間外" value={afterHoursMenus} unit="件" />
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold text-emerald-700">登録済みルール</p>
            <h3 className="text-lg font-bold text-slate-950">着信時のガイダンスと分岐</h3>
          </div>
          <p className="text-xs text-slate-500">
            保存すると Asterisk の IVR ダイヤルプランへ反映されます。
          </p>
        </div>

        {menus.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-500">
            まだ IVR がありません。下の「新規ルール」から最初のルールを作成してください。
          </div>
        ) : (
          <ul className="space-y-4">
            {menus.map((menu) => (
              <li key={menu.id} id={`ivr-${menu.number}`} className="scroll-mt-6">
                <IvrEditor
                  initial={menu}
                  upsertAction={upsertIvrAction}
                  deleteAction={deleteIvrAction}
                  guidances={guidances}
                  allMenus={menus}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section id="ivr-new" className="scroll-mt-6 space-y-3">
        <div>
          <p className="text-xs font-bold text-emerald-700">新規ルール</p>
          <h3 className="text-lg font-bold text-slate-950">新しいIVRを追加</h3>
        </div>
        <IvrEditor upsertAction={upsertIvrAction} guidances={guidances} />
      </section>
    </div>
  );
}

function StatusCard({ label, value, unit }: { label: string; value: number; unit: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <p className="text-[11px] font-bold text-slate-500">{label}</p>
      <p className="mt-1 flex items-end gap-1">
        <span className="font-mono text-2xl font-bold text-slate-950">{value}</span>
        <span className="pb-1 text-xs font-semibold text-slate-500">{unit}</span>
      </p>
    </div>
  );
}

function toCircled(value: number): string {
  const chars = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨'];
  return chars[value - 1] ?? ` ${value}`;
}
