'use client';

import { useEffect, useRef, useState } from 'react';

// sip.js は CDN から動的 import (依存追加なしのため)。
// 注: ホスト Mac で `mkcert localhost` 等で生成した証明書を asterisk/certs/ に置く前提。

interface ExtensionInfo {
  number: string;
  displayName: string | null;
}

interface SoftphoneProps {
  extensions: ExtensionInfo[];
}

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    SIP?: any;
  }
}

export function Softphone({ extensions }: SoftphoneProps) {
  const [selected, setSelected] = useState<ExtensionInfo | null>(extensions[0] ?? null);
  const [status, setStatus] = useState<string>('disconnected');
  const [target, setTarget] = useState<string>('');
  const [host, setHost] = useState<string>(typeof window !== 'undefined' ? window.location.hostname : 'localhost');
  // SIP password はサーバから渡さず、登録のたびにユーザに入力させる。
  // メモリ上のみで保持し、disconnect 時にクリアする。
  const [sipPassword, setSipPassword] = useState<string>('');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const uaRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sessionRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // sip.js を CDN から
  useEffect(() => {
    if (window.SIP) return;
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/sip.js@0.21.2/dist/sip.min.js';
    s.async = true;
    document.head.appendChild(s);
  }, []);

  async function connect() {
    if (!selected) return;
    if (!sipPassword) {
      setStatus('SIP パスワードを入力してください');
      return;
    }
    if (!window.SIP) {
      setStatus('sip.js が読込中…');
      return;
    }
    const SIP = window.SIP;
    const uri = SIP.UserAgent.makeURI(`sip:${selected.number}@${host}`);
    const audio = audioRef.current;
    const ua = new SIP.UserAgent({
      uri,
      transportOptions: { server: `wss://${host}:8089/ws` },
      authorizationUsername: selected.number,
      authorizationPassword: sipPassword,
      delegate: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onInvite(invitation: any) {
          sessionRef.current = invitation;
          setStatus(`着信中: ${invitation.remoteIdentity?.uri?.user ?? ''}`);
          invitation.delegate = {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            onSessionDescriptionHandler(sdh: any) {
              attachAudio(sdh, audio);
            },
          };
        },
      },
    });
    uaRef.current = ua;
    setStatus('接続中…');
    await ua.start();
    const reg = new SIP.Registerer(ua);
    await reg.register();
    setStatus(`登録完了: ${selected.number}`);
  }

  async function disconnect() {
    if (sessionRef.current) {
      await sessionRef.current.bye?.();
      sessionRef.current = null;
    }
    if (uaRef.current) {
      await uaRef.current.stop();
      uaRef.current = null;
    }
    setSipPassword('');
    setStatus('disconnected');
  }

  async function call() {
    if (!uaRef.current || !target) return;
    const SIP = window.SIP;
    const targetUri = SIP.UserAgent.makeURI(`sip:${target}@${host}`);
    const inviter = new SIP.Inviter(uaRef.current, targetUri);
    sessionRef.current = inviter;
    inviter.delegate = {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onSessionDescriptionHandler(sdh: any) {
        attachAudio(sdh, audioRef.current);
      },
    };
    setStatus(`発信中: ${target}`);
    await inviter.invite();
  }

  async function answer() {
    if (sessionRef.current?.accept) {
      await sessionRef.current.accept();
      setStatus('通話中');
    }
  }
  async function hangup() {
    if (sessionRef.current) {
      try {
        await sessionRef.current.bye?.() ?? (await sessionRef.current.reject?.());
      } catch {
        /* ignore */
      }
      sessionRef.current = null;
      setStatus(uaRef.current ? '通話終了' : 'disconnected');
    }
  }

  if (extensions.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">
        WebRTC を有効化した内線がありません。/extensions で「WebRTC を有効化」にチェックを入れて保存してください。
      </div>
    );
  }

  return (
    <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
      <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2">
        <label className="text-xs text-slate-600">
          内線
          <select
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
            value={selected?.number ?? ''}
            onChange={(e) => setSelected(extensions.find((x) => x.number === e.target.value) ?? null)}
          >
            {extensions.map((e) => (
              <option key={e.number} value={e.number}>
                {e.number}
                {e.displayName ? ` (${e.displayName})` : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-slate-600">
          SIP パスワード
          <input
            type="password"
            autoComplete="new-password"
            value={sipPassword}
            onChange={(e) => setSipPassword(e.target.value)}
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1 font-mono text-sm"
            aria-label="SIP パスワード (登録時のみ使用、保存しない)"
          />
        </label>
        <label className="text-xs text-slate-600">
          Asterisk host
          <input
            value={host}
            onChange={(e) => setHost(e.target.value)}
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1 font-mono text-sm"
          />
        </label>
        <div className="flex items-end gap-2">
          <button
            onClick={connect}
            type="button"
            className="rounded bg-primary px-3 py-1.5 text-xs font-semibold text-white"
          >
            登録
          </button>
          <button
            onClick={disconnect}
            type="button"
            className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700"
          >
            切断
          </button>
        </div>
      </div>
      <div className="text-xs text-slate-600">状態: {status}</div>
      <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2">
        <input
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          placeholder="発信先 (例: 1002)"
          className="rounded border border-slate-300 px-2 py-1 font-mono text-sm"
        />
        <button onClick={call} type="button" className="rounded bg-primary px-3 py-1.5 text-xs font-semibold text-white">
          発信
        </button>
        <button onClick={answer} type="button" className="rounded bg-primary px-3 py-1.5 text-xs font-semibold text-white">
          応答
        </button>
        <button onClick={hangup} type="button" className="rounded bg-danger px-3 py-1.5 text-xs font-semibold text-white">
          切る
        </button>
      </div>
      <audio ref={audioRef} autoPlay />
    </section>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function attachAudio(sdh: any, audio: HTMLAudioElement | null) {
  if (!audio) return;
  const pc = sdh.peerConnection;
  if (!pc) return;
  pc.addEventListener('track', (ev: RTCTrackEvent) => {
    if (ev.streams[0]) audio.srcObject = ev.streams[0];
  });
}
