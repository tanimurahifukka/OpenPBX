'use client';

import { useState } from 'react';

interface Props {
  /** クリップボードに書き込むテキスト。secret / token を含まない前提。 */
  text: string;
}

// 診断テキストをクリップボードにコピーする小さなボタン。
// 失敗 (古いブラウザ / 権限拒否) のとき: textarea の select() に fallback。
// ux-glossary.md §10 の「詳しい人に送る」UX を実装する。
export function CopyDiagnosticButton({ text }: Props) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'error'>('idle');

  async function handleCopy() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        setStatus('copied');
      } else {
        // fallback for non-https / older browsers
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        setStatus(ok ? 'copied' : 'error');
      }
    } catch {
      setStatus('error');
    }
    setTimeout(() => setStatus('idle'), 3000);
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleCopy}
        className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-primary-400"
      >
        📋 診断情報をコピー
      </button>
      {status === 'copied' && (
        <span role="status" className="text-xs font-semibold text-primary-600">
          ✓ コピーしました
        </span>
      )}
      {status === 'error' && (
        <span role="alert" className="text-xs font-semibold text-danger">
          コピーに失敗しました。下の文章を手動でコピーしてください。
        </span>
      )}
    </div>
  );
}
