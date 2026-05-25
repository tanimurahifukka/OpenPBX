// 「はじめての設定 / 状態チェック」画面。
//
// UX レビュー (40代女性ペルソナ) の方針:
// - README に頼らず、Web から「いま何が動いていて、何が未設定か」を一目で
// - 各チェックは「正常 / 確認が必要 / 未設定」の 3 状態
// - 失敗には必ず「次に確認すること」を 1〜3 行で添える
// - 技術用語 (AMI / SIP / RTP / outbox) は補足として詳細欄に出す

import fs from 'node:fs/promises';
import { requireAccount, listAccounts } from '@/lib/auth';
import { amiClient, amiIsReady } from '@/lib/ami';
import { describeMissingEmitConfig } from '@/lib/events/v1/emit';
import { CopyDiagnosticButton } from './_components/CopyDiagnosticButton';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const INBOX_DIR = process.env.INBOX_DIR ?? '/app/data/inbox';
const RECORDINGS_DIR = process.env.RECORDINGS_DIR ?? '/app/data/recordings';
const OUTBOX_DIR = process.env.EVENT_OUTBOX_V1_DIR ?? '/app/data/outbox-v1';

type Tone = 'ok' | 'warning' | 'error' | 'info';

/**
 * audience:
 *   self  = 受付・事務スタッフ自身が画面上で確認できる項目
 *   admin = 詳しい人 (.env / docker / port 開放) でないと直せない項目
 *
 * UX レビュー pass-2: setup を「あなたが確認すること」と「詳しい人に依頼
 * すること」の 2 セクションに分け、自分で直せないものはまず管理者に依頼
 * させる導線にする。
 */
type Audience = 'self' | 'admin';

interface CheckResult {
  label: string;
  tone: Tone;
  statusLabel: string;
  message: string;
  audience: Audience;
  nextActions?: string[];
  technical?: string;
}

async function checkLoginWorks(): Promise<CheckResult> {
  // 「自分がログインできた」は requireAccount() を通って本ページが表示されている
  // 時点で自明に true。受付スタッフへのフィードバックとしてここに出す。
  return {
    label: 'ログインできています',
    tone: 'ok',
    statusLabel: 'OK',
    message: 'この画面が見えていれば、管理画面へのログインは正常です。',
    audience: 'self',
  };
}

async function checkAdminAccount(): Promise<CheckResult> {
  const accounts = listAccounts();
  const admins = accounts.filter((a) => a.role === 'admin');
  if (admins.length === 0) {
    return {
      label: '管理者アカウント',
      tone: 'error',
      statusLabel: '未作成',
      message: '管理者アカウントが 1 つもありません。Web にログインできません。',
      audience: 'admin',
      nextActions: [
        '.env の BOOTSTRAP_ADMIN_PASSWORD を 8 文字以上で設定してください。',
        'docker compose restart web で再起動すると初期 admin が作成されます。',
      ],
    };
  }
  return {
    label: '管理者アカウント',
    tone: 'ok',
    statusLabel: `${admins.length} 件`,
    message: '管理者アカウントが登録されています。',
    audience: 'self',
    technical: admins.map((a) => `@${a.username}`).join(', '),
  };
}

function checkAmi(): CheckResult {
  amiClient();
  if (amiIsReady()) {
    return {
      label: '電話システム (Asterisk AMI)',
      tone: 'ok',
      statusLabel: '接続中',
      message: 'PBX 本体と管理画面の連携は動いています。',
      audience: 'self',
    };
  }
  return {
    label: '電話システム (Asterisk AMI)',
    tone: 'warning',
    statusLabel: '応答待ち',
    message:
      '電話システムと管理画面の合言葉での接続を待っています。' +
      ' 自分では直せないので、詳しい人に下の項目を確認してもらってください。',
    audience: 'admin',
    nextActions: [
      'docker compose ps で asterisk container が Up になっているか確認',
      '.env の AMI_SECRET が manager.conf 側と一致しているか',
      'docker compose logs asterisk で起動エラーが無いか',
    ],
    technical: 'Asterisk Manager Interface (AMI) is not connected yet.',
  };
}

async function checkDir(
  label: string,
  dir: string,
  hint: string,
  audience: Audience = 'admin',
): Promise<CheckResult> {
  try {
    const stat = await fs.stat(dir);
    if (!stat.isDirectory()) {
      return {
        label,
        tone: 'error',
        statusLabel: 'ファイルあり',
        message: `${dir} がディレクトリではありません。`,
        audience: 'admin',
        nextActions: ['同名のファイルが存在しています。削除してから再起動してください。'],
      };
    }
    return {
      label,
      tone: 'ok',
      statusLabel: '存在',
      message: hint,
      audience,
      technical: dir,
    };
  } catch {
    return {
      label,
      tone: 'warning',
      statusLabel: '未作成',
      message: `${dir} がまだ作成されていません。最初のイベント発生時に自動作成されます。`,
      audience,
      technical: dir,
    };
  }
}

function checkCookieSecure(): CheckResult {
  const flag = process.env.COOKIE_SECURE === '1';
  return {
    label: 'cookie secure (HTTPS 配信)',
    tone: flag ? 'ok' : 'info',
    statusLabel: flag ? '有効' : '未設定',
    message: flag
      ? 'HTTPS 経由でしか cookie が送信されません。HTTPS リバプロが必要です。'
      : 'LAN HTTP MVP 想定。HTTPS 公開する場合のみ .env で COOKIE_SECURE=1 を設定してください。',
    audience: 'admin',
    technical: `COOKIE_SECURE=${process.env.COOKIE_SECURE ?? '(unset)'}`,
  };
}

function checkCommandRoomLink(): CheckResult {
  const missing = describeMissingEmitConfig();
  if (missing.length === 0) {
    return {
      label: 'command-room 連携',
      tone: 'ok',
      statusLabel: '接続設定済み',
      message: '対応カードへの送信が有効です。',
      audience: 'self',
    };
  }
  return {
    label: 'command-room 連携',
    tone: 'info',
    statusLabel: '未設定',
    message:
      'command-room に通話記録を送る場合は、接続設定ページから設定してください。' +
      ' command-room の管理者に「接続コード」を発行してもらい、貼り付けるだけで完了します。' +
      ' 設定しなくても OpenPBX 単体で内線・IVR・録音は使えます。',
    audience: 'self',
    nextActions: [
      '接続設定ページ (/setup/connections) を開く',
      'command-room 管理者に接続コードを発行してもらう',
      '接続コードを貼り付けて「テスト接続」で確認',
    ],
  };
}

function checkVoiceBox(): CheckResult {
  let configured = false;
  try {
    const { getVoiceBoxConfig } = require('@/lib/settings') as typeof import('@/lib/settings');
    configured = getVoiceBoxConfig().configured;
  } catch { /* settings not available */ }
  if (configured) {
    return {
      label: '音声作成 (VoiceBox)',
      tone: 'ok',
      statusLabel: '設定済み',
      message: '/guidances で文章から電話案内音声を作成できます。',
      audience: 'self',
    };
  }
  return {
    label: '音声作成 (VoiceBox)',
    tone: 'info',
    statusLabel: '未設定',
    message:
      '文章から電話案内音声を作りたい場合は、接続設定ページから VoiceBox を設定してください。' +
      ' 設定しなくても wav アップロードで音声は登録できます。',
    audience: 'self',
    nextActions: [
      '接続設定ページ (/setup/connections) を開く',
      'VoiceBox サーバーの URL とトークンを入力 (自動検出もあります)',
    ],
  };
}

function checkPorts(): CheckResult {
  // dev 環境では port を直接 ping できないので、設定上どのポートを expose しているかだけ
  // 表示する。OS レベルの port listen 確認は別ツール (curl / ss / netstat) で。
  return {
    label: 'SIP / RTP ポート',
    tone: 'info',
    audience: 'admin' as Audience,
    statusLabel: '確認はホスト側で',
    message:
      'SIP signaling 5060/UDP+TCP と RTP media 10000-10020/UDP が開いている必要があります。',
    nextActions: [
      '電話は鳴っても音が聞こえない場合は 10000-10020/UDP を確認してください。',
      'まったく着信しない場合は 5060/UDP + 5060/TCP を確認してください。',
      'docker compose ps で asterisk container のポートが publish されているか確認',
    ],
  };
}

const TONE_STYLES: Record<Tone, { badge: string; border: string }> = {
  ok: { badge: 'bg-emerald-100 text-emerald-900', border: 'border-emerald-200' },
  warning: { badge: 'bg-amber-100 text-amber-900', border: 'border-amber-200' },
  error: { badge: 'bg-red-100 text-red-900', border: 'border-red-200' },
  info: { badge: 'bg-slate-100 text-slate-900', border: 'border-slate-200' },
};

export default async function SetupPage() {
  await requireAccount();
  const checks: CheckResult[] = await Promise.all([
    checkLoginWorks(),
    checkAdminAccount(),
    Promise.resolve(checkCommandRoomLink()),
    Promise.resolve(checkVoiceBox()),
    Promise.resolve(checkAmi()),
    checkDir('録音フォルダ', RECORDINGS_DIR, '録音 wav はここに保存されます (ローカルのみ)。', 'self'),
    checkDir('受信ボックス (inbox)', INBOX_DIR, 'Asterisk から外部統合層への引き渡し場所。', 'admin'),
    checkDir('送信ボックス (outbox-v1)', OUTBOX_DIR, 'command-room への送信待ちイベントが並びます。', 'admin'),
    Promise.resolve(checkCookieSecure()),
    Promise.resolve(checkPorts()),
  ]);

  const selfChecks = checks.filter((c) => c.audience === 'self');
  const adminChecks = checks.filter((c) => c.audience === 'admin');

  const totalErrors = checks.filter((c) => c.tone === 'error').length;
  const totalWarnings = checks.filter((c) => c.tone === 'warning').length;

  // 「詳しい人に送る」用の診断テキスト。secret / token は含めない。
  // クリップボード API は別 Client Component で対応 (本 PR はテキスト表示のみ)。
  const diagnosticText = buildDiagnosticText(checks);

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h2 className="text-lg font-semibold">はじめての設定 / 状態チェック</h2>
        <p className="text-xs text-slate-500">
          OpenPBX が動くために必要な項目をまとめています。
          上半分はあなた自身が画面上で確認できる項目、下半分は詳しい人 (管理者) に
          依頼が必要な項目です。
        </p>
        {totalErrors > 0 ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
            <span className="font-semibold">⚠️ 解消が必要な項目が {totalErrors} 件あります。</span>{' '}
            下のリストで「次に確認すること」を見てください。
          </div>
        ) : totalWarnings > 0 ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <span className="font-semibold">注意: 確認が必要な項目が {totalWarnings} 件あります。</span>{' '}
            電話は動きますが、設定を見直すと安定します。
          </div>
        ) : (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            <span className="font-semibold">✅ 主要な項目はすべて OK です。</span>
          </div>
        )}
      </header>

      <div className="flex flex-wrap gap-2">
        <a
          href="/setup/connections"
          className="rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
        >
          接続設定
        </a>
      </div>

      <CheckList
        title="あなたが確認すること"
        description="この画面で見れば分かる項目です。"
        items={selfChecks}
      />

      <CheckList
        title="詳しい人に依頼すること"
        description="docker / .env / ネットワークなど、サーバー設定が必要な項目です。下のテキストを管理者に送ってください。"
        items={adminChecks}
      />

      <section className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <p className="font-semibold text-slate-700">📋 詳しい人に送る診断情報</p>
          <CopyDiagnosticButton text={diagnosticText} />
        </div>
        <p className="text-slate-600">
          以下のテキストには接続キー / パスワード / 録音内容は含まれていません。
          上の「コピー」ボタンを押すか、テキストを手動で選択して管理者に送ってください。
        </p>
        <pre className="max-h-64 overflow-auto rounded bg-white p-3 font-mono text-[11px] text-slate-800">
{diagnosticText}
        </pre>
      </section>

      <footer className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
        <p className="font-semibold">📝 この画面のステータスは現在のコンテナ状態を反映します。</p>
        <p className="mt-1">
          再起動や設定変更の後はリロードしてください。
        </p>
      </footer>
    </div>
  );
}

function CheckList({
  title,
  description,
  items,
}: {
  title: string;
  description: string;
  items: CheckResult[];
}) {
  if (items.length === 0) return null;
  return (
    <section className="space-y-2">
      <header>
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        <p className="text-xs text-slate-500">{description}</p>
      </header>
      <ol className="space-y-3" aria-label={title}>
        {items.map((c, i) => {
          const s = TONE_STYLES[c.tone];
          return (
            <li
              key={i}
              className={`rounded-lg border ${s.border} bg-white p-4 space-y-2`}
            >
              <div className="flex items-center justify-between gap-3">
                <h4 className="text-sm font-semibold">
                  <span className="mr-2 text-slate-400">{i + 1}.</span>
                  {c.label}
                </h4>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${s.badge}`}>
                  {c.statusLabel}
                </span>
              </div>
              <p className="text-xs text-slate-700">{c.message}</p>
              {c.nextActions && c.nextActions.length > 0 && (
                <div className="rounded bg-slate-50 px-3 py-2 text-xs text-slate-800">
                  <p className="font-semibold text-slate-700">次に確認すること:</p>
                  <ol className="mt-1 list-decimal pl-5 space-y-0.5">
                    {c.nextActions.map((a, j) => (
                      <li key={j}>{a}</li>
                    ))}
                  </ol>
                </div>
              )}
              {c.technical && (
                <details className="text-[10px] text-slate-500">
                  <summary className="cursor-pointer">技術詳細</summary>
                  <code className="mt-1 block whitespace-pre-wrap font-mono">{c.technical}</code>
                </details>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

// 「詳しい人に送る」用の診断テキスト。
// 含めて良いもの: チェック結果のラベル / 状態 / 技術詳細 (env 名 / dir パス)。
// 含めてはいけないもの: 接続キー / token / パスワード / 録音内容 / 電話番号。
// 上の checkXxx 関数の technical 欄も「env 名」「dir パス」だけにしてあり、値は含めない設計。
function buildDiagnosticText(checks: CheckResult[]): string {
  const lines: string[] = [];
  lines.push(`# OpenPBX 診断情報 (${new Date().toISOString()})`);
  lines.push('');
  for (const c of checks) {
    lines.push(`## ${c.label}: ${c.statusLabel} (${c.tone})`);
    lines.push(c.message);
    if (c.nextActions && c.nextActions.length > 0) {
      lines.push('次に確認すること:');
      for (const a of c.nextActions) lines.push(`  - ${a}`);
    }
    if (c.technical) lines.push(`technical: ${c.technical}`);
    lines.push('');
  }
  lines.push('---');
  lines.push('* このテキストには接続キー / token / パスワードは含まれていません。');
  return lines.join('\n');
}
