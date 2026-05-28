'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, usePathname, useRouter } from 'next/navigation';

// URL の ?err=... / ?ok=... を読んで上部にバナー表示し、3 秒後に自動で消す。
// レイアウト直下に <FlashBanner /> を置けば全ページで効く。
export function FlashBanner() {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  useEffect(() => {
    const e = params.get('err');
    const o = params.get('ok');
    if (!e && !o) {
      setErr(null);
      setOk(null);
      return;
    }
    setErr(e);
    setOk(o);
    // URL からクエリを除去
    const t = setTimeout(() => {
      const next = new URLSearchParams(params.toString());
      next.delete('err');
      next.delete('ok');
      const q = next.toString();
      router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
    }, 4000);
    return () => clearTimeout(t);
  }, [params, pathname, router]);

  if (!err && !ok) return null;
  const errHint = err ? suggestNextAction(err) : null;
  return (
    <div className="sticky top-12 z-20 mx-auto max-w-5xl px-4">
      {err && (
        <div
          role="alert"
          className="mt-2 rounded border border-danger bg-danger-light px-3 py-2 text-sm text-danger-dark shadow-sm"
        >
          <div className="flex items-start gap-2">
            <span aria-hidden>⚠️</span>
            <div className="flex-1">
              <p>{err}</p>
              {errHint && (
                <p className="mt-1 text-xs text-danger">
                  <span className="font-semibold">次に確認すること: </span>
                  {errHint}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
      {ok && (
        <div
          role="status"
          className="mt-2 rounded border border-primary-300 bg-primary-50 px-3 py-2 text-sm text-primary-700 shadow-sm"
        >
          <span aria-hidden>✅ </span>
          {ok}
        </div>
      )}
    </div>
  );
}

// エラーメッセージから「次の行動」を推定する。
// CLAUDE.md UX レビュー: 赤いエラーだけで終わらせず、必ず次の行動を出す。
// マッチしないエラーには汎用ヒント。
function suggestNextAction(message: string): string | null {
  const m = message.toLowerCase();
  if (m.includes('unauthorized') || m.includes('ログイン')) {
    return 'ログインし直してください。';
  }
  if (m.includes('forbidden') || m.includes('権限')) {
    return 'この操作の権限が無い可能性があります。管理者に依頼してください。';
  }
  if (m.includes('ロック') || m.includes('lock')) {
    return '15 分待ってから再度ログインしてください。';
  }
  if (m.includes('パスワード')) {
    return '英数 + 8 文字以上で再入力してください。';
  }
  if (m.includes('番号') || m.includes('内線')) {
    return '番号の形式 (2〜6 桁の数字) を確認してください。';
  }
  if (m.includes('secret') || m.includes('改行')) {
    return '改行・空白・セミコロンを含まない値で再入力してください。';
  }
  if (m.includes('reload') || m.includes('asterisk')) {
    return 'Asterisk が起動しているか、共有ボリュームの権限が正しいか確認してください。';
  }
  if (m.includes('command-room') || m.includes('event_push') || m.includes('送信')) {
    return 'CHIPS の URL / device-token / ネットワーク到達性を確認してください。';
  }
  // 汎用フォールバック
  return '同じ操作をもう一度試して、解消しない場合は管理者に画面のスクリーンショットを送ってください。';
}
