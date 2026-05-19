import type { Metadata } from 'next';
import { Suspense } from 'react';
import './globals.css';
import { getCurrentAccount } from '@/lib/auth';
import { FlashBanner } from '@/components/FlashBanner';

export const metadata: Metadata = {
  title: 'Command Room PBX',
  description: 'Asterisk ベース PBX (内線・IVR・録音) の設定ダッシュボード',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const me = await getCurrentAccount().catch(() => null);
  return (
    <html lang="ja">
      <body className="min-h-screen antialiased">
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
            <a href="/" className="rounded text-lg font-semibold tracking-tight hover:underline focus:outline-none focus:ring-2 focus:ring-blue-500">
              Command Room PBX
            </a>
            <nav className="flex items-center gap-3 text-sm" aria-label="メインナビゲーション">
              <a className="rounded px-2 py-1 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500" href="/">
                概要
              </a>
              <a className="rounded px-2 py-1 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500" href="/devices">
                端末状態
              </a>
              <a className="rounded px-2 py-1 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500" href="/cdr">
                履歴
              </a>
              <a className="rounded px-2 py-1 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500" href="/recordings">
                録音
              </a>
              <a className="rounded px-2 py-1 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500" href="/concurrency">
                同時通話
              </a>
              <a className="rounded px-2 py-1 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500" href="/softphone">
                ソフトフォン
              </a>
              <a className="rounded px-2 py-1 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500" href="/triage">
                問診フロー
              </a>
              <a className="rounded px-2 py-1 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500" href="/extensions">
                端末管理
              </a>
              <a className="rounded px-2 py-1 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500" href="/ring-groups">
                着信グループ
              </a>
              <a className="rounded px-2 py-1 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500" href="/pickup-groups">
                ピックアップ
              </a>
              <a className="rounded px-2 py-1 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500" href="/phonebook">
                電話帳
              </a>
              <a className="rounded px-2 py-1 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500" href="/business-hours">
                営業時間
              </a>
              <a className="rounded px-2 py-1 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500" href="/ivr">
                IVR
              </a>
              <a className="rounded px-2 py-1 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500" href="/guidances">
                ガイダンス
              </a>
              {me && (me.role === 'admin' || me.role === 'supervisor') && (
                <a className="rounded px-2 py-1 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500" href="/audit">
                  監査
                </a>
              )}
              {me?.role === 'admin' && (
                <>
                  <a className="rounded px-2 py-1 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500" href="/network">
                    ネットワーク
                  </a>
                  <a className="rounded px-2 py-1 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500" href="/trunks">
                    外線
                  </a>
                  <a className="rounded px-2 py-1 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500" href="/accounts">
                    アカウント
                  </a>
                  <a className="rounded px-2 py-1 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500" href="/security">
                    セキュリティ
                  </a>
                  <a className="rounded px-2 py-1 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500" href="/upgrades">
                    Upgrade
                  </a>
                </>
              )}
              {me && (
                <a className="ml-2 rounded px-2 py-1 text-slate-500 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500" href="/me">
                  👤 {me.username}
                </a>
              )}
            </nav>
          </div>
        </header>
        <Suspense fallback={null}>
          <FlashBanner />
        </Suspense>
        <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
