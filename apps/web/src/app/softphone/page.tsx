import { listExtensions } from '@/lib/extensions';
import { requireAccount } from '@/lib/auth';
import { Softphone } from './softphone';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function SoftphonePage() {
  await requireAccount();
  const webrtcExts = listExtensions().filter((e) => e.webrtc);
  // 内線 secret はクライアントには返さない。表示名と番号のみ。
  // ユーザーは登録時に SIP password をブラウザ側で入力する。
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[420px_1fr]">
      <section className="space-y-4">
        <header>
          <h2 className="text-lg font-semibold">ブラウザソフトフォン (WebRTC)</h2>
          <p className="text-xs text-slate-500">
            /extensions で WebRTC を有効化した内線をブラウザから登録して使えます。
            通話中は右側に整形外科の問診フローが出るので、聞きながら入力できます。
            SIP パスワードはブラウザに保存されず、登録の都度入力します。
          </p>
        </header>
        <Softphone
          extensions={webrtcExts.map((e) => ({
            number: e.number,
            displayName: e.displayName ?? null,
          }))}
        />
      </section>
      <section className="space-y-4">
        <TriagePanel />
      </section>
    </div>
  );
}

import { TriageFlow } from '@/app/triage/triage-flow';

function TriagePanel() {
  return (
    <div className="rounded-lg border-2 border-blue-200 bg-white p-3">
      <TriageFlow />
    </div>
  );
}
