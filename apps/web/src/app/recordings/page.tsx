import fs from 'node:fs/promises';
import path from 'node:path';
import { formatJst, toIsoUtc } from '@/lib/datetime';
import { requireAccount } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const RECORDINGS_DIR = process.env.RECORDINGS_DIR ?? '/app/data/recordings';

async function listWavs() {
  try {
    const entries = await fs.readdir(RECORDINGS_DIR);
    const files = entries.filter((e) => /\.wav$/.test(e));
    const stats = await Promise.all(
      files.map(async (name) => {
        const st = await fs.stat(path.join(RECORDINGS_DIR, name));
        return { name, size: st.size, mtime: st.mtime.toISOString() };
      }),
    );
    return stats.sort((a, b) => (a.mtime < b.mtime ? 1 : -1));
  } catch {
    return [];
  }
}

export default async function RecordingsPage() {
  await requireAccount();
  const files = await listWavs();
  return (
    <div className="space-y-4">
      <header>
        <h2 className="text-lg font-semibold">通話録音</h2>
        <p className="text-xs text-slate-500">
          IVR / Record() で保存された wav 一覧。AI 連携が稼働している場合は <code>data/inbox/</code>{' '}
          にも同じ wav が投下されています。
        </p>
      </header>

      {files.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">
          録音がまだありません。
        </p>
      ) : (
        <ul className="divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white">
          {files.map((f) => (
            <li key={f.name} className="p-3 text-sm">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="font-mono">{f.name}</span>
                <span className="text-xs text-slate-500">{(f.size / 1024).toFixed(1)} KB</span>
                <time className="ml-auto text-xs text-slate-500" dateTime={toIsoUtc(f.mtime) ?? ''}>
                  {formatJst(f.mtime)}
                </time>
              </div>
              <audio
                controls
                preload="none"
                src={`/api/recordings/${encodeURIComponent(f.name)}`}
                className="mt-2 w-full"
                aria-label={`録音 ${f.name}`}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
