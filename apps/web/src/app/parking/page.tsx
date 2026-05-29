import { ParkingLiveView } from './ParkingLiveView';
import { amiClient, listParkedCalls, amiIsReady } from '@/lib/ami';
import { retrieveParkedCallAction } from '@/app/actions';
import { requireAccount } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function ParkingPage() {
  await requireAccount();
  // 初回 SSR で AMI シングルトンを起動。
  amiClient();
  const parked = listParkedCalls();
  const ready = amiIsReady();

  return (
    <div className="space-y-4">
      <header>
        <h2 className="text-lg font-semibold">駐車中の通話</h2>
        <p className="text-xs text-slate-500">
          通話中に <span className="font-mono">#7</span> で保留 (park) した通話を一覧表示し、別の内線へ取り出せます。保留期限は{' '}
          {/* res_parking.conf parkingtime */}90 秒で、超過すると元の内線へ戻ります。
        </p>
      </header>
      <ParkingLiveView initialParked={parked} initialConnected={ready} retrieveAction={retrieveParkedCallAction} />
    </div>
  );
}
