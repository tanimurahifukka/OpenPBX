'use client';

import { useId, useMemo, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  serializeCallerIdRoutes,
  serializeIvrOptions,
  type AfterHoursAction,
  type CallerIdRoute,
  type CallerIdRouteAction,
  type IvrAction,
  type IvrMenu,
  type IvrOption,
} from '@/lib/ivr-format';
import { ConfirmButton } from '@/components/ConfirmButton';
import { IvrCanvas } from './IvrCanvas';

export interface GuidanceChoice {
  /** Asterisk が参照する name (例: "custom/ivr-welcome")。これが prompt path として保存される。 */
  path: string;
  /** UI に出す表示名 (なければ path)。 */
  label: string;
}

interface Props {
  initial?: IvrMenu;
  upsertAction: (formData: FormData) => Promise<void>;
  deleteAction?: (formData: FormData) => Promise<void>;
  /** 既存ガイダンス一覧。空配列のときは select は出さず raw input にフォールバック。 */
  guidances?: GuidanceChoice[];
}

interface OptionDraft extends IvrOption {
  uid: string;
}

const ACTION_OPTIONS: { value: IvrAction; label: string }[] = [
  { value: 'goto_extension', label: '内線へ転送' },
  { value: 'goto_ringgroup', label: '着信グループへ' },
  { value: 'goto_ivr', label: '別 IVR へ' },
  { value: 'hangup', label: '切断' },
];

const ACTION_META: Record<
  IvrAction,
  { shortLabel: string; badgeClass: string; helper: string }
> = {
  goto_extension: {
    shortLabel: '電話転送',
    badgeClass: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    helper: '内線番号へつなぎます',
  },
  goto_ringgroup: {
    shortLabel: 'グループ',
    badgeClass: 'bg-amber-50 text-amber-700 ring-amber-200',
    helper: '複数端末を呼び出します',
  },
  goto_ivr: {
    shortLabel: '別ルール',
    badgeClass: 'bg-sky-50 text-sky-700 ring-sky-200',
    helper: '別のIVRへ移動します',
  },
  hangup: {
    shortLabel: '終了',
    badgeClass: 'bg-rose-50 text-rose-700 ring-rose-200',
    helper: '通話を終了します',
  },
};

const AFTER_HOURS_OPTIONS: { value: '' | AfterHoursAction; label: string }[] = [
  { value: '', label: '営業時間判定なし' },
  { value: 'goto_ivr', label: '別 IVR へ転送' },
  { value: 'goto_extension', label: '内線へ転送' },
  { value: 'hangup', label: '切断' },
];

const CID_ACTION_OPTIONS: { value: CallerIdRouteAction; label: string }[] = [
  { value: 'goto_extension', label: '内線へ転送' },
  { value: 'goto_ivr', label: '別 IVR へ' },
  { value: 'hangup', label: '切断' },
];

const fieldClass =
  'mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-100 disabled:text-slate-400';
const compactFieldClass =
  'h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-100 disabled:text-slate-400';
const labelClass = 'text-[11px] font-semibold text-slate-500';

interface CidRouteDraft {
  uid: string;
  pattern: string;
  action: CallerIdRouteAction;
  target: string;
  label: string;
}

function cidRouteFromInitial(r: CallerIdRoute): CidRouteDraft {
  return {
    uid: newUid(),
    pattern: r.pattern,
    action: r.action,
    target: r.target ?? '',
    label: r.label ?? '',
  };
}

function cidRoutesToSerializable(rs: CidRouteDraft[]): CallerIdRoute[] {
  return rs.map((r, i) => ({
    id: 0,
    position: i,
    pattern: r.pattern,
    action: r.action,
    target: r.target || null,
    label: r.label || null,
  }));
}

let uidCounter = 0;
function newUid() {
  uidCounter += 1;
  return `opt-${Date.now().toString(36)}-${uidCounter}`;
}

function withUid(o: IvrOption): OptionDraft {
  return { ...o, uid: newUid() };
}

function defaultOptions(): OptionDraft[] {
  return [
    { uid: newUid(), digit: '1', action: 'goto_extension', target: '9001', label: '営業窓口' },
    { uid: newUid(), digit: '2', action: 'goto_extension', target: '9002', label: '折返し依頼' },
    { uid: newUid(), digit: '0', action: 'goto_extension', target: '1001', label: 'オペレーター' },
  ];
}

function actionNeedsTarget(action: IvrAction | CallerIdRouteAction | AfterHoursAction | ''): boolean {
  return action === 'goto_extension' || action === 'goto_ringgroup' || action === 'goto_ivr';
}

export function IvrEditor({ initial, upsertAction, deleteAction, guidances = [] }: Props) {
  const formId = useId();
  const isEdit = !!initial;
  const [options, setOptions] = useState<OptionDraft[]>(
    initial ? initial.options.map(withUid) : defaultOptions,
  );
  const [view, setView] = useState<'cards' | 'canvas'>('cards');
  const [afterHoursAction, setAfterHoursAction] = useState<'' | AfterHoursAction>(
    initial?.afterHoursAction ?? '',
  );
  const [afterHoursTarget, setAfterHoursTarget] = useState<string>(initial?.afterHoursTarget ?? '');
  const afterHoursNeedsTarget = actionNeedsTarget(afterHoursAction);
  const [cidRoutes, setCidRoutes] = useState<CidRouteDraft[]>(
    initial?.callerIdRoutes.map(cidRouteFromInitial) ?? [],
  );
  const dndContextId = `ivr-dnd-${initial?.number ?? 'new'}`;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const summary = useMemo(() => {
    const transferCount = options.filter((o) => o.action !== 'hangup').length;
    const nestedCount = options.filter((o) => o.action === 'goto_ivr').length;
    return { transferCount, nestedCount };
  }, [options]);

  function addCidRoute() {
    setCidRoutes((cur) => [
      ...cur,
      { uid: newUid(), pattern: '', action: 'goto_extension', target: '', label: '' },
    ]);
  }

  function updateCidRoute(uid: string, patch: Partial<CidRouteDraft>) {
    setCidRoutes((cur) => cur.map((r) => (r.uid === uid ? { ...r, ...patch } : r)));
  }

  function removeCidRoute(uid: string) {
    setCidRoutes((cur) => cur.filter((r) => r.uid !== uid));
  }

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setOptions((cur) => {
      const oldIndex = cur.findIndex((o) => o.uid === active.id);
      const newIndex = cur.findIndex((o) => o.uid === over.id);
      if (oldIndex < 0 || newIndex < 0) return cur;
      return arrayMove(cur, oldIndex, newIndex);
    });
  }

  function update(uid: string, patch: Partial<IvrOption>) {
    setOptions((cur) => cur.map((o) => (o.uid === uid ? { ...o, ...patch } : o)));
  }

  function remove(uid: string) {
    setOptions((cur) => cur.filter((o) => o.uid !== uid));
  }

  function removeAt(index: number) {
    setOptions((cur) => cur.filter((_, i) => i !== index));
  }

  function addRow() {
    setOptions((cur) => [
      ...cur,
      { uid: newUid(), digit: '', action: 'goto_extension', target: '', label: '' },
    ]);
  }

  const serialized = serializeIvrOptions(options);
  const serializedCidRoutes = serializeCallerIdRoutes(cidRoutesToSerializable(cidRoutes));
  const displayName = initial?.name || (isEdit ? `IVR ${initial.number}` : '新しいルール');

  return (
    <form action={upsertAction} id={formId} className="overflow-hidden rounded-lg border border-slate-200 bg-[#f4f6f3] shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-sm font-bold text-white">
            {isEdit ? '✓' : '+'}
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-emerald-700">
              {isEdit ? 'ルール適用' : '新規ルール'}
            </p>
            <h3 className="truncate text-sm font-bold text-slate-950">{displayName}</h3>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="submit"
            className="rounded-md bg-yellow-400 px-4 py-2 text-xs font-bold text-slate-950 shadow-sm transition hover:bg-yellow-300 focus:outline-none focus:ring-2 focus:ring-yellow-200"
          >
            変更を保存
          </button>
          {isEdit && deleteAction && (
            <ConfirmButton
              confirmText={`IVR ${initial!.number} を削除しますか？`}
              formAction={deleteAction}
              className="rounded-md border border-red-200 bg-white px-3 py-2 text-xs font-bold text-red-700 transition hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-100"
            >
              削除
            </ConfirmButton>
          )}
        </div>
      </div>

      <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0 space-y-4">
          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[140px_1fr_120px_120px]">
              <label className={labelClass}>
                IVR番号
                <input
                  name="number"
                  required
                  pattern="[0-9]{2,6}"
                  defaultValue={initial?.number ?? ''}
                  readOnly={isEdit}
                  placeholder="例: 9000"
                  className={`${fieldClass} font-mono read-only:bg-slate-100`}
                />
              </label>
              <label className={labelClass}>
                ルール名
                <input
                  name="name"
                  defaultValue={initial?.name ?? ''}
                  placeholder="例: メインメニュー"
                  className={fieldClass}
                />
              </label>
              <label className={labelClass}>
                リトライ
                <input
                  name="maxRetries"
                  type="number"
                  min={1}
                  max={10}
                  defaultValue={initial?.maxRetries ?? 3}
                  className={`${fieldClass} font-mono`}
                />
              </label>
              <label className={labelClass}>
                入力待ち
                <input
                  name="waitSeconds"
                  type="number"
                  min={1}
                  max={60}
                  defaultValue={initial?.waitSeconds ?? 6}
                  className={`${fieldClass} font-mono`}
                />
              </label>
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-bold text-slate-950">着信フロー</p>
                <p className="text-[11px] text-slate-500">押された番号ごとの分岐を上から順に管理します。</p>
              </div>
              <div className="flex items-center gap-2">
                {isEdit && (
                  <div
                    role="tablist"
                    aria-label="表示切替"
                    className="inline-flex overflow-hidden rounded-md border border-slate-200 bg-slate-50 p-0.5 text-xs"
                  >
                    <button
                      type="button"
                      role="tab"
                      aria-selected={view === 'cards'}
                      onClick={() => setView('cards')}
                      className={`rounded px-3 py-1.5 font-bold transition ${
                        view === 'cards'
                          ? 'bg-emerald-600 text-white shadow-sm'
                          : 'text-slate-600 hover:bg-white'
                      }`}
                    >
                      リスト
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={view === 'canvas'}
                      onClick={() => setView('canvas')}
                      className={`rounded px-3 py-1.5 font-bold transition ${
                        view === 'canvas'
                          ? 'bg-emerald-600 text-white shadow-sm'
                          : 'text-slate-600 hover:bg-white'
                      }`}
                    >
                      図で見る
                    </button>
                  </div>
                )}
                {view === 'cards' && (
                  <button
                    type="button"
                    onClick={addRow}
                    className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 transition hover:bg-emerald-100"
                  >
                    + 分岐
                  </button>
                )}
              </div>
            </div>

            {view === 'cards' ? (
              <>
                <DndContext
                  id={dndContextId}
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext items={options.map((o) => o.uid)} strategy={verticalListSortingStrategy}>
                    <ul className="space-y-2">
                      {options.map((o, index) => (
                        <SortableOptionCard
                          key={o.uid}
                          index={index}
                          option={o}
                          onChange={(patch) => update(o.uid, patch)}
                          onRemove={() => remove(o.uid)}
                        />
                      ))}
                    </ul>
                  </SortableContext>
                </DndContext>

                {options.length === 0 && (
                  <p className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-6 text-center text-xs text-slate-500">
                    分岐がありません。「+ 分岐」で最初の番号を追加してください。
                  </p>
                )}
              </>
            ) : (
              <div className="space-y-2">
                <IvrCanvas
                  menuNumber={initial?.number ?? ''}
                  menuName={initial?.name}
                  options={options}
                  onRemoveAt={removeAt}
                  onAdd={addRow}
                />
                <p className="text-[11px] text-slate-500">
                  エッジクリックで分岐削除、細かい編集はリスト表示で行えます。
                </p>
              </div>
            )}
          </section>

          <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <CallerIdRoutesPanel
              routes={cidRoutes}
              onAdd={addCidRoute}
              onChange={updateCidRoute}
              onRemove={removeCidRoute}
            />
            <AfterHoursPanel
              action={afterHoursAction}
              target={afterHoursTarget}
              needsTarget={afterHoursNeedsTarget}
              onActionChange={setAfterHoursAction}
              onTargetChange={setAfterHoursTarget}
            />
          </section>
        </div>

        <aside className="space-y-4">
          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-xs font-bold text-slate-950">ルール概要</p>
            <dl className="mt-3 grid grid-cols-2 gap-2">
              <SummaryMetric label="分岐" value={options.length} />
              <SummaryMetric label="転送" value={summary.transferCount} />
              <SummaryMetric label="別IVR" value={summary.nestedCount} />
              <SummaryMetric label="CallerID" value={cidRoutes.length} />
            </dl>
            <div className="mt-3 rounded-md bg-emerald-50 px-3 py-2 text-[11px] font-semibold text-emerald-800">
              {afterHoursAction ? '営業時間外ルートあり' : '営業時間内外で同じルール'}
            </div>
          </section>

          <ScriptPreview
            options={options}
            afterHoursAction={afterHoursAction}
            afterHoursTarget={afterHoursTarget}
            cidRouteCount={cidRoutes.length}
          />

          <details className="rounded-lg border border-slate-200 bg-white p-4" open={!isEdit}>
            <summary className="cursor-pointer text-xs font-bold text-slate-950">
              音声ガイダンス
            </summary>
            <div className="mt-3 space-y-3">
              {(['welcomePrompt', 'menuPrompt', 'invalidPrompt', 'goodbyePrompt'] as const).map((k) => (
                <GuidanceField
                  key={k}
                  fieldName={k}
                  label={promptLabel(k)}
                  defaultValue={(initial?.[k] ?? '') as string}
                  guidances={guidances}
                  inputClass={`${fieldClass} font-mono`}
                  labelClass={labelClass}
                />
              ))}
              {guidances.length === 0 && (
                <p className="text-[11px] text-slate-500">
                  /guidances に wav を登録するとここに選択肢として出ます。
                </p>
              )}
            </div>
          </details>
        </aside>
      </div>

      <input type="hidden" name="callerIdRoutes" value={serializedCidRoutes} />
      <input type="hidden" name="options" value={serialized} />
    </form>
  );
}

function promptLabel(key: 'welcomePrompt' | 'menuPrompt' | 'invalidPrompt' | 'goodbyePrompt'): string {
  const labels = {
    welcomePrompt: '開始案内',
    menuPrompt: '番号案内',
    invalidPrompt: '入力エラー',
    goodbyePrompt: '終了案内',
  };
  return labels[key];
}

interface GuidanceFieldProps {
  fieldName: string;
  label: string;
  defaultValue: string;
  guidances: GuidanceChoice[];
  inputClass: string;
  labelClass: string;
}

// ガイダンスが登録されていれば select、未登録ならテキスト入力にフォールバック。
// select でも既存値が一覧に無い場合 ("手入力モード" 切替) は raw input を表示。
function GuidanceField({
  fieldName,
  label,
  defaultValue,
  guidances,
  inputClass,
  labelClass,
}: GuidanceFieldProps) {
  const known = guidances.some((g) => g.path === defaultValue);
  const [value, setValue] = useState<string>(defaultValue);
  const [manual, setManual] = useState<boolean>(!!defaultValue && !known);

  if (guidances.length === 0 || manual) {
    return (
      <label className={labelClass}>
        {label}
        <div className="mt-1 flex items-center gap-2">
          <input
            name={fieldName}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="例: custom/ivr-menu"
            className={inputClass}
          />
          {guidances.length > 0 && (
            <button
              type="button"
              onClick={() => setManual(false)}
              className="shrink-0 text-[10px] font-semibold text-emerald-700 hover:underline"
            >
              一覧から選ぶ
            </button>
          )}
        </div>
      </label>
    );
  }

  return (
    <label className={labelClass}>
      {label}
      <div className="mt-1 flex items-center gap-2">
        <select
          name={fieldName}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className={inputClass}
        >
          <option value="">(再生しない)</option>
          {guidances.map((g) => (
            <option key={g.path} value={g.path}>
              {g.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setManual(true)}
          className="shrink-0 text-[10px] font-semibold text-slate-500 hover:underline"
        >
          手入力
        </button>
      </div>
    </label>
  );
}

function SummaryMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
      <dt className="text-[10px] font-semibold text-slate-500">{label}</dt>
      <dd className="mt-1 font-mono text-lg font-bold text-slate-950">{value}</dd>
    </div>
  );
}

interface ScriptPreviewProps {
  options: OptionDraft[];
  afterHoursAction: '' | AfterHoursAction;
  afterHoursTarget: string;
  cidRouteCount: number;
}

// 保存前に「電話をかけた相手がどう案内されるか」を読み上げ調で確認するためのプレビュー。
// 実際の Asterisk dialplan reload を待たずにブラウザ側で見える。
function ScriptPreview({ options, afterHoursAction, afterHoursTarget, cidRouteCount }: ScriptPreviewProps) {
  const lines = options
    .filter((o) => o.digit?.trim())
    .map((o) => {
      const action = ACTION_META[o.action]?.shortLabel ?? o.action;
      const target = o.target?.trim() ? ` → ${o.target}` : '';
      const label = o.label?.trim() ? `（${o.label}）` : '';
      return `${o.digit} を押すと: ${action}${target}${label}`;
    });

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-xs font-bold text-slate-950">読み上げ台本プレビュー</p>
      <p className="mt-1 text-[11px] text-slate-500">保存前に分岐の流れを確認できます。</p>
      <ol className="mt-3 space-y-1 text-xs text-slate-700">
        <li>📢 開始案内が流れます</li>
        {lines.length === 0 ? (
          <li className="text-slate-400">（分岐がまだありません）</li>
        ) : (
          lines.map((l, i) => <li key={i}>📞 {l}</li>)
        )}
        <li>⌛ 無入力時はもう一度案内します</li>
        <li>❌ リトライ超過で終了案内 → 切断</li>
        {afterHoursAction && (
          <li className="rounded bg-amber-50 px-2 py-1 text-amber-800">
            🌙 営業時間外:{' '}
            {ACTION_META[afterHoursAction as IvrAction]?.shortLabel ?? afterHoursAction}
            {afterHoursTarget ? ` → ${afterHoursTarget}` : ''}
          </li>
        )}
        {cidRouteCount > 0 && (
          <li className="rounded bg-sky-50 px-2 py-1 text-sky-800">
            🆔 CallerID ルートが {cidRouteCount} 件設定されています（メニュー前に分岐）
          </li>
        )}
      </ol>
    </section>
  );
}

interface AfterHoursPanelProps {
  action: '' | AfterHoursAction;
  target: string;
  needsTarget: boolean;
  onActionChange: (action: '' | AfterHoursAction) => void;
  onTargetChange: (target: string) => void;
}

function AfterHoursPanel({
  action,
  target,
  needsTarget,
  onActionChange,
  onTargetChange,
}: AfterHoursPanelProps) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold text-slate-950">営業時間外</p>
          <p className="text-[11px] text-slate-500">閉店時だけ別ルートへ切り替えます。</p>
        </div>
        <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${action ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
          {action ? 'ON' : 'OFF'}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_120px]">
        <label className={labelClass}>
          アクション
          <select
            name="afterHoursAction"
            value={action}
            onChange={(e) => onActionChange(e.target.value as '' | AfterHoursAction)}
            className={fieldClass}
          >
            {AFTER_HOURS_OPTIONS.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          転送先
          <input
            name="afterHoursTarget"
            value={target}
            onChange={(e) => onTargetChange(e.target.value)}
            disabled={!needsTarget}
            inputMode="numeric"
            pattern="[0-9]{2,6}"
            placeholder={needsTarget ? '9100' : '-'}
            className={`${fieldClass} font-mono`}
          />
        </label>
      </div>
    </div>
  );
}

interface CallerIdRoutesPanelProps {
  routes: CidRouteDraft[];
  onAdd: () => void;
  onChange: (uid: string, patch: Partial<CidRouteDraft>) => void;
  onRemove: (uid: string) => void;
}

function CallerIdRoutesPanel({ routes, onAdd, onChange, onRemove }: CallerIdRoutesPanelProps) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold text-slate-950">CallerID 条件分岐</p>
          <p className="text-[11px] text-slate-500">番号パターンに応じて先頭で振り分けます。</p>
        </div>
        <button
          type="button"
          onClick={onAdd}
          className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 transition hover:bg-emerald-100"
        >
          + 追加
        </button>
      </div>

      {routes.length === 0 ? (
        <p className="mt-3 rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-center text-[11px] text-slate-500">
          条件分岐は未設定です。
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {routes.map((r) => {
            const needsTarget = r.action !== 'hangup';
            return (
              <li key={r.uid} className="rounded-md border border-slate-200 bg-slate-50 p-2">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_120px_96px_32px]">
                  <input
                    value={r.pattern}
                    onChange={(e) => onChange(r.uid, { pattern: e.target.value })}
                    placeholder="090*"
                    inputMode="numeric"
                    className={`${compactFieldClass} font-mono`}
                  />
                  <select
                    value={r.action}
                    onChange={(e) => onChange(r.uid, { action: e.target.value as CallerIdRouteAction })}
                    className={compactFieldClass}
                  >
                    {CID_ACTION_OPTIONS.map((a) => (
                      <option key={a.value} value={a.value}>
                        {a.label}
                      </option>
                    ))}
                  </select>
                  <input
                    value={r.target}
                    onChange={(e) => onChange(r.uid, { target: e.target.value })}
                    disabled={!needsTarget}
                    inputMode="numeric"
                    placeholder={needsTarget ? '1001' : '-'}
                    className={`${compactFieldClass} font-mono`}
                  />
                  <button
                    type="button"
                    onClick={() => onRemove(r.uid)}
                    aria-label="CallerID ルートを削除"
                    className="flex h-10 w-8 items-center justify-center rounded-md text-lg font-bold text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                  >
                    ×
                  </button>
                </div>
                <input
                  value={r.label}
                  onChange={(e) => onChange(r.uid, { label: e.target.value })}
                  placeholder="ラベル"
                  className={`${compactFieldClass} mt-2`}
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

interface CardProps {
  index: number;
  option: OptionDraft;
  onChange: (patch: Partial<IvrOption>) => void;
  onRemove: () => void;
}

function SortableOptionCard({ index, option, onChange, onRemove }: CardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: option.uid,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.65 : 1,
  };
  const needsTarget = actionNeedsTarget(option.action);
  const meta = ACTION_META[option.action];

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="group rounded-lg border border-slate-200 bg-white shadow-sm transition hover:border-emerald-200 hover:shadow-md"
    >
      <div className="grid gap-3 p-3 md:grid-cols-[34px_72px_minmax(180px,1fr)_150px_150px_40px] md:items-center">
        <button
          type="button"
          aria-label="並べ替え"
          {...attributes}
          {...listeners}
          className="flex h-9 w-8 cursor-grab items-center justify-center rounded-md text-slate-300 transition hover:bg-slate-100 hover:text-slate-700 active:cursor-grabbing touch-none"
        >
          ⠿
        </button>

        <label className={`${labelClass} block`}>
          #{index}
          <input
            value={option.digit}
            onChange={(e) => onChange({ digit: e.target.value })}
            maxLength={1}
            inputMode="numeric"
            pattern="[0-9*#]"
            placeholder="1"
            className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-slate-50 px-2 text-center font-mono text-base font-bold text-slate-950 outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-100"
          />
        </label>

        <label className={`${labelClass} block`}>
          案内名
          <input
            value={option.label ?? ''}
            onChange={(e) => onChange({ label: e.target.value || null })}
            placeholder="例: 予約"
            className={fieldClass}
          />
        </label>

        <label className={`${labelClass} block`}>
          動作
          <select
            value={option.action}
            onChange={(e) => onChange({ action: e.target.value as IvrAction })}
            className={fieldClass}
          >
            {ACTION_OPTIONS.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
        </label>

        <label className={`${labelClass} block`}>
          転送先
          <input
            value={option.target ?? ''}
            onChange={(e) => onChange({ target: e.target.value || null })}
            disabled={!needsTarget}
            inputMode="numeric"
            pattern="[0-9]{2,6}"
            placeholder={needsTarget ? '1001' : '-'}
            className={`${fieldClass} font-mono`}
          />
        </label>

        <button
          type="button"
          onClick={onRemove}
          aria-label="この分岐を削除"
          className="flex h-10 w-10 items-center justify-center rounded-md text-lg font-bold text-slate-400 transition hover:bg-red-50 hover:text-red-600"
        >
          ×
        </button>
      </div>
      <div className="border-t border-slate-100 px-3 py-2">
        <span className={`inline-flex items-center rounded-full px-2 py-1 text-[10px] font-bold ring-1 ${meta.badgeClass}`}>
          {meta.shortLabel}
        </span>
        <span className="ml-2 text-[11px] text-slate-500">{meta.helper}</span>
      </div>
    </li>
  );
}
