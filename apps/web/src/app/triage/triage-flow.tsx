'use client';

import { useMemo, useState } from 'react';
import { FLOW, KIND_LABEL, KIND_COLOR, type Recommendation, type FlowOption } from './flow';

interface Step {
  nodeId: string;
  questionText: string;
  answerLabel: string;
  flag?: FlowOption['flag'];
}

interface TriageProps {
  patientId?: string;
  extension?: string;
}

export function TriageFlow({ patientId, extension }: TriageProps = {}) {
  const [currentId, setCurrentId] = useState<string>('start');
  const [history, setHistory] = useState<Step[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [endText, setEndText] = useState<string | null>(null);
  const [memo, setMemo] = useState<string>('');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const node = FLOW[currentId];

  function pick(opt: FlowOption) {
    const nextId = opt.next;
    const next = FLOW[nextId];
    setHistory((h) => [
      ...h,
      { nodeId: currentId, questionText: node.text, answerLabel: opt.label, flag: opt.flag },
    ]);
    if (!next) return;
    if (next.type === 'recommend') {
      // 重複推奨はマージ
      setRecommendations((rs) => mergeUnique(rs, next.recommends ?? []));
      setEndText(next.text);
    }
    setCurrentId(nextId);
  }

  function reset() {
    setCurrentId('start');
    setHistory([]);
    setRecommendations([]);
    setEndText(null);
  }

  function back() {
    setHistory((h) => {
      if (h.length === 0) return h;
      const prev = h[h.length - 1];
      setCurrentId(prev.nodeId);
      setEndText(null);
      // 推奨を巻き戻すのは複雑なので、ユーザに任せる (履歴に残す方が安全)
      return h.slice(0, -1);
    });
  }

  function pushRecommendation(r: Recommendation) {
    setRecommendations((rs) => mergeUnique(rs, [r]));
  }

  const finalText = useMemo(() => {
    const lines: string[] = [];
    lines.push('# 整形外科 問診サマリ');
    if (history.length > 0) {
      lines.push('');
      lines.push('## 問診経過');
      for (const h of history) {
        lines.push(`- Q: ${h.questionText}`);
        lines.push(`  → A: ${h.answerLabel}${h.flag === 'urgent' ? ' ⚠️' : h.flag === 'red' ? ' ⚑' : ''}`);
      }
    }
    if (endText) {
      lines.push('');
      lines.push(`## 評価: ${endText}`);
    }
    if (recommendations.length > 0) {
      lines.push('');
      lines.push('## 推奨検査・対応');
      for (const r of recommendations) {
        lines.push(`- [${KIND_LABEL[r.kind]}]${r.urgent ? ' (緊急)' : ''} ${r.text}`);
      }
    }
    if (memo.trim()) {
      lines.push('');
      lines.push('## メモ');
      lines.push(memo.trim());
    }
    return lines.join('\n');
  }, [history, endText, recommendations, memo]);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
      {/* 左: 現在の質問 / フロー */}
      <section className="space-y-3">
        <header className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">整形外科 問診フロー (モック)</h2>
          <button
            type="button"
            onClick={reset}
            className="ml-auto rounded border border-slate-300 bg-white px-2 py-1 text-xs hover:bg-slate-100"
          >
            最初から
          </button>
          {history.length > 0 && (
            <button
              type="button"
              onClick={back}
              className="rounded border border-slate-300 bg-white px-2 py-1 text-xs hover:bg-slate-100"
            >
              ← 戻る
            </button>
          )}
        </header>
        <p className="text-xs text-slate-500">
          通話中にスタッフが分岐ボタンを押していくと、レントゲン・採血・MRI などのオーダー候補が右側に
          自動でまとまります。本フローはモックで、実臨床の判断は医師が行ってください。
        </p>

        {node?.type === 'question' && (
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <h3 className="text-base font-semibold text-slate-800">{node.text}</h3>
            {node.hint && <p className="mt-1 text-xs text-slate-500">{node.hint}</p>}
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {node.options?.map((opt) => (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => pick(opt)}
                  className={`rounded-lg border px-3 py-2 text-left text-sm transition ${
                    opt.flag === 'urgent'
                      ? 'border-red-400 bg-red-50 text-red-800 hover:bg-red-100'
                      : opt.flag === 'red'
                        ? 'border-amber-400 bg-amber-50 text-amber-900 hover:bg-amber-100'
                        : 'border-slate-300 bg-slate-50 hover:bg-blue-50 hover:border-blue-400'
                  }`}
                >
                  {opt.flag === 'urgent' && <span aria-hidden>⚠️ </span>}
                  {opt.flag === 'red' && <span aria-hidden>⚑ </span>}
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {node?.type === 'recommend' && (
          <div className="rounded-lg border-2 border-emerald-300 bg-emerald-50 p-4">
            <h3 className="text-base font-semibold text-emerald-900">{node.text}</h3>
            <p className="mt-1 text-xs text-emerald-800">
              右パネルに推奨オーダーがまとまりました。必要に応じて追加項目をクリックで足せます。
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={reset}
                className="rounded bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800"
              >
                次の患者を問診する
              </button>
            </div>
          </div>
        )}

        {/* 履歴 */}
        {history.length > 0 && (
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <h3 className="mb-2 text-sm font-semibold text-slate-700">これまでの問診</h3>
            <ol className="space-y-2 text-sm">
              {history.map((h, i) => (
                <li key={i} className="rounded border border-slate-100 bg-slate-50 p-2">
                  <div className="text-xs text-slate-500">Q{i + 1}: {h.questionText}</div>
                  <div className="font-semibold">
                    {h.flag === 'urgent' && <span aria-hidden>⚠️ </span>}
                    {h.flag === 'red' && <span aria-hidden>⚑ </span>}
                    {h.answerLabel}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        )}

        {/* 追加オーダーパレット */}
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="mb-2 text-sm font-semibold text-slate-700">追加オーダー (手動)</h3>
          <div className="flex flex-wrap gap-2">
            {EXTRA_PRESETS.map((r, i) => (
              <button
                key={i}
                type="button"
                onClick={() => pushRecommendation(r)}
                className={`rounded-full border px-2 py-0.5 text-xs ${KIND_COLOR[r.kind]} hover:opacity-80`}
              >
                + {KIND_LABEL[r.kind]}: {r.text}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* 右: 推奨パネル */}
      <aside className="space-y-3">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="mb-2 text-sm font-semibold text-slate-700">
            推奨検査・対応 ({recommendations.length})
          </h3>
          {recommendations.length === 0 ? (
            <p className="text-xs text-slate-500">問診を進めると候補が出ます。</p>
          ) : (
            <ul className="space-y-2">
              {recommendations.map((r, i) => (
                <li
                  key={i}
                  className={`relative rounded border px-2 py-1.5 text-xs ${KIND_COLOR[r.kind]}`}
                >
                  <span className="mr-1 inline-block rounded bg-white/60 px-1.5 py-0.5 font-mono text-[10px]">
                    {KIND_LABEL[r.kind]}
                  </span>
                  {r.urgent && <span className="mr-1 font-bold">⚠️</span>}
                  {r.text}
                  <button
                    type="button"
                    onClick={() => setRecommendations((rs) => rs.filter((_, j) => j !== i))}
                    aria-label="削除"
                    className="absolute right-1 top-1 rounded text-xs text-slate-500 hover:text-red-600"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="mb-2 text-sm font-semibold text-slate-700">補足メモ</h3>
          <textarea
            rows={4}
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="他に気になった所見、家族の声、患者の希望など"
            className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
          />
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="mb-2 text-sm font-semibold text-slate-700">サマリ出力</h3>
          <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-2 font-mono text-[11px] text-slate-700">
{finalText}
          </pre>
          <div className="mt-2 flex flex-wrap gap-2">
            <CopyButton text={finalText} />
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs hover:bg-slate-100"
            >
              印刷
            </button>
            {patientId && (
              <button
                type="button"
                disabled={saveState === 'saving' || saveState === 'saved'}
                onClick={async () => {
                  setSaveState('saving');
                  const fd = new FormData();
                  fd.set('patientId', patientId);
                  if (extension) fd.set('extension', extension);
                  fd.set('kind', 'triage');
                  fd.set('summary', finalText);
                  const res = await fetch('/api/patients/records', {
                    method: 'POST',
                    body: fd,
                  });
                  setSaveState(res.ok ? 'saved' : 'error');
                  setTimeout(() => setSaveState('idle'), 2500);
                }}
                className={`rounded px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60 ${
                  saveState === 'saved'
                    ? 'bg-emerald-700'
                    : saveState === 'error'
                      ? 'bg-red-700'
                      : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {saveState === 'saved'
                  ? '✓ 保存しました'
                  : saveState === 'error'
                    ? '失敗'
                    : saveState === 'saving'
                      ? '保存中…'
                      : `💾 患者 ${patientId} に保存`}
              </button>
            )}
          </div>
          {!patientId && (
            <p className="mt-1 text-[10px] text-slate-500">
              ※ <a href="/quick-intake" className="text-blue-700 underline">/quick-intake</a> から患者ID付きで開くと、ここに保存ボタンが出ます。
            </p>
          )}
        </div>
      </aside>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
    >
      {copied ? '✓ コピー済' : 'カルテにコピー'}
    </button>
  );
}

function mergeUnique(prev: Recommendation[], next: Recommendation[]): Recommendation[] {
  const key = (r: Recommendation) => `${r.kind}|${r.text}`;
  const seen = new Set(prev.map(key));
  const out = [...prev];
  for (const r of next) {
    if (!seen.has(key(r))) {
      out.push(r);
      seen.add(key(r));
    }
  }
  return out;
}

// 「とりあえず追加」用のプリセット
const EXTRA_PRESETS: Recommendation[] = [
  { kind: 'xray', text: '対象部位 X-P 追加撮影' },
  { kind: 'lab', text: 'CBC, CRP, 生化一般' },
  { kind: 'lab', text: 'HbA1c / 血糖' },
  { kind: 'lab', text: '尿酸 / RA factor' },
  { kind: 'us', text: '関節 / 軟部組織エコー' },
  { kind: 'mri', text: '保険適応で MRI を予約' },
  { kind: 'rx', text: 'NSAIDs 5-7 日' },
  { kind: 'rx', text: 'ロキソニンテープ処方' },
  { kind: 'referral', text: '高次医療機関へ紹介状' },
];
