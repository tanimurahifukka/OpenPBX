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
    <div className="space-y-4">
      <header>
        <h2 className="text-lg font-semibold">ブラウザソフトフォン (WebRTC)</h2>
        <p className="text-xs text-slate-500">
          /extensions で WebRTC を有効化した内線をブラウザから登録して使えます。
          SIP パスワードはブラウザに保存されず、登録の都度入力します。
        </p>
      </header>
      <Softphone
        extensions={webrtcExts.map((e) => ({
          number: e.number,
          displayName: e.displayName ?? null,
        }))}
      />
    </div>
  );
}
