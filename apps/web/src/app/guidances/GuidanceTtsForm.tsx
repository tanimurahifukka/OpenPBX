'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { VoiceBoxSpeaker } from '@/lib/voicebox';

export interface GuidanceTtsFormProps {
  speakers: VoiceBoxSpeaker[];
  /** Pre-fill the name input (used by IVR editor "文章から作る" link). */
  prefillName?: string;
  defaultSpeakerId?: number;
}

const SPEED_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 0.9, label: 'ゆっくり' },
  { value: 1.0, label: '標準' },
  { value: 1.1, label: '少し速い' },
];

interface Template {
  label: string;
  name: string;
  text: string;
}

const TEMPLATES: Template[] = [
  {
    label: 'クリニック代表案内',
    name: 'custom/ivr-welcome',
    text: 'お電話ありがとうございます。ご用件の番号を押してください。当日のご予約は1、折り返しのご依頼は2、スタッフへお繋ぎする場合は0を押してください。',
  },
  {
    label: '営業時間外のご案内',
    name: 'custom/ivr-after-hours',
    text: '本日の受付は終了いたしました。診療時間内にあらためてお電話ください。緊急の場合は救急医療機関へご連絡ください。',
  },
  {
    label: '折り返し依頼',
    name: 'custom/ivr-callback',
    text: 'ピーッという音の後に、お名前と折り返し希望のお時間をお話しください。録音を終わるときはシャープを押すか、そのままお電話を切ってください。',
  },
  {
    label: '転送中のご案内',
    name: 'custom/ivr-transferring',
    text: '担当者におつなぎします。少々お待ちください。',
  },
];

export function GuidanceTtsForm({
  speakers,
  prefillName,
  defaultSpeakerId,
}: GuidanceTtsFormProps) {
  const router = useRouter();
  const [name, setName] = useState<string>(prefillName ?? '');
  const [text, setText] = useState<string>('');
  const [speakerId, setSpeakerId] = useState<number>(
    defaultSpeakerId ?? speakers[0]?.speakerId ?? 1,
  );
  const [speedScale, setSpeedScale] = useState<number>(1.0);
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ name: string; size?: number } | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!name.trim()) {
      setError('音声名を入力してください');
      return;
    }
    if (!text.trim()) {
      setError('案内の文章を入力してください');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/guidances/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), text: text.trim(), speakerId, speedScale }),
      });
      const body = (await res.json()) as { ok?: boolean; message?: string; guidance?: { name: string; size: number | null } };
      if (!res.ok || !body.ok) {
        setError(body.message ?? `エラー: HTTP ${res.status}`);
        return;
      }
      setSuccess({ name: body.guidance?.name ?? name.trim(), size: body.guidance?.size ?? undefined });
      setText('');
      // 一覧 / 既存音声を再取得するため refresh.
      router.refresh();
    } catch (err) {
      setError(`通信エラー: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  const selectedSpeaker = speakers.find((s) => s.speakerId === speakerId);
  const remainingChars = 500 - text.length;

  function applyTemplate(idx: number) {
    const t = TEMPLATES[idx];
    if (!t) return;
    if (!name || name === prefillName) setName(t.name);
    setText(t.text);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <label className="block text-xs text-slate-600">
        テンプレートから始める (任意)
        <select
          onChange={(e) => {
            const v = Number(e.target.value);
            if (v >= 0) applyTemplate(v);
          }}
          defaultValue="-1"
          className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
        >
          <option value="-1">空欄から書く</option>
          {TEMPLATES.map((t, i) => (
            <option key={t.name} value={i}>
              {t.label}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-xs text-slate-600">
        音声名 (例: custom/ivr-main-menu)
        <input
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          pattern="[A-Za-z0-9_/-]{1,80}"
          className="mt-1 w-full rounded border border-slate-300 px-2 py-1 font-mono text-sm"
        />
      </label>

      <label className="block text-xs text-slate-600">
        電話で流す文章 (最大 500 文字)
        <textarea
          name="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          required
          maxLength={500}
          rows={4}
          placeholder="お電話ありがとうございます。ご用件の番号を押してください。"
          className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
        />
        <span className="mt-1 block text-right text-xs text-slate-400">
          残り {remainingChars} 文字
        </span>
      </label>

      <p className="rounded border border-warning bg-warning-light p-2 text-xs text-warning-dark">
        電話で誰にでも流れる案内文です。個人名、診療内容、相談内容、契約内容などは入れないでください。
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block text-xs text-slate-600">
          声
          <select
            value={speakerId}
            onChange={(e) => setSpeakerId(Number(e.target.value))}
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
          >
            {speakers.map((s) => (
              <option key={`${s.speakerId}-${s.styleName}`} value={s.speakerId}>
                {s.speakerName} / {s.styleName}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs text-slate-600">
          話す速さ
          <select
            value={speedScale}
            onChange={(e) => setSpeedScale(Number(e.target.value))}
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
          >
            {SPEED_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {busy ? '作成中…' : '音声を作成して登録'}
        </button>
        {selectedSpeaker && (
          <span className="text-xs text-slate-500">{selectedSpeaker.credit}</span>
        )}
      </div>

      {error && (
        <p className="rounded border border-danger bg-danger-light p-2 text-xs text-danger">{error}</p>
      )}
      {success && (
        <div className="rounded border border-primary-200 bg-primary-50 p-2 text-xs text-primary-700">
          <p>
            音声を作成しました:{' '}
            <code className="font-mono">{success.name}</code>
            {success.size != null && <span className="text-slate-500"> ({success.size} bytes)</span>}
          </p>
          <audio
            controls
            preload="none"
            src={`/api/guidances/${encodeURIComponent(success.name)}/wav`}
            className="mt-2 w-full"
          />
        </div>
      )}
    </form>
  );
}
