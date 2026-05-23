import os from 'node:os';
import { requireRole } from '@/lib/auth';
import { getNetworkSettings } from '@/lib/network';
import { updateNetworkAction } from '@/app/actions';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function listLocalIps(): Array<{ iface: string; address: string }> {
  const out: Array<{ iface: string; address: string }> = [];
  const ifs = os.networkInterfaces();
  for (const [name, list] of Object.entries(ifs)) {
    if (!list) continue;
    for (const a of list) {
      if (a.family === 'IPv4' && !a.internal) out.push({ iface: name, address: a.address });
    }
  }
  return out;
}

export default async function NetworkPage() {
  await requireRole('admin');
  const net = getNetworkSettings();
  const ips = listLocalIps();
  // Tailscale IP は 100.64.0.0/10 範囲
  const tailscaleCandidates = ips.filter((i) => {
    const first = Number(i.address.split('.')[0]);
    const second = Number(i.address.split('.')[1]);
    return first === 100 && second >= 64 && second <= 127;
  });

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-lg font-semibold">ネットワーク / 外線アドレス</h2>
        <p className="text-xs text-slate-500">
          Tailscale / WAN / リバプロ越しに内線を登録させるとき、Asterisk が返す Contact ヘッダや
          RTP メディアアドレスを正しい外部 IP に書き換える必要があります。ここで設定すると{' '}
          <code className="rounded bg-slate-100 px-1">pjsip.d/transports.conf</code> に反映されます。
        </p>
      </header>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="mb-2 text-sm font-semibold text-slate-700">この container から見える IPv4</h3>
        {ips.length === 0 ? (
          <p className="text-sm text-slate-500">IPv4 アドレスが見つかりません。</p>
        ) : (
          <ul className="grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
            {ips.map((i) => (
              <li key={`${i.iface}-${i.address}`} className="flex gap-3">
                <span className="w-24 font-mono text-slate-500">{i.iface}</span>
                <span className="font-mono">{i.address}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-slate-500">
          ※ Docker container 内から見える IP です。Tailscale をホスト Mac で動かしている場合、
          ここには 100.x.x.x が直接出ません。`tailscale ip -4` で取得した値を下記に入力してください。
        </p>
        {tailscaleCandidates.length > 0 && (
          <p className="mt-2 text-xs text-emerald-700">
            Tailscale 候補 (100.64.0.0/10):{' '}
            {tailscaleCandidates.map((i) => i.address).join(', ')}
          </p>
        )}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">外部アドレス設定</h3>
        <form action={updateNetworkAction} className="space-y-3">
          <label className="block text-xs text-slate-600">
            External Media Address (RTP) — Tailscale IP / WAN グローバル IP
            <input
              name="externalIp"
              defaultValue={net.externalIp ?? ''}
              placeholder="例: 100.64.1.23 / 203.0.113.5"
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1 font-mono text-sm"
            />
          </label>
          <label className="block text-xs text-slate-600">
            External Signaling Address (SIP) — 通常は上と同じ
            <input
              name="externalSignalingIp"
              defaultValue={net.externalSignalingIp ?? ''}
              placeholder="例: 100.64.1.23"
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1 font-mono text-sm"
            />
          </label>
          <label className="block text-xs text-slate-600">
            Local Net (NAT 書換を止める CIDR、通常は空欄)
            <input
              name="localNet"
              defaultValue={net.localNet ?? ''}
              placeholder="Docker Desktop では空欄推奨"
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1 font-mono text-sm"
            />
          </label>
          <p className="text-[11px] text-slate-500">
            Mac の Docker Desktop で動かす場合、スマホや Tailnet の CIDR を Local Net に入れると
            外部アドレスへの書換が止まり、通話や登録が不安定になります。Asterisk が直接そのネットワークに
            到達できる構成だけ指定してください。
          </p>
          <button
            type="submit"
            className="rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white"
          >
            保存 + Asterisk reload
          </button>
        </form>
        <p className="mt-3 text-[11px] text-slate-500">
          最終更新: <span className="font-mono">{net.updatedAt || '—'}</span>
        </p>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="mb-2 text-sm font-semibold text-slate-700">Tailscale で内線を使う手順</h3>
        <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-700">
          <li>ホスト Mac に Tailscale をインストールしログイン (<code>brew install --cask tailscale</code>)</li>
          <li>Tailscale 管理画面で同じ Tailnet に内線で使う端末 (iPhone / Android / Mac / Linux) を追加</li>
          <li>ホスト Mac で <code>tailscale ip -4</code> を実行して 100.x.x.x の IP を取得</li>
          <li>その IP を上の「External Media Address」「External Signaling Address」に入力 → 保存</li>
          <li>Local Net は空欄のまま保存する。Docker Desktop では Tailnet / LAN の CIDR を入れない</li>
          <li>
            Groundwire / Linphone / Zoiper など SIP クライアントの Server 欄に Tailscale IP を指定
            (Port は 5060)。Tailnet に同じ端末が居れば、外出先からでもそのまま内線として使えます。
          </li>
        </ol>
        <p className="mt-2 text-[11px] text-slate-500">
          ※ Docker on Mac でホストの Tailscale IP に 5060 を bind するには、`docker-compose.yml` の{' '}
          ports `&quot;5060:5060/udp&quot;` を `&quot;0.0.0.0:5060:5060/udp&quot;` (デフォルト) のまま
          にしておけば、ホスト経由で受けられます。
        </p>
      </section>
    </div>
  );
}
