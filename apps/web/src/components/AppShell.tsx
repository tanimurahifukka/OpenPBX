'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FlashBanner } from '@/components/FlashBanner';

type Role = 'user' | 'supervisor' | 'admin';

type StatusLevel = 'ok' | 'warn' | 'off';

export interface SystemStatus {
  ami: StatusLevel;
  commandRoom: StatusLevel;
  voiceBox: StatusLevel;
}

// href → which status key to show a dot for
const NAV_STATUS_MAP: Record<string, keyof SystemStatus> = {
  '/devices': 'ami',
  '/setup': 'commandRoom',
  '/guidances': 'voiceBox',
};

interface NavItem {
  href: string;
  label: string;
  minRole?: Role;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    title: 'メイン',
    items: [
      { href: '/', label: '概要' },
      { href: '/setup', label: 'セットアップ確認' },
      { href: '/devices', label: '端末状態' },
      { href: '/cdr', label: '履歴' },
      { href: '/recordings', label: '録音' },
      { href: '/concurrency', label: '同時通話' },
    ],
  },
  {
    title: '通話',
    items: [
      { href: '/softphone', label: 'ソフトフォン' },
    ],
  },
  {
    title: '設定',
    items: [
      { href: '/extensions', label: '端末管理' },
      { href: '/ring-groups', label: '着信グループ' },
      { href: '/pickup-groups', label: 'ピックアップ' },
      { href: '/phonebook', label: '電話帳' },
      { href: '/business-hours', label: '営業時間' },
      { href: '/ivr', label: 'IVR' },
      { href: '/guidances', label: 'ガイダンス' },
    ],
  },
  {
    title: 'Admin',
    items: [
      { href: '/audit', label: '監査', minRole: 'supervisor' },
      { href: '/network', label: 'ネットワーク', minRole: 'admin' },
      { href: '/trunks', label: '外線', minRole: 'admin' },
      { href: '/accounts', label: 'アカウント', minRole: 'admin' },
      { href: '/security', label: 'セキュリティ', minRole: 'admin' },
      { href: '/upgrades', label: 'Upgrade', minRole: 'admin' },
    ],
  },
];

const ROLE_LEVEL: Record<Role, number> = { user: 0, supervisor: 1, admin: 2 };

function canSee(itemMinRole: Role | undefined, userRole: Role): boolean {
  if (!itemMinRole) return true;
  return ROLE_LEVEL[userRole] >= ROLE_LEVEL[itemMinRole];
}

function isActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

interface MeProps {
  username: string;
  role: Role;
}

interface Props {
  me: MeProps;
  children: React.ReactNode;
  systemStatus?: SystemStatus | null;
}

export function AppShell({ me, children, systemStatus }: Props) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setDrawerOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 border-r border-white/10 bg-brand lg:flex lg:flex-col">
        <SidebarContent me={me} pathname={pathname} systemStatus={systemStatus} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-white/10 bg-brand px-4 py-3 text-white lg:hidden">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="メニューを開く"
            className="rounded p-1 text-white hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/80"
          >
            <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <Link href="/" className="text-base font-semibold tracking-tight hover:underline">
            OpenPBX
          </Link>
        </header>

        <Suspense fallback={null}>
          <FlashBanner />
        </Suspense>

        <main className="mx-auto w-full max-w-6xl px-4 py-6">{children}</main>
      </div>

      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label="メニューを閉じる"
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 bg-slate-900/50"
          />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-brand shadow-xl">
            <SidebarContent
              me={me}
              pathname={pathname}
              systemStatus={systemStatus}
              onNavigate={() => setDrawerOpen(false)}
              showCloseButton
              onClose={() => setDrawerOpen(false)}
            />
          </aside>
        </div>
      )}
    </div>
  );
}

interface ContentProps {
  me: MeProps;
  pathname: string | null;
  systemStatus?: SystemStatus | null;
  onNavigate?: () => void;
  showCloseButton?: boolean;
  onClose?: () => void;
}

const STATUS_DOT: Record<StatusLevel, string> = {
  ok: 'bg-green-400',
  warn: 'bg-banana',
  off: 'bg-white/30',
};

function SidebarContent({ me, pathname, systemStatus, onNavigate, showCloseButton, onClose }: ContentProps) {
  return (
    <>
      <div className="flex items-center justify-between border-b border-white/15 px-4 py-3 text-white">
        <Link
          href="/"
          onClick={onNavigate}
          className="rounded text-lg font-semibold tracking-tight hover:underline focus:outline-none focus:ring-2 focus:ring-white/80"
        >
          OpenPBX
        </Link>
        {showCloseButton && (
          <button
            type="button"
            onClick={onClose}
            aria-label="メニューを閉じる"
            className="rounded p-1 text-white/70 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/80"
          >
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>
      <nav aria-label="メインナビゲーション" className="flex-1 overflow-y-auto px-2 py-3">
        {NAV_GROUPS.map((g) => {
          const visibleItems = g.items.filter((i) => canSee(i.minRole, me.role));
          if (visibleItems.length === 0) return null;
          return (
            <div key={g.title} className="mb-3">
              <h3 className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-white/50">
                {g.title}
              </h3>
              <ul className="space-y-0.5">
                {visibleItems.map((item) => {
                  const statusKey = NAV_STATUS_MAP[item.href];
                  const level = statusKey && systemStatus ? systemStatus[statusKey] : undefined;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={onNavigate}
                        aria-current={isActive(pathname, item.href) ? 'page' : undefined}
                        className={`flex items-center justify-between rounded px-2 py-1.5 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-white/80 ${
                          isActive(pathname, item.href)
                            ? 'bg-white/20 font-semibold text-white'
                            : 'text-white/70 hover:bg-white/10 hover:text-white'
                        }`}
                      >
                        {item.label}
                        {level && (
                          <span
                            className={`inline-block h-1.5 w-1.5 rounded-full ${STATUS_DOT[level]}`}
                            aria-label={level === 'ok' ? '正常' : level === 'warn' ? '注意' : '未設定'}
                          />
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>
      <div className="border-t border-white/20 px-2 py-2">
        <Link
          href="/me"
          onClick={onNavigate}
          aria-current={pathname === '/me' ? 'page' : undefined}
          className={`block rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-white/80 ${
            pathname === '/me' ? 'bg-white/20 font-semibold text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'
          }`}
        >
          👤 {me.username}
        </Link>
      </div>
    </>
  );
}
