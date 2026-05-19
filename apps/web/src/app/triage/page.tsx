import { requireAccount } from '@/lib/auth';
import { TriageFlow } from './triage-flow';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function TriagePage() {
  await requireAccount();
  return (
    <div className="space-y-4">
      <TriageFlow />
    </div>
  );
}
