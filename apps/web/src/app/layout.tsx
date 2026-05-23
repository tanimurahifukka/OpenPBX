import type { Metadata } from 'next';
import { Suspense } from 'react';
import './globals.css';
import { getCurrentAccount } from '@/lib/auth';
import { FlashBanner } from '@/components/FlashBanner';
import { AppShell } from '@/components/AppShell';

export const metadata: Metadata = {
  title: 'OpenPBX',
  description: 'Asterisk ベース PBX (内線・IVR・録音) の設定ダッシュボード',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const me = await getCurrentAccount().catch(() => null);
  return (
    <html lang="ja">
      <body className="min-h-screen bg-slate-50 antialiased">
        {me ? (
          <AppShell me={{ username: me.username, role: me.role }}>{children}</AppShell>
        ) : (
          <>
            <Suspense fallback={null}>
              <FlashBanner />
            </Suspense>
            <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
          </>
        )}
      </body>
    </html>
  );
}
