'use client';

import { useEffect, useState } from 'react';
import type { ParkedCall } from '@/lib/ami';

interface Props {
  initialParked: ParkedCall[];
  initialConnected: boolean;
  retrieveAction: (formData: FormData) => Promise<void>;
}

export function ParkingLiveView({ initialParked, initialConnected, retrieveAction }: Props) {
  const [parked, setParked] = useState<ParkedCall[]>(initialParked);
  const [connected, setConnected] = useState<boolean>(initialConnected);

  useEffect(() => {
    let es: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let alive = true;

    function connect() {
      if (!alive) return;
      es = new EventSource('/api/parking/stream');
      es.addEventListener('snapshot', (ev) => {
        try {
          const payload = JSON.parse((ev as MessageEvent).data) as {
            parked: ParkedCall[];
            connected: boolean;
          };
          setParked(payload.parked);
          setConnected(payload.connected);
        } catch {
          /* ignore malformed data */
        }
      });
      es.onerror = () => {
        es?.close();
        es = null;
        if (alive) retryTimer = setTimeout(connect, 5000);
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
    <section className="space-y-3" aria-label="駐車中の通話">
      <div className="flex items-center gap-2 text-xs">
        <span
          aria-hidden="true"
          className={`inline-block h-2 w-2 rounded-full ${connected ? 'bg-primary-500' : 'bg-slate-300'}`}
        />
        <span className="text-slate-600">{connected ? '電話システム接続中' : '電話システム未接続'}</span>
      </div>

      {parked.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">
          駐車中の通話はありません。通話中に <span className="font-mono">#7</span> で保留 (park) できます。
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {parked.map((p) => (
            <li key={p.parkingSpace} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-mono text-2xl font-bold text-primary-700">{p.parkingSpace}</span>
                <span className="text-xs text-slate-500">駐車 {p.durationSeconds}s</span>
              </div>
              <p className="mt-1 truncate text-sm text-slate-800">
                {p.callerIdName || '発信者不明'}{' '}
                <span className="font-mono text-slate-500">{p.callerIdNum || '-'}</span>
              </p>
              <form action={retrieveAction} className="mt-3 flex items-end gap-2">
                <input type="hidden" name="slot" value={p.parkingSpace} />
                <label className="flex-1 text-xs text-slate-600">
                  取り出し先内線
                  <input
                    name="toExtension"
                    required
                    inputMode="numeric"
                    pattern="[0-9]{2,6}"
                    className="mt-1 w-full rounded border border-slate-300 px-2 py-1 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
                    placeholder="例: 1001"
                    aria-label={`スロット ${p.parkingSpace} の取り出し先内線`}
                  />
                </label>
                <button
                  type="submit"
                  className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-400"
                >
                  取り出す
                </button>
              </form>
              <p className="mt-2 text-[11px] text-slate-400">
                電話機から <span className="font-mono">{p.parkingSpace}</span> をダイヤルしても取り出せます。
              </p>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-slate-400">SSE で自動更新。park / 取り出しは数秒以内に反映されます。</p>
    </section>
  );
}
