import { amiClient, listParkedCalls } from '@/lib/ami';
import { requireApi } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await requireApi();
  if (auth instanceof Response) return auth;
  const client = amiClient();
  const encoder = new TextEncoder();

  let cleanup: (() => void) | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          /* stream already closed */
        }
      };

      const snapshot = () =>
        send('snapshot', { parked: listParkedCalls(), connected: client.isConnected() });

      snapshot();
      const onChange = () => snapshot();
      client.on('change', onChange);

      const ping = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          clearInterval(ping);
        }
      }, 10_000);

      // Periodic full sync so a missed event can't leave the view stale.
      const fullSync = setInterval(snapshot, 15_000);

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
