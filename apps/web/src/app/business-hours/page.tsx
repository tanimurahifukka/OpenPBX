import {
  listHolidays,
  listTimeRules,
  asteriskToDays,
  type TimeRule,
} from '@/lib/businessHours';
import {
  upsertHolidayAction,
  deleteHolidayAction,
  createTimeRuleAction,
  updateTimeRuleAction,
  deleteTimeRuleAction,
} from '@/app/actions';
import { ConfirmButton } from '@/components/ConfirmButton';
import { DayPresets } from './DayPresets';
import { requireAccount } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const DAY_LABELS: Array<[string, string]> = [
  ['mon', '月'],
  ['tue', '火'],
  ['wed', '水'],
  ['thu', '木'],
  ['fri', '金'],
  ['sat', '土'],
  ['sun', '日'],
];

const PRESETS: Array<{ label: string; days: string[] }> = [
  { label: '平日', days: ['mon', 'tue', 'wed', 'thu', 'fri'] },
  { label: '土日', days: ['sat', 'sun'] },
  { label: '毎日', days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] },
];

export default async function BusinessHoursPage() {
  await requireAccount();
  const holidays = listHolidays();
  const rules = listTimeRules();
  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-lg font-semibold">営業時間 / 祝日</h2>
        <p className="text-xs text-slate-500">
          営業中の曜日と時間帯を登録します。IVR の営業時間外ルートで判定に使います。
          午前・午後を分けたい場合は複数行で登録できます。
        </p>
      </header>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">時間帯ルール ({rules.length})</h3>
        <div className="mb-3 rounded-lg border border-blue-100 bg-blue-50/50 p-3">
          <p className="mb-2 text-xs font-semibold text-slate-700">新規追加</p>
          <TimeRuleForm action={createTimeRuleAction} submitLabel="追加" />
        </div>
        {rules.length === 0 ? (
          <p className="text-sm text-slate-500">時間帯ルールがまだありません。</p>
        ) : (
          <ul className="divide-y divide-slate-200">
            {rules.map((r) => (
              <li key={r.id} className="py-3">
                <TimeRuleForm
                  action={updateTimeRuleAction}
                  initial={r}
                  submitLabel="保存"
                  deleteAction={deleteTimeRuleAction}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">祝日 ({holidays.length})</h3>
        <form action={upsertHolidayAction} className="mb-3 grid grid-cols-[150px_1fr_auto] gap-2">
          <input
            name="date"
            type="date"
            required
            className="rounded border border-slate-300 px-2 py-1 text-sm"
            aria-label="日付"
          />
          <input
            name="name"
            required
            placeholder="名前 (例: 元日 / 夏季休業)"
            className="rounded border border-slate-300 px-2 py-1 text-sm"
            aria-label="名前"
          />
          <button type="submit" className="rounded bg-primary px-3 py-1 text-xs font-semibold text-white">
            追加 / 更新
          </button>
        </form>
        {holidays.length === 0 ? (
          <p className="text-sm text-slate-500">祝日がまだ登録されていません。</p>
        ) : (
          <ul className="divide-y divide-slate-200">
            {holidays.map((h) => (
              <li key={h.date} className="flex items-center gap-3 py-2 text-sm">
                <span className="w-28 font-mono">{h.date}</span>
                <span className="flex-1">{h.name}</span>
                <form action={deleteHolidayAction}>
                  <input type="hidden" name="date" value={h.date} />
                  <ConfirmButton
                    confirmText={`祝日 ${h.date} (${h.name}) を削除しますか？`}
                    className="rounded border border-danger bg-white px-2 py-0.5 text-xs text-danger hover:bg-danger-light"
                  >
                    削除
                  </ConfirmButton>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

interface RuleFormProps {
  action: (formData: FormData) => Promise<void>;
  initial?: TimeRule;
  submitLabel: string;
  deleteAction?: (formData: FormData) => Promise<void>;
}

function TimeRuleForm({ action, initial, submitLabel, deleteAction }: RuleFormProps) {
  const isEdit = !!initial;
  const picked = new Set(asteriskToDays(initial?.days ?? '*'));
  return (
    <form action={action} className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_100px_100px_1fr_auto]">
        <label className="text-xs text-slate-600">
          ルール名
          <input
            name="name"
            required
            defaultValue={initial?.name ?? ''}
            placeholder="例: 平日昼"
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
          />
        </label>
        <label className="text-xs text-slate-600">
          開始時刻
          <input
            name="startTime"
            type="time"
            required
            defaultValue={initial?.startTime ?? '09:00'}
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1 font-mono text-sm"
          />
        </label>
        <label className="text-xs text-slate-600">
          終了時刻
          <input
            name="endTime"
            type="time"
            required
            defaultValue={initial?.endTime ?? '18:00'}
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1 font-mono text-sm"
          />
        </label>
        <label className="text-xs text-slate-600">
          メモ
          <input
            name="note"
            defaultValue={initial?.note ?? ''}
            placeholder="任意"
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
          />
        </label>
        <div className="flex items-end gap-2">
          {isEdit && <input type="hidden" name="id" value={initial!.id} />}
          <button
            type="submit"
            className="rounded-md border border-slate-300 bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-500"
          >
            {submitLabel}
          </button>
          {isEdit && deleteAction && (
            <ConfirmButton
              confirmText={`「${initial!.name}」を削除しますか？`}
              formAction={deleteAction}
              className="rounded-md border border-danger bg-white px-3 py-1.5 text-xs font-semibold text-danger hover:bg-danger-light"
            >
              削除
            </ConfirmButton>
          )}
        </div>
      </div>
      <fieldset className="rounded border border-slate-200 p-2">
        <legend className="px-1 text-xs text-slate-600">曜日</legend>
        <div className="flex flex-wrap items-center gap-3">
          {DAY_LABELS.map(([code, label]) => {
            const isWeekend = code === 'sat' || code === 'sun';
            return (
              <label
                key={code}
                className={`flex items-center gap-1 text-sm ${isWeekend && code === 'sat' ? 'text-primary-600' : ''} ${code === 'sun' ? 'text-danger' : ''}`}
              >
                <input
                  type="checkbox"
                  name="day"
                  value={code}
                  defaultChecked={picked.has(code as 'mon')}
                  className="h-4 w-4"
                />
                {label}
              </label>
            );
          })}
          <DayPresets presets={PRESETS} />
        </div>
      </fieldset>
    </form>
  );
}

