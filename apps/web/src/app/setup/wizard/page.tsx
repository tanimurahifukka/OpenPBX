import { redirect } from 'next/navigation';
import { hasAnyAccounts } from '@/lib/settings';
import { WizardForm } from './WizardForm';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function WizardPage() {
  if (hasAnyAccounts()) {
    redirect('/');
  }
  return <WizardForm />;
}
