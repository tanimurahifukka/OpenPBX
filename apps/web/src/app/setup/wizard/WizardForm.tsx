'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { wizardCreateAccount } from './actions';

type Step = 1 | 2 | 3;

export function WizardForm() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // step 1
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');

  // step 2
  const [crSkip, setCrSkip] = useState(true);
  const [crCode, setCrCode] = useState('');

  // step 3
  const [vbSkip, setVbSkip] = useState(true);
  const [vbUrl, setVbUrl] = useState('');
  const [vbToken, setVbToken] = useState('');
  const [vbDetecting, setVbDetecting] = useState(false);
  const [vbDetectResult, setVbDetectResult] = useState<string | null>(null);

  async function handleStep1() {
    if (password.length < 8) { setError('パスワードは 8 文字以上必要です'); return; }
    if (password !== passwordConfirm) { setError('パスワードが一致しません'); return; }
    setError(null);
    setBusy(true);
    try {
      const result = await wizardCreateAccount(username.trim(), password);
      if (!result.ok) {
        setError(result.error ?? 'アカウント作成に失敗しました');
        return;
      }
      setStep(2);
    } catch (e) {
      setError(`エラー: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleStep2() {
    setError(null);
    if (crSkip) { setStep(3); return; }
    if (!crCode.trim()) { setError('接続コードを入力してください'); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commandRoom: { connectCode: crCode } }),
      });
      const body = (await res.json()) as { ok?: boolean; errors?: string[] };
      if (!res.ok || !body.ok) {
        setError(body.errors?.[0] ?? `保存に失敗しました`);
        return;
      }
      setStep(3);
    } catch (e) {
      setError(`通信エラー: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleStep3() {
    setError(null);
    if (vbSkip) { finalize(); return; }
    if (!vbUrl.trim()) { setError('VoiceBox URL を入力するか自動検出してください'); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voiceBox: { url: vbUrl, token: vbToken } }),
      });
      const body = (await res.json()) as { ok?: boolean; errors?: string[] };
      if (!res.ok || !body.ok) {
        setError(body.errors?.[0] ?? `保存に失敗しました`);
        setBusy(false);
        return;
      }
      finalize();
    } catch (e) {
      setError(`通信エラー: ${e instanceof Error ? e.message : String(e)}`);
      setBusy(false);
    }
  }

  function finalize() {
    router.push('/');
    router.refresh();
  }

  async function handleVbDetect() {
    setVbDetecting(true);
    setVbDetectResult(null);
    const candidates = ['http://127.0.0.1:3921', 'http://host.docker.internal:3921', 'http://voicebox:3921'];
    for (const url of candidates) {
      try {
        const res = await fetch('/api/settings/test-connection', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ target: 'voicebox', url }),
        });
        const body = (await res.json()) as { ok?: boolean };
        if (body?.ok) {
          setVbUrl(url);
          setVbDetectResult(`${url} で見つかりました`);
          setVbDetecting(false);
          return;
        }
      } catch { /* try next */ }
    }
    setVbDetectResult('見つかりませんでした。URL を手入力してください。');
    setVbDetecting(false);
  }

  return (
    <div className="mx-auto max-w-md space-y-6 p-6">
      <header className="text-center">
        <h1 className="text-xl font-bold text-slate-900">OpenPBX セットアップ</h1>
        <p className="mt-1 text-xs text-slate-500">ステップ {step} / 3</p>
        <div className="mx-auto mt-3 flex max-w-[200px] gap-1">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`h-1 flex-1 rounded-full ${s <= step ? 'bg-primary' : 'bg-slate-200'}`}
            />
          ))}
        </div>
      </header>

      {step === 1 && (
        <section className="rounded-lg border border-slate-200 bg-white p-5 space-y-4">
          <h2 className="text-sm font-bold text-slate-900">管理者アカウントを作成</h2>
          <p className="text-xs text-slate-500">
            OpenPBX にログインするためのアカウントを作ります。
          </p>
          <label className="block text-xs text-slate-600">
            ユーザー名
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
            />
          </label>
          <label className="block text-xs text-slate-600">
            パスワード (8 文字以上)
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
            />
          </label>
          <label className="block text-xs text-slate-600">
            パスワード確認
            <input
              type="password"
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
              required
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
            />
          </label>
          <button
            type="button"
            onClick={handleStep1}
            disabled={busy || !username.trim() || !password}
            className="w-full rounded bg-primary py-2 text-sm font-semibold text-white hover:bg-primary-500 disabled:opacity-50"
          >
            {busy ? '作成中…' : '次へ'}
          </button>
        </section>
      )}

      {step === 2 && (
        <section className="rounded-lg border border-slate-200 bg-white p-5 space-y-4">
          <h2 className="text-sm font-bold text-slate-900">command-room 連携 (任意)</h2>
          <p className="text-xs text-slate-500">
            通話記録を command-room の対応カードに自動で送ります。あとからでも設定できます。
          </p>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-xs">
              <input type="radio" checked={crSkip} onChange={() => setCrSkip(true)} />
              あとで設定する
            </label>
            <label className="flex items-center gap-2 text-xs">
              <input type="radio" checked={!crSkip} onChange={() => setCrSkip(false)} />
              接続コードを入力する
            </label>
          </div>
          {!crSkip && (
            <textarea
              value={crCode}
              onChange={(e) => setCrCode(e.target.value)}
              placeholder='command-room の管理画面から発行された接続コードを貼り付け'
              rows={3}
              className="w-full rounded border border-slate-300 px-2 py-1 font-mono text-xs"
            />
          )}
          <button
            type="button"
            onClick={handleStep2}
            disabled={busy}
            className="w-full rounded bg-primary py-2 text-sm font-semibold text-white hover:bg-primary-500 disabled:opacity-50"
          >
            {busy ? '保存中…' : '次へ'}
          </button>
        </section>
      )}

      {step === 3 && (
        <section className="rounded-lg border border-slate-200 bg-white p-5 space-y-4">
          <h2 className="text-sm font-bold text-slate-900">音声作成 (任意)</h2>
          <p className="text-xs text-slate-500">
            文章から電話案内音声を作成できるようになります。VoiceBox サーバーが起動している必要があります。
            あとからでも設定できます。
          </p>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-xs">
              <input type="radio" checked={vbSkip} onChange={() => setVbSkip(true)} />
              あとで設定する
            </label>
            <label className="flex items-center gap-2 text-xs">
              <input type="radio" checked={!vbSkip} onChange={() => setVbSkip(false)} />
              VoiceBox に接続する
            </label>
          </div>
          {!vbSkip && (
            <div className="space-y-2">
              <div className="flex gap-2">
                <input
                  value={vbUrl}
                  onChange={(e) => setVbUrl(e.target.value)}
                  placeholder="http://127.0.0.1:3921"
                  className="flex-1 rounded border border-slate-300 px-2 py-1 font-mono text-xs"
                />
                <button
                  type="button"
                  onClick={handleVbDetect}
                  disabled={vbDetecting}
                  className="shrink-0 rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  {vbDetecting ? '検出中…' : '自動検出'}
                </button>
              </div>
              {vbDetectResult && (
                <p className="text-xs text-slate-600">{vbDetectResult}</p>
              )}
              <input
                type="password"
                value={vbToken}
                onChange={(e) => setVbToken(e.target.value)}
                placeholder="VOICEBOX_TOKEN"
                className="w-full rounded border border-slate-300 px-2 py-1 font-mono text-xs"
              />
            </div>
          )}
          <button
            type="button"
            onClick={handleStep3}
            disabled={busy}
            className="w-full rounded bg-primary py-2 text-sm font-semibold text-white hover:bg-primary-500 disabled:opacity-50"
          >
            {busy ? '保存中…' : 'セットアップ完了'}
          </button>
        </section>
      )}

      {error && (
        <p className="rounded border border-danger bg-danger-light p-2 text-xs text-danger">{error}</p>
      )}
    </div>
  );
}
