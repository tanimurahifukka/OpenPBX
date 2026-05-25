import { amiClient, listDevices } from '@/lib/ami';
import { requireApi } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireApi();
  if (auth instanceof Response) return auth;
  const client = amiClient();
  const encoder = new TextEncoder();

  // クリーンアップ用クロージャ変数。cancel() の this はソースオブジェクト
  // 自体なので、controller にプロパティを付ける旧実装では到達できなかった。
  let cleanup: (() => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
          );
        } catch {
          /* stream already closed */
        }
      };

      // 初回スナップショット
      send('snapshot', { devices: listDevices(), connected: client.isConnected() });

      const onChange = () => send('snapshot', { devices: listDevices(), connected: client.isConnected() });
      client.on('change', onChange);

      // keep-alive ping (10秒ごと)
      const ping = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          clearInterval(ping);
        }
      }, 10_000);

      // 15秒ごとに full snapshot を送る。AMI change イベントを取りこぼしても
      // UI が古い状態のまま固まらない。
      const fullSync = setInterval(() => {
        send('snapshot', { devices: listDevices(), connected: client.isConnected() });
      }, 15_000);

      cleanup = () => {
        clearInterval(ping);
        clearInterval(fullSync);
        client.off('change', onChange);
      };
    },
    cancel() {
      cleanup?.();
      cleanup = null;
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
