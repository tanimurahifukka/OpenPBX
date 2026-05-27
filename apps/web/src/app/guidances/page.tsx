import { listGuidances } from '@/lib/guidances';
import { deleteGuidanceAction } from '@/app/actions';
import { ConfirmButton } from '@/components/ConfirmButton';
import { requireAccount } from '@/lib/auth';
import { loadVoiceBoxClient, type VoiceBoxSpeaker } from '@/lib/voicebox';
import { GuidanceTtsForm } from './GuidanceTtsForm';
import { UnconfiguredMessage, UnreachableMessage } from '@/components/StatusMessage';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface PageProps {
  searchParams: Promise<{ prefillName?: string }>;
}

export default async function GuidancesPage({ searchParams }: PageProps) {
  await requireAccount();
  const items = listGuidances();

  const { prefillName } = await searchParams;
  const safePrefillName =
    typeof prefillName === 'string' && /^[A-Za-z0-9_/-]{1,80}$/.test(prefillName)
      ? prefillName
      : undefined;

  const voicebox = loadVoiceBoxClient();
  let voiceboxStatus: 'unconfigured' | 'ready' | 'unreachable' = 'unconfigured';
  let speakers: VoiceBoxSpeaker[] = [];
  let voiceboxError: string | null = null;
  if (voicebox) {
    try {
      const res = await voicebox.listSpeakers();
      speakers = res.speakers;
      voiceboxStatus = 'ready';
    } catch (e) {
      voiceboxStatus = 'unreachable';
      voiceboxError = e instanceof Error ? e.message : String(e);
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-lg font-semibold">共通ガイダンス</h2>
        <p className="text-xs text-slate-500">
          IVR や着信フローで再生する音声ファイルを管理します。
        </p>
      </header>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">文章から電話案内を作る</h3>
        {voiceboxStatus === 'unconfigured' && (
          <UnconfiguredMessage
            feature="文章から電話案内を作る機能"
            description="音声サーバーを接続すると使えます。wav アップロードはそのまま使えます。"
            setupLabel="音声サーバーを接続する"
          />
        )}
        {voiceboxStatus === 'unreachable' && (
          <UnreachableMessage
            feature="音声サーバー"
            description="サーバーが起動しているか確認してください。"
          />
        )}
        {voiceboxStatus === 'ready' && speakers.length === 0 && (
          <UnreachableMessage
            feature="音声サーバー"
            description="サーバーから声の情報が取得できませんでした。起動状態を確認してください。"
          />
        )}
        {voiceboxStatus === 'ready' && speakers.length > 0 && (
          <>
            <GuidanceTtsForm
              speakers={speakers}
              {...(safePrefillName !== undefined ? { prefillName: safePrefillName } : {})}
            />
            <p className="mt-3 border-t border-slate-200 pt-2 text-xs text-slate-500">
              この機能は VOICEVOX を使用して音声を作成します。利用にあたっては{' '}
              <a
                href="https://voicevox.hiroshiba.jp/term/"
                target="_blank"
                rel="noreferrer"
                className="text-primary-600 hover:underline"
              >
                VOICEVOX 利用規約
              </a>{' '}
              と、各音声ライブラリ (キャラクター) の利用規約に従ってください。生成した音声を公開・配布する場合は
              「VOICEVOX:キャラクター名」のクレジット表記が必要です。
            </p>
          </>
        )}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">wav アップロード</h3>
        <form
          method="post"
          action="/api/guidances"
          encType="multipart/form-data"
          className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto]"
        >
          <label className="text-xs text-slate-600">
            name (拡張子なし、例: custom/ivr-welcome)
            <input
              name="name"
              required
              pattern="[A-Za-z0-9_/-]{1,80}"
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1 font-mono text-sm"
            />
          </label>
          <label className="text-xs text-slate-600">
            wav ファイル
            <input
              type="file"
              name="file"
              accept="audio/wav,.wav"
              required
              className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
            />
          </label>
          <div className="flex items-end">
            <button
              type="submit"
              className="rounded bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-500"
            >
              アップロード
            </button>
          </div>
        </form>
        <p className="mt-2 text-xs text-slate-500">
          ホスト Mac で <code className="rounded bg-slate-100 px-1">./host-tts/make-prompts.sh</code> を実行すれば、
          Kyoko 声の標準セット (ivr-*) を一括生成できます (開発者向け、CLI)。
        </p>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">一覧 ({items.length})</h3>
        {items.length === 0 ? (
          <p className="text-sm text-slate-500">まだ登録されたガイダンスがありません。</p>
        ) : (
          <ul className="divide-y divide-slate-200">
            {items.map((g) => (
              <li
                key={g.name}
                className="grid grid-cols-1 gap-2 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_auto]"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-mono">{g.name}</span>
                    <span
                      className={
                        g.source === 'tts'
                          ? 'rounded bg-accent-light px-1.5 py-0.5 text-xs font-semibold text-accent-dark'
                          : 'rounded bg-slate-100 px-1.5 py-0.5 text-xs font-semibold text-slate-700'
                      }
                    >
                      {g.source === 'tts' ? '文章から作成' : 'アップロード'}
                    </span>
                    <span className="text-xs text-slate-500">{g.size ?? '-'} bytes</span>
                    <span className="text-xs text-slate-400">{g.updatedAt}</span>
                  </div>
                  {g.text && (
                    <p className="truncate text-xs text-slate-600" title={g.text}>
                      {g.text}
                    </p>
                  )}
                  <audio
                    controls
                    preload="none"
                    src={`/api/guidances/${encodeURIComponent(g.name)}/wav`}
                    className="w-full max-w-md"
                  />
                </div>
                <form action={deleteGuidanceAction} className="self-start sm:self-center">
                  <input type="hidden" name="name" value={g.name} />
                  <ConfirmButton
                    confirmText={`ガイダンス ${g.name} を削除しますか？`}
                    className="rounded border border-danger bg-white px-2 py-0.5 text-xs text-danger hover:bg-danger-light"
                  >
                    削除
                  </ConfirmButton>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
