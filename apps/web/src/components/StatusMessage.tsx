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
  ok:    { border: 'border-success/30',  bg: 'bg-success-light', text: 'text-success-dark', icon: '✓' },
  warn:  { border: 'border-warning/30',  bg: 'bg-warning-light', text: 'text-warning-dark', icon: '!' },
  error: { border: 'border-danger/30',   bg: 'bg-danger-light',  text: 'text-danger-dark',  icon: '✗' },
  info:  { border: 'border-gray-200',    bg: 'bg-gray-50',       text: 'text-gray-700',     icon: 'i' },
  off:   { border: 'border-gray-200',    bg: 'bg-gray-50',       text: 'text-gray-500',     icon: '○' },
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
              className="rounded bg-primary px-2.5 py-1 text-xs font-semibold text-white hover:bg-primary-500"
            >
              {action.label}
            </Link>
          )}
          {showAdminEscalation && (
            <Link
              href="/setup#diagnostics"
              className="rounded border border-gray-300 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-100"
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
