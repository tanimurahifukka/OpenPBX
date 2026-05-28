import { requireRole } from '@/lib/auth';
import { getCommandRoomConfig, getVoiceBoxConfig } from '@/lib/settings';
import { UPSTREAM_BRAND } from '@/lib/branding';
import { ConnectionsForm } from './ConnectionsForm';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function ConnectionsPage() {
  await requireRole('admin');
  const cr = getCommandRoomConfig();
  const vb = getVoiceBoxConfig();

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <header>
        <h2 className="text-lg font-semibold">接続設定</h2>
        <p className="text-xs text-slate-500">
          {UPSTREAM_BRAND.shortName} や VoiceBox との接続を設定します。どちらも任意で、
          設定しなくても OpenPBX 単体で内線・IVR・録音は動きます。
        </p>
      </header>

      <ConnectionsForm
        initialCr={{
          configured: cr.configured,
          pushUrl: cr.pushUrl || null,
          workspaceId: cr.workspaceId || null,
          hasToken: cr.pushToken.length > 0,
        }}
        initialVb={{
          configured: vb.configured,
          url: vb.url || null,
          hasToken: vb.token.length > 0,
        }}
      />
    </div>
  );
}
