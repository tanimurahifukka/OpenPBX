import { requireAccount } from '@/lib/auth';
import { getPatient } from '@/lib/patients';
import { TriageFlow } from './triage-flow';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function TriagePage({
  searchParams,
}: {
  searchParams: Promise<{ patient?: string; ext?: string }>;
}) {
  await requireAccount();
  const sp = await searchParams;
  const patientId = sp.patient && /^\d{5}$/.test(sp.patient) ? sp.patient : undefined;
  const extension = sp.ext && /^\d{2,6}$/.test(sp.ext) ? sp.ext : undefined;
  const patient = patientId ? getPatient(patientId) : null;
  return (
    <div className="space-y-4">
      {patient && (
        <div className="flex items-baseline gap-3 rounded-lg border border-blue-200 bg-blue-50 p-3">
          <span className="font-mono text-2xl font-bold text-blue-800">{patient.id}</span>
          <span className="flex-1">
            <span className="block text-sm font-semibold text-blue-900">{patient.name ?? '(未登録)'}</span>
            <span className="text-xs text-blue-700">{patient.kana ?? ''} {patient.birthDate ?? ''}</span>
          </span>
          {extension && (
            <span className="rounded-full border border-blue-300 bg-white px-2 py-0.5 text-xs text-blue-800">
              内線 {extension}
            </span>
          )}
          <a href={`/patients/${patient.id}`} className="text-xs text-blue-700 underline">
            患者ページ
          </a>
        </div>
      )}
      <TriageFlow patientId={patientId} extension={extension} />
    </div>
  );
}
