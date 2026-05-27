'use client';

import { useEffect, useState } from 'react';
import type { DeviceInfo, DeviceState } from '@/lib/ami';

const STATE_LABEL: Record<DeviceState, string> = {
  unknown: '不明',
  not_inuse: '待機中',
  inuse: '通話中',
  busy: 'ビジー',
  invalid: '無効',
  unavailable: '未登録',
  ringing: '呼出中',
  ringinuse: '呼出+通話',
  onhold: '保留',
};

const STATE_TONE: Record<DeviceState, string> = {
  unknown: 'bg-slate-100 text-slate-700 border-slate-300',
  not_inuse: 'bg-primary-50 text-primary-700 border-primary-300',
  inuse: 'bg-primary-50 text-primary-700 border-primary-300',
  busy: 'bg-orange-50 text-orange-800 border-orange-300',
  invalid: 'bg-danger-light text-danger-dark border-danger',
  unavailable: 'bg-slate-100 text-slate-500 border-slate-300',
  ringing: 'bg-warning-light text-warning-dark border-amber-300',
  ringinuse: 'bg-warning-light text-warning-dark border-amber-300',
  onhold: 'bg-violet-50 text-accent-dark border-violet-300',
};

interface Props {
  initialDevices: DeviceInfo[];
  initialConnected: boolean;
}

export function DeviceList({ initialDevices, initialConnected }: Props) {
  const filter = (d: DeviceInfo[]) => d.filter((x) => x.device.startsWith('PJSIP/') && x.extension);
  const [devices, setDevices] = useState<DeviceInfo[]>(filter(initialDevices));
  const [connected, setConnected] = useState<boolean>(initialConnected);

  useEffect(() => {
    let es: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let alive = true;

    function connect() {
      if (!alive) return;
      es = new EventSource('/api/devices/stream');

      es.addEventListener('snapshot', (ev) => {
        try {
          const payload = JSON.parse((ev as MessageEvent).data) as {
            devices: DeviceInfo[];
            connected: boolean;
          };
          setDevices(filter(payload.devices));
          setConnected(payload.connected);
        } catch {
          /* ignore malformed data */
        }
      });

      es.onerror = () => {
        // EventSource auto-reconnects, but if it keeps failing we
        // force a fresh connection after 5s to avoid the browser's
        // exponential back-off growing too large.
        es?.close();
        es = null;
        if (alive) {
          retryTimer = setTimeout(connect, 5000);
        }
      };
    }

    connect();

    return () => {
      alive = false;
      es?.close();
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, []);

  return (
    <section className="space-y-3" aria-label="端末一覧">
      <div className="flex items-center gap-2 text-xs">
        <span
          aria-label={connected ? '電話システム接続中' : '電話システム切断'}
          className={`inline-block h-2 w-2 rounded-full ${connected ? 'bg-primary-500' : 'bg-danger-light0'}`}
        />
        <span className="text-slate-600">{connected ? '電話システム接続中' : '電話システム未接続'}</span>
      </div>
      {devices.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">
          端末がまだ Asterisk に登録されていません。/extensions で内線を追加し、Groundwire などから接続してください。
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {devices.map((d) => (
            <li
              key={d.device}
              className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm"
            >
              <span className="font-mono text-lg font-semibold">{d.extension ?? d.device}</span>
              <span
                className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${STATE_TONE[d.state]}`}
              >
                {STATE_LABEL[d.state]}
              </span>
              <span
                className={`text-xs ${d.reachable ? 'text-primary-600' : 'text-slate-400'}`}
                aria-label={d.reachable ? '登録あり' : '登録なし'}
              >
                {d.reachable ? '● 登録' : '○ 未登録'}
              </span>
              {d.contact && (
                <span className="ml-auto truncate font-mono text-xs text-slate-400">{d.contact}</span>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-slate-400">SSE で自動更新。Groundwire 等で登録/切断すると数秒以内に反映されます。</p>
    </section>
  );
}
