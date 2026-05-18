import { listExtensions } from '@/lib/extensions';
import { requireAccount } from '@/lib/auth';
import { Softphone } from './softphone';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function SoftphonePage() {
  await requireAccount();
  const webrtcExts = listExtensions().filter((e) => e.webrtc);
  return (
    <div className="space-y-4">
      <header>
        <h2 className="text-lg font-semibold">ブラウザソフトフォン (WebRTC)</h2>
        <p className="text-xs text-slate-500">
          /extensions で WebRTC を有効化した内線をブラウザから登録して使えます。Asterisk に
          自己署名証明書を <code>asterisk/certs/</code> に置き、ブラウザで wss://&lt;host&gt;:8089/ws を一度承認してください。
          詳細は README 参照。
        </p>
      </header>
      <Softphone extensions={webrtcExts.map((e) => ({ number: e.number, secret: e.secret }))} />
    </div>
  );
}
