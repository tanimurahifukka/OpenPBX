'use server';

import {
  createAccount,
  createSession,
  listAccounts,
  requestMeta,
} from '@/lib/auth';

export interface WizardCreateAccountResult {
  ok: boolean;
  error?: string;
}

export async function wizardCreateAccount(
  username: string,
  password: string,
): Promise<WizardCreateAccountResult> {
  const existing = listAccounts();
  if (existing.length > 0) {
    return { ok: false, error: 'アカウントは既に存在します。ウィザードは初回のみ使用できます。' };
  }
  if (!username.trim()) {
    return { ok: false, error: 'ユーザー名を入力してください' };
  }
  if (password.length < 8) {
    return { ok: false, error: 'パスワードは 8 文字以上必要です' };
  }
  try {
    const account = createAccount({
      username: username.trim(),
      password,
      role: 'admin',
    });
    const meta = await requestMeta();
    await createSession(account.id, meta);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
