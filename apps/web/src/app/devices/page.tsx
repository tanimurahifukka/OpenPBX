import { DeviceList } from './device-list';
import { listDevices, amiIsReady, amiClient } from '@/lib/ami';
import { requireAccount } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function DevicesPage() {
  await requireAccount();
  // 初回 SSR で AMI を起動 (シングルトン初期化)
  amiClient();
  const devices = listDevices();
  const ready = amiIsReady();

  return (
    <div className="space-y-4">
      <header>
        <h2 className="text-lg font-semibold">端末ライブ状態</h2>
        <p className="text-xs text-slate-500">
          Asterisk Manager Interface (AMI) を購読し、内線の登録状態と通話状態を即時表示。
        </p>
      </header>
      <DeviceList initialDevices={devices} initialConnected={ready} />
    </div>
  );
}
