import { requireAccount } from '@/lib/auth';
import { listPatients, listRecentRecords } from '@/lib/patients';
import { upsertPatientAction } from '@/app/actions';
import { formatJst, toIsoUtc } from '@/lib/datetime';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function PatientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireAccount();
  const sp = await searchParams;
  const patients = listPatients(sp.q);
  const recent = listRecentRecords(14, 30);
  return (
    <div className="space-y-6">
      <header className="flex items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">患者 / 記録</h2>
        <a
          href="/quick-intake"
          className="rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
        >
          + クイック起票
        </a>
      </header>

      <form method="get" className="flex gap-2">
        <input
          name="q"
          defaultValue={sp.q ?? ''}
          placeholder="患者番号 (5桁) / 名前 / ふりがな で検索"
          className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm"
        />
        <button type="submit" className="rounded bg-slate-700 px-3 py-1 text-xs font-semibold text-white">
          検索
        </button>
      </form>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">新規 / 更新</h3>
        <form action={upsertPatientAction} className="grid grid-cols-1 gap-2 sm:grid-cols-[120px_1fr_1fr_160px_1fr_auto]">
          <input
            name="id"
            required
            pattern="\d{5}"
            maxLength={5}
            placeholder="患者番号 5桁"
            className="rounded border border-slate-300 px-2 py-1 font-mono text-sm"
          />
          <input
            name="name"
            placeholder="氏名"
            className="rounded border border-slate-300 px-2 py-1 text-sm"
          />
          <input
            name="kana"
            placeholder="ふりがな"
            className="rounded border border-slate-300 px-2 py-1 text-sm"
          />
          <input
            name="birthDate"
            type="date"
            className="rounded border border-slate-300 px-2 py-1 text-sm"
          />
          <input
            name="phone"
            placeholder="連絡先"
            className="rounded border border-slate-300 px-2 py-1 font-mono text-sm"
          />
          <button type="submit" className="rounded bg-blue-600 px-3 py-1 text-xs font-semibold text-white">
            保存
          </button>
          <input
            name="note"
            placeholder="備考"
            className="rounded border border-slate-300 px-2 py-1 text-sm sm:col-span-6"
          />
        </form>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">最近の記録 (14 日)</h3>
        {recent.length === 0 ? (
          <p className="text-sm text-slate-500">記録がまだありません。</p>
        ) : (
          <ul className="divide-y divide-slate-200 text-sm">
            {recent.map((r) => (
              <li key={r.id} className="flex items-baseline gap-3 py-2">
                <a href={`/patients/${r.patientId}`} className="w-16 font-mono text-blue-700 hover:underline">
                  {r.patientId}
                </a>
                <span className="rounded-full border border-slate-300 bg-slate-50 px-2 py-0.5 text-[10px]">
                  {r.kind}
                </span>
                <span className="font-mono text-xs text-slate-500">内線 {r.extension ?? '-'}</span>
                <span className="flex-1 truncate text-xs text-slate-600">
                  {(r.summary ?? r.note ?? '').slice(0, 50) || '(記載なし)'}
                </span>
                <time className="text-xs text-slate-500" dateTime={toIsoUtc(r.recordedAt) ?? ''}>
                  {formatJst(r.recordedAt)}
                </time>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">患者一覧 ({patients.length})</h3>
        {patients.length === 0 ? (
          <p className="text-sm text-slate-500">該当する患者がいません。</p>
        ) : (
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {patients.map((p) => (
              <li key={p.id}>
                <a
                  href={`/patients/${p.id}`}
                  className="flex items-baseline gap-3 rounded border border-slate-200 bg-slate-50 px-3 py-2 hover:bg-blue-50"
                >
                  <span className="font-mono text-lg font-semibold text-blue-700">{p.id}</span>
                  <span className="flex-1">
                    <span className="block text-sm">{p.name ?? '(未登録)'}</span>
                    <span className="block text-[10px] text-slate-500">
                      {p.kana ?? ''} {p.birthDate ?? ''}
                    </span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
