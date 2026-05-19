// 外部 IP / NAT 設定 (Tailscale や WAN グローバル IP を Web から設定)。
// PJSIP の transport セクションに external_media_address / external_signaling_address /
// local_net を埋め込んで、リモート (Tailscale や WAN) からの登録時に正しい
// メディアアドレスを返せるようにする。

import { getDb } from './db';

export interface NetworkSettings {
  externalIp: string | null;          // RTP メディアの外向きアドレス
  externalSignalingIp: string | null; // SIP signaling の外向きアドレス
  localNet: string | null;             // NAT を通さない CIDR (カンマ区切り可)
  updatedAt: string;
}

interface Row {
  external_ip: string | null;
  external_signaling_ip: string | null;
  local_net: string | null;
  updated_at: string;
}

export function getNetworkSettings(): NetworkSettings {
  const r = getDb()
    .prepare(
      'SELECT external_ip, external_signaling_ip, local_net, updated_at FROM network_settings WHERE id = 1',
    )
    .get() as Row | undefined;
  if (!r) {
    return { externalIp: null, externalSignalingIp: null, localNet: null, updatedAt: '' };
  }
  return {
    externalIp: r.external_ip,
    externalSignalingIp: r.external_signaling_ip,
    localNet: r.local_net,
    updatedAt: r.updated_at,
  };
}

const IP_RE = /^(?:\d{1,3}\.){3}\d{1,3}$/;
const CIDR_LIST_RE = /^(?:\d{1,3}\.){3}\d{1,3}\/\d{1,2}(?:\s*,\s*(?:\d{1,3}\.){3}\d{1,3}\/\d{1,2})*$/;

export class InvalidNetworkError extends Error {}

export function updateNetworkSettings(input: {
  externalIp?: string;
  externalSignalingIp?: string;
  localNet?: string;
}): void {
  if (input.externalIp && !IP_RE.test(input.externalIp)) {
    throw new InvalidNetworkError('external_ip は IPv4 アドレス形式');
  }
  if (input.externalSignalingIp && !IP_RE.test(input.externalSignalingIp)) {
    throw new InvalidNetworkError('external_signaling_ip は IPv4 アドレス形式');
  }
  if (input.localNet && !CIDR_LIST_RE.test(input.localNet.trim())) {
    throw new InvalidNetworkError('local_net は CIDR をカンマ区切りで');
  }
  getDb()
    .prepare(
      `UPDATE network_settings
          SET external_ip = ?, external_signaling_ip = ?, local_net = ?, updated_at = datetime('now')
        WHERE id = 1`,
    )
    .run(
      input.externalIp ?? null,
      input.externalSignalingIp ?? null,
      input.localNet ?? null,
    );
}
