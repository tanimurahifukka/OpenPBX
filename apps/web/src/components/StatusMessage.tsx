// 統一エラー/未設定/正常メッセージコンポーネント。
//
// 全画面で同じフォーマット:
//   アイコン + 状態名 + 1 行説明 + ボタン (自分で直せる or 管理者に送る)
//
// .env / docker / contract / schema などの技術用語はこの中に書かない。

import Link from 'next/link';

export type StatusTone = 'ok' | 'warn' | 'error' | 'info' | 'off';

interface StatusMessageProps {
  tone: StatusTone;
  title: string;
  description: string;
  /** 自分で直せるアクション (ページ遷移など) */
  action?: { label: string; href: string };
  /** 管理者に送るボタンを出す */
  showAdminEscalation?: boolean;
}

const TONE_STYLES: Record<StatusTone, { border: string; bg: string; text: string; icon: string }> = {
  ok:    { border: 'border-brand-200',      bg: 'bg-brand-50',      text: 'text-brand-700',      icon: '✓' },
  warn:  { border: 'border-banana-200',     bg: 'bg-banana-50',     text: 'text-banana-500',     icon: '!' },
  error: { border: 'border-melon-200',      bg: 'bg-melon-50',      text: 'text-melon-600',      icon: '✗' },
  info:  { border: 'border-slate-200',      bg: 'bg-slate-50',      text: 'text-slate-700',      icon: 'i' },
  off:   { border: 'border-slate-200',      bg: 'bg-slate-50',      text: 'text-slate-500',      icon: '○' },
};

export function StatusMessage({ tone, title, description, action, showAdminEscalation }: StatusMessageProps) {
  const s = TONE_STYLES[tone];
  return (
    <div className={`rounded-md border ${s.border} ${s.bg} px-3 py-2 text-xs ${s.text}`}>
      <p className="flex items-center gap-1.5">
        <span
          className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-current text-[9px] font-bold leading-none"
          aria-hidden="true"
        >
          {s.icon}
        </span>
        <span className="font-semibold">{title}</span>
      </p>
      <p className="mt-1 pl-[22px]">{description}</p>
      {(action || showAdminEscalation) && (
        <div className="mt-2 flex flex-wrap gap-2 pl-[22px]">
          {action && (
            <Link
              href={action.href}
              className="rounded bg-brand px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-brand-500"
            >
              {action.label}
            </Link>
          )}
          {showAdminEscalation && (
            <Link
              href="/setup#diagnostics"
              className="rounded border border-slate-300 px-2.5 py-1 text-[11px] text-slate-700 hover:bg-white"
            >
              管理者に診断情報を送る
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

// ---- Convenience wrappers ----

export function UnconfiguredMessage({
  feature,
  description,
  setupHref = '/setup/connections',
  setupLabel = '接続設定を開く',
}: {
  feature: string;
  description: string;
  setupHref?: string;
  setupLabel?: string;
}) {
  return (
    <StatusMessage
      tone="off"
      title={`${feature} は未設定です`}
      description={description}
      action={{ label: setupLabel, href: setupHref }}
    />
  );
}

export function UnreachableMessage({
  feature,
  description,
}: {
  feature: string;
  description: string;
}) {
  return (
    <StatusMessage
      tone="error"
      title={`${feature} に接続できません`}
      description={description}
      action={{ label: '接続設定を確認する', href: '/setup/connections' }}
      showAdminEscalation
    />
  );
}
