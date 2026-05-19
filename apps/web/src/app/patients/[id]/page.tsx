import { notFound } from 'next/navigation';
import { requireAccount } from '@/lib/auth';
import { getPatient, listPatientRecords } from '@/lib/patients';
import {
  upsertPatientAction,
  savePatientRecordAction,
  deletePatientRecordAction,
  deletePatientAction,
} from '@/app/actions';
import { ConfirmButton } from '@/components/ConfirmButton';
import { formatJst, toIsoUtc } from '@/lib/datetime';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function PatientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAccount();
  const { id } = await params;
  const p = getPatient(id);
  if (!p) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-slate-600">
          患者番号 <span className="font-mono">{id}</span> はまだ登録されていません。
        </p>
        <a href="/patients" className="text-blue-700 underline">
          ← 一覧に戻る
        </a>
      </div>
    );
  }
  const records = listPatientRecords(id);

  // 日付ごとにグルーピング
  const grouped = new Map<string, typeof records>();
  for (const r of records) {
    const day = (r.recordedAt ?? '').slice(0, 10); // YYYY-MM-DD (UTC)
    if (!grouped.has(day)) grouped.set(day, []);
    grouped.get(day)!.push(r);
  }

  return (
    <div className="space-y-6">
      <header className="flex items-baseline gap-3">
        <span className="font-mono text-3xl font-bold text-blue-700">{p.id}</span>
        <div className="flex-1">
          <h2 className="text-lg font-semibold">{p.name ?? '(未登録)'}</h2>
          <p className="text-xs text-slate-500">
            {p.kana ?? ''} {p.birthDate ? `/ ${p.birthDate}` : ''}{' '}
            {p.phone ? `/ ${p.phone}` : ''}
          </p>
        </div>
        <a
          href={`/triage?patient=${p.id}`}
          className="rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
        >
          🩺 問診を始める
        </a>
      </header>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">基本情報</h3>
        <form action={upsertPatientAction} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_160px_1fr_auto]">
          <input type="hidden" name="id" value={p.id} />
          <input
            name="name"
            defaultValue={p.name ?? ''}
            placeholder="氏名"
            className="rounded border border-slate-300 px-2 py-1 text-sm"
          />
          <input
            name="kana"
            defaultValue={p.kana ?? ''}
            placeholder="ふりがな"
            className="rounded border border-slate-300 px-2 py-1 text-sm"
          />
          <input
            name="birthDate"
            type="date"
            defaultValue={p.birthDate ?? ''}
            className="rounded border border-slate-300 px-2 py-1 text-sm"
          />
          <input
            name="phone"
            defaultValue={p.phone ?? ''}
            placeholder="連絡先"
            className="rounded border border-slate-300 px-2 py-1 font-mono text-sm"
          />
          <button type="submit" className="rounded bg-blue-600 px-3 py-1 text-xs font-semibold text-white">
            保存
          </button>
          <input
            name="note"
            defaultValue={p.note ?? ''}
            placeholder="備考"
            className="rounded border border-slate-300 px-2 py-1 text-sm sm:col-span-5"
          />
        </form>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">新しい記録を追加</h3>
        <form action={savePatientRecordAction} className="space-y-2">
          <input type="hidden" name="patientId" value={p.id} />
          <div className="grid grid-cols-[120px_120px_1fr] gap-2">
            <input
              name="extension"
              placeholder="自分の内線"
              pattern="[0-9]{2,6}"
              className="rounded border border-slate-300 px-2 py-1 font-mono text-sm"
            />
            <select
              name="kind"
              defaultValue="note"
              className="rounded border border-slate-300 px-2 py-1 text-sm"
            >
              <option value="note">メモ</option>
              <option value="call">通話</option>
              <option value="triage">問診</option>
            </select>
            <input
              name="note"
              placeholder="ひとことメモ"
              className="rounded border border-slate-300 px-2 py-1 text-sm"
            />
          </div>
          <textarea
            name="summary"
            rows={4}
            placeholder="長文サマリ (任意)"
            className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
          />
          <button type="submit" className="rounded bg-blue-600 px-3 py-1 text-xs font-semibold text-white">
            追加
          </button>
        </form>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-700">記録 ({records.length})</h3>
        {records.length === 0 && <p className="text-sm text-slate-500">まだ記録がありません。</p>}
        {Array.from(grouped.entries()).map(([day, rs]) => (
          <div key={day} className="rounded-lg border border-slate-200 bg-white">
            <header className="border-b border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600">
              {day}{' '}
              <span className="ml-2 text-[10px] font-normal text-slate-500">({rs.length} 件)</span>
            </header>
            <ul className="divide-y divide-slate-100">
              {rs.map((r) => (
                <li key={r.id} className="px-3 py-2 text-sm">
                  <div className="flex items-baseline gap-2 text-xs text-slate-500">
                    <span className="rounded-full border border-slate-300 bg-white px-2 py-0.5">
                      {r.kind}
                    </span>
                    <span className="font-mono">内線 {r.extension ?? '-'}</span>
                    <time className="ml-auto" dateTime={toIsoUtc(r.recordedAt) ?? ''}>
                      {formatJst(r.recordedAt)}
                    </time>
                    <form action={deletePatientRecordAction}>
                      <input type="hidden" name="patientId" value={p.id} />
                      <input type="hidden" name="id" value={r.id} />
                      <ConfirmButton
                        confirmText="この記録を削除しますか？"
                        className="rounded border border-red-300 bg-white px-1.5 py-0 text-[10px] text-red-700 hover:bg-red-50"
                      >
                        削除
                      </ConfirmButton>
                    </form>
                  </div>
                  {r.note && <p className="mt-1 whitespace-pre-wrap text-slate-700">{r.note}</p>}
                  {r.summary && (
                    <details className="mt-1">
                      <summary className="cursor-pointer text-xs text-blue-700">サマリ</summary>
                      <pre className="mt-1 whitespace-pre-wrap rounded bg-slate-50 p-2 font-mono text-[11px]">
{r.summary}
                      </pre>
                    </details>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <section className="text-right">
        <form action={deletePatientAction}>
          <input type="hidden" name="id" value={p.id} />
          <ConfirmButton
            confirmText={`患者 ${p.id} (${p.name ?? '無名'}) を全記録ごと削除しますか？`}
            className="rounded border border-red-300 bg-white px-3 py-1 text-xs text-red-700 hover:bg-red-50"
          >
            患者ごと削除
          </ConfirmButton>
        </form>
      </section>
    </div>
  );
}
