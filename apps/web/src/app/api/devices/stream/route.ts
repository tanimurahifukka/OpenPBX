import { amiClient, listDevices } from '@/lib/ami';
import { requireApi } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireApi();
  if (auth instanceof Response) return auth;
  const client = amiClient();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
          );
        } catch {
          /* closed */
        }
      };

      // 初回スナップショット
      send('snapshot', { devices: listDevices(), connected: client.isConnected() });

      const onChange = () => send('snapshot', { devices: listDevices(), connected: client.isConnected() });
      client.on('change', onChange);

      // keep-alive (10秒ごとに ping)
      const ping = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          clearInterval(ping);
        }
      }, 10_000);

      // ストリームが閉じたらクリーンアップ
      (controller as unknown as { _close?: () => void })._close = () => {
        clearInterval(ping);
        client.off('change', onChange);
      };
    },
    cancel() {
      const c = this as unknown as { _close?: () => void };
      c._close?.();
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
