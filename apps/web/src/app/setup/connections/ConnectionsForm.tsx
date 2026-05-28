'use client';

import { useState } from 'react';
import { UPSTREAM_BRAND } from '@/lib/branding';

interface Props {
  initialCr: { configured: boolean; pushUrl: string | null; workspaceId: string | null; hasToken: boolean };
  initialVb: { configured: boolean; url: string | null; hasToken: boolean };
}

type TestResult = { ok: boolean; message: string } | null;

export function ConnectionsForm({ initialCr, initialVb }: Props) {
  // ---- command-room ----
  const [crCode, setCrCode] = useState('');
  const [crBusy, setCrBusy] = useState(false);
  const [crTest, setCrTest] = useState<TestResult>(null);
  const [crSaved, setCrSaved] = useState(initialCr.configured);
  const [crError, setCrError] = useState<string | null>(null);

  // ---- voicebox ----
  const [vbUrl, setVbUrl] = useState(initialVb.url ?? '');
  const [vbToken, setVbToken] = useState('');
  const [vbBusy, setVbBusy] = useState(false);
  const [vbTest, setVbTest] = useState<TestResult>(null);
  const [vbSaved, setVbSaved] = useState(initialVb.configured);
  const [vbError, setVbError] = useState<string | null>(null);
  const [vbDetecting, setVbDetecting] = useState(false);

  async function testConnection(target: 'command-room' | 'voicebox', url?: string) {
    const body: Record<string, string> = { target };
    if (url) body.url = url;
    try {
      const res = await fetch('/api/settings/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return (await res.json()) as TestResult;
    } catch {
      return { ok: false, message: '通信エラー' };
    }
  }

  async function handleCrSave() {
    setCrBusy(true);
    setCrError(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commandRoom: { connectCode: crCode } }),
      });
      const body = (await res.json()) as { ok?: boolean; errors?: string[] };
      if (!res.ok || !body.ok) {
        setCrError(body.errors?.[0] ?? `保存に失敗しました (HTTP ${res.status})`);
        return;
      }
      setCrSaved(true);
      setCrCode('');
      const test = await testConnection('command-room');
      setCrTest(test);
    } catch (e) {
      setCrError(`通信エラー: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setCrBusy(false);
    }
  }

  async function handleCrTest() {
    setCrBusy(true);
    const result = await testConnection('command-room');
    setCrTest(result);
    setCrBusy(false);
  }

  async function handleVbSave() {
    setVbBusy(true);
    setVbError(null);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voiceBox: { url: vbUrl, token: vbToken } }),
      });
      const body = (await res.json()) as { ok?: boolean; errors?: string[] };
      if (!res.ok || !body.ok) {
        setVbError(body.errors?.[0] ?? `保存に失敗しました (HTTP ${res.status})`);
        return;
      }
      setVbSaved(true);
      const test = await testConnection('voicebox');
      setVbTest(test);
    } catch (e) {
      setVbError(`通信エラー: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setVbBusy(false);
    }
  }

  async function handleVbDetect() {
    setVbDetecting(true);
    const candidates = [
      'http://127.0.0.1:3921',
      'http://host.docker.internal:3921',
      'http://voicebox:3921',
    ];
    for (const url of candidates) {
      const result = await testConnection('voicebox', url);
      if (result?.ok) {
        setVbUrl(url);
        setVbTest({ ok: true, message: `${url} で見つかりました` });
        setVbDetecting(false);
        return;
      }
    }
    setVbTest({ ok: false, message: '既知のアドレスでは見つかりませんでした。URL を手入力してください。' });
    setVbDetecting(false);
  }

  async function handleVbTest() {
    setVbBusy(true);
    const result = await testConnection('voicebox', vbUrl || undefined);
    setVbTest(result);
    setVbBusy(false);
  }

  return (
    <div className="space-y-8">
      {/* ---- command-room ---- */}
      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <h3 className="text-sm font-bold text-slate-900">{UPSTREAM_BRAND.integrationLabel}</h3>
        <p className="mt-1 text-xs text-slate-500">
          通話記録を {UPSTREAM_BRAND.shortName} の対応カードに自動で送ります。設定しなくても OpenPBX 単体で内線・IVR・録音は使えます。
        </p>

        {crSaved && (
          <div className="mt-3 flex items-center gap-2 text-xs">
            <span className="inline-block h-2 w-2 rounded-full bg-primary-500" />
            <span className="font-semibold text-primary-700">設定済み</span>
            {initialCr.pushUrl && (
              <span className="text-slate-500">({initialCr.pushUrl})</span>
            )}
            <button
              type="button"
              onClick={handleCrTest}
              disabled={crBusy}
              className="ml-auto rounded border border-slate-300 px-2 py-0.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              テスト接続
            </button>
          </div>
        )}

        <div className="mt-3 space-y-2">
          <label className="block text-xs text-slate-600">
            接続コード
            <textarea
              value={crCode}
              onChange={(e) => setCrCode(e.target.value)}
              placeholder={`${UPSTREAM_BRAND.shortName} の管理画面から発行された接続コードを貼り付けてください`}
              rows={3}
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1 font-mono text-xs"
            />
          </label>
          <p className="text-xs text-slate-400">
            接続コードは {UPSTREAM_BRAND.shortName} の管理者に発行してもらってください。
            JSON 形式、または openpbx-connect:// 形式のどちらにも対応しています。
          </p>
          <button
            type="button"
            onClick={handleCrSave}
            disabled={crBusy || !crCode.trim()}
            className="rounded bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {crBusy ? '保存中…' : '接続コードを保存'}
          </button>
        </div>

        {crError && <p className="mt-2 text-xs text-danger">{crError}</p>}
        {crTest && <TestBadge result={crTest} />}
      </section>

      {/* ---- voicebox ---- */}
      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <h3 className="text-sm font-bold text-slate-900">音声作成 (VoiceBox)</h3>
        <p className="mt-1 text-xs text-slate-500">
          文章から電話案内音声を作成できるようになります。VoiceBox サーバーが別途起動している必要があります。
          設定しなくても wav アップロードで音声は登録できます。
        </p>

        {vbSaved && (
          <div className="mt-3 flex items-center gap-2 text-xs">
            <span className="inline-block h-2 w-2 rounded-full bg-primary-500" />
            <span className="font-semibold text-primary-700">設定済み</span>
            {initialVb.url && <span className="text-slate-500">({initialVb.url})</span>}
            <button
              type="button"
              onClick={handleVbTest}
              disabled={vbBusy}
              className="ml-auto rounded border border-slate-300 px-2 py-0.5 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              テスト接続
            </button>
          </div>
        )}

        <div className="mt-3 space-y-2">
          <div className="flex gap-2">
            <label className="flex-1 text-xs text-slate-600">
              サーバー URL
              <input
                value={vbUrl}
                onChange={(e) => setVbUrl(e.target.value)}
                placeholder="http://127.0.0.1:3921"
                className="mt-1 w-full rounded border border-slate-300 px-2 py-1 font-mono text-xs"
              />
            </label>
            <div className="flex items-end">
              <button
                type="button"
                onClick={handleVbDetect}
                disabled={vbDetecting}
                className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {vbDetecting ? '検出中…' : '自動検出'}
              </button>
            </div>
          </div>
          <label className="block text-xs text-slate-600">
            トークン
            <input
              type="password"
              value={vbToken}
              onChange={(e) => setVbToken(e.target.value)}
              placeholder="VoiceBox の .env に設定した VOICEBOX_TOKEN"
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1 font-mono text-xs"
            />
          </label>
          <button
            type="button"
            onClick={handleVbSave}
            disabled={vbBusy || !vbUrl.trim()}
            className="rounded bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {vbBusy ? '保存中…' : '保存'}
          </button>
        </div>

        {vbError && <p className="mt-2 text-xs text-danger">{vbError}</p>}
        {vbTest && <TestBadge result={vbTest} />}
      </section>
    </div>
  );
}

function TestBadge({ result }: { result: { ok: boolean; message: string } }) {
  return (
    <p
      className={`mt-2 rounded px-2 py-1 text-xs ${
        result.ok
          ? 'border border-primary-200 bg-primary-50 text-primary-700'
          : 'border border-danger bg-danger-light text-danger'
      }`}
    >
      {result.ok ? '✓ ' : '✗ '}
      {result.message}
    </p>
  );
}
