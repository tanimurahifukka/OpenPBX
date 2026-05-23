import path from 'node:path';
import fs from 'node:fs/promises';
import { listExtensions } from '@/lib/extensions';
import { listDevices, amiClient, amiIsReady } from '@/lib/ami';
import { requireAccount } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const RECORDINGS_DIR = process.env.RECORDINGS_DIR ?? '/app/data/recordings';
const INBOX_DIR = process.env.INBOX_DIR ?? '/app/data/inbox';
const PJSIP_OUT_DIR = process.env.PJSIP_OUT_DIR ?? '/asterisk/pjsip.d';

async function countFiles(dir: string, pattern?: RegExp): Promise<number> {
  try {
    const entries = await fs.readdir(dir);
    return pattern ? entries.filter((e) => pattern.test(e)).length : entries.length;
  } catch {
    return -1; // ディレクトリが見えない (権限/未マウント)
  }
}

async function mtime(filePath: string): Promise<string | null> {
  try {
    const st = await fs.stat(filePath);
    return st.mtime.toISOString();
  } catch {
    return null;
  }
}

export default async function OverviewPage() {
  await requireAccount();
  amiClient(); // 起動 (lazy)
  const extensions = listExtensions();
  const devices = listDevices().filter((d) => d.device.startsWith('PJSIP/') && d.extension);
  const amiReady = amiIsReady();
  const online = devices.filter((d) => d.reachable === true || d.state === 'not_inuse' || d.state === 'inuse').length;
  const [inboxWavs, inboxMetas, pjsipMtime] = await Promise.all([
    countFiles(INBOX_DIR, /\.wav$/),
    countFiles(INBOX_DIR, /\.meta\.json$/),
    mtime(path.join(PJSIP_OUT_DIR, 'extensions.conf')),
  ]);

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-lg font-semibold">PBX 概要</h2>
        <p className="text-xs text-slate-500">
          Asterisk ベース PBX の状態と設定への入り口。文字起こし・要約などの AI 処理は別システム
          (sibling repo) が <code className="rounded bg-slate-100 px-1">data/inbox/</code>{' '}
          を監視して処理します。
        </p>
      </header>

      <section aria-label="サマリー" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card label="登録済み内線" value={`${extensions.length}`} href="/extensions" />
        <Card
          label="オンライン端末"
          value={`${online} / ${devices.length}`}
          href="/devices"
          hint={amiReady ? 'AMI 接続中' : 'AMI 未接続'}
        />
        <Card label="Inbox wav" value={fmtCount(inboxWavs)} hint="未受領 / 待機" />
        <Card label="Inbox meta" value={fmtCount(inboxMetas)} hint="event JSON" />
      </section>
      <div className="text-xs text-slate-400">
        最終 pjsip 更新: {pjsipMtime ? new Date(pjsipMtime).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }) : '-'}
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="mb-2 text-sm font-semibold text-slate-700">接続情報</h3>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="text-slate-500">SIP signaling</dt>
          <dd className="font-mono">&lt;Mac IP&gt;:5060 (UDP/TCP)</dd>
          <dt className="text-slate-500">RTP media</dt>
          <dd className="font-mono">10000-10020/udp</dd>
          <dt className="text-slate-500">特番</dt>
          <dd className="font-mono">9000 (IVR) / 9001 (営業窓口) / 9002 (折返し依頼)</dd>
          <dt className="text-slate-500">Inbox</dt>
          <dd className="font-mono">{INBOX_DIR}</dd>
          <dt className="text-slate-500">録音</dt>
          <dd className="font-mono">{RECORDINGS_DIR}</dd>
          <dt className="text-slate-500">pjsip.d</dt>
          <dd className="font-mono">{PJSIP_OUT_DIR}</dd>
        </dl>
        <p className="mt-2 text-xs text-slate-500">
          Mac の IP は <code className="rounded bg-slate-100 px-1">ifconfig | grep &quot;inet &quot; | grep -v 127</code> で確認できます。
        </p>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="mb-2 text-sm font-semibold text-slate-700">登録済み内線 ({extensions.length})</h3>
        {extensions.length === 0 ? (
          <p className="text-sm text-slate-500">内線がまだ登録されていません。</p>
        ) : (
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {extensions.map((e) => (
              <li
                key={e.number}
                className="flex items-baseline gap-3 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
              >
                <span className="font-mono text-base font-semibold">{e.number}</span>
                <span className="truncate text-slate-700">{e.displayName ?? '-'}</span>
                {e.note && <span className="ml-auto text-xs text-slate-500">{e.note}</span>}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs">
          <a className="text-blue-600 hover:underline" href="/extensions">
            → 端末を追加・編集する
          </a>
        </p>
      </section>

      <footer className="text-xs text-slate-400">
        AI 統合層 (文字起こし / 要約 / チケット UI) は <code>../command-room-ai/</code> を参照。
      </footer>
    </div>
  );
}

function Card({
  label,
  value,
  href,
  hint,
  small,
}: {
  label: string;
  value: string;
  href?: string;
  hint?: string;
  small?: boolean;
}) {
  const inner = (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={small ? 'mt-1 text-sm font-semibold tabular-nums' : 'mt-1 text-2xl font-bold tabular-nums'}>
        {value}
      </div>
      {hint && <div className="text-[10px] text-slate-400">{hint}</div>}
    </div>
  );
  return href ? (
    <a href={href} className="block hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500">
      {inner}
    </a>
  ) : (
    inner
  );
}

function fmtCount(n: number): string {
  if (n < 0) return '-';
  return `${n}`;
}
