'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  getAccountByUsername,
  getAccountPasswordHash,
  verifyPassword,
  createSession,
  destroySession,
  recordLoginAttempt,
  requestMeta,
  requireAccount,
  requireRole,
  createAccount,
  updateAccountRole,
  updateAccountPassword,
  updateAccountDisplayName,
  deleteAccount,
  recordAudit,
  setAccountTotpSecret,
  getAccountTotpSecret,
  countAdmins,
  getAccountById,
  isAccountLockedOut,
  type Role,
} from '@/lib/auth';
import { isIpAllowed } from '@/lib/policy';
import { generateSecret, verifyTotp } from '@/lib/totp';
import {
  createExtension,
  updateExtension,
  deleteExtension,
  writePjsipConfigAndReload,
} from '@/lib/extensions';
import {
  createRingGroup,
  updateRingGroup,
  deleteRingGroup,
  writeRingGroupDialplanAndReload,
  type RingStrategy,
} from '@/lib/ringGroups';
import {
  createPickupGroup,
  updatePickupGroup,
  deletePickupGroup,
  writePickupDialplanAndReload,
} from '@/lib/pickupGroups';
import {
  createPhonebook,
  updatePhonebook,
  deletePhonebook,
} from '@/lib/phonebook';
import {
  upsertHoliday,
  deleteHoliday,
  createTimeRule,
  updateTimeRule,
  deleteTimeRule,
  writeBusinessHoursAndReload,
  daysToAsterisk,
} from '@/lib/businessHours';
import {
  createIvrMenu,
  updateIvrMenu,
  deleteIvrMenu,
  getIvrMenu,
  writeIvrDialplanAndReload,
  type IvrOption,
  type IvrAction,
} from '@/lib/ivr';
import { deleteGuidance } from '@/lib/guidances';
import { signalAsteriskReload } from '@/lib/dialplan';
import {
  getPolicy,
  updatePolicy,
  upsertIpAllow,
  deleteIpAllow,
} from '@/lib/policy';
import { upsertRate, deleteRate } from '@/lib/billing';
import {
  upsertTrunk,
  deleteTrunk,
  writeTrunksConfigAndReload,
} from '@/lib/trunks';
import { scheduleUpgrade, deleteUpgrade } from '@/lib/upgrades';
import { updateNetworkSettings } from '@/lib/network';
import {
  upsertPatient,
  deletePatient,
  createPatientRecord,
  deletePatientRecord,
  InvalidPatientError,
} from '@/lib/patients';

function s(v: FormDataEntryValue | null): string {
  return typeof v === 'string' ? v.trim() : '';
}

// CRUD アクションの成功/失敗を URL クエリ (?err= / ?ok=) で FlashBanner に届ける共通ラッパ。
// 内部で revalidatePath + redirect する (redirect は throw するので呼び出し側に return 不要)。
async function flash(
  path: string,
  successMsg: string,
  fn: () => unknown | Promise<unknown>,
): Promise<never> {
  let errMsg: string | null = null;
  try {
    await fn();
  } catch (err) {
    errMsg = err instanceof Error ? err.message : String(err);
    console.error(`[action] ${path}`, errMsg);
  }
  revalidatePath(path);
  const q = new URLSearchParams();
  if (errMsg) q.set('err', errMsg);
  else if (successMsg) q.set('ok', successMsg);
  redirect(q.toString() ? `${path}?${q.toString()}` : path);
}

// ---- extensions ----
export async function createExtensionAction(formData: FormData): Promise<void> {
  await flash('/extensions', '内線を追加しました', async () => {
    const me = await requireRole('admin');
    createExtension({
      number: s(formData.get('number')),
      displayName: s(formData.get('displayName')) || undefined,
      secret: s(formData.get('secret')),
      note: s(formData.get('note')) || undefined,
      webrtc: formData.get('webrtc') === 'on',
    });
    await writePjsipConfigAndReload();
    recordAudit({ actor: me.username, action: 'extension.create', target: s(formData.get('number')) });
  });
}

export async function updateExtensionAction(formData: FormData): Promise<void> {
  await flash('/extensions', '内線を更新しました', async () => {
    const me = await requireRole('admin');
    updateExtension({
      number: s(formData.get('number')),
      displayName: s(formData.get('displayName')) || undefined,
      secret: s(formData.get('secret')),
      note: s(formData.get('note')) || undefined,
      webrtc: formData.get('webrtc') === 'on',
    });
    await writePjsipConfigAndReload();
    recordAudit({ actor: me.username, action: 'extension.update', target: s(formData.get('number')) });
  });
}

export async function deleteExtensionAction(formData: FormData): Promise<void> {
  await flash('/extensions', '内線を削除しました', async () => {
    const me = await requireRole('admin');
    const number = s(formData.get('number'));
    if (!number) throw new Error('番号が指定されていません');
    deleteExtension(number);
    await writePjsipConfigAndReload();
    recordAudit({ actor: me.username, action: 'extension.delete', target: number });
  });
}

// ---- ring groups ----
function parseMembers(v: FormDataEntryValue | null): string[] {
  if (typeof v !== 'string') return [];
  return v.split(/[\s,、]+/).map((x) => x.trim()).filter(Boolean);
}
function asStrategy(v: FormDataEntryValue | null): RingStrategy {
  return v === 'linear' ? 'linear' : 'ringall';
}

export async function createRingGroupAction(formData: FormData): Promise<void> {
  await flash('/ring-groups', '着信グループを追加しました', async () => {
    await requireRole('admin');
    createRingGroup({
      number: s(formData.get('number')),
      name: s(formData.get('name')) || undefined,
      strategy: asStrategy(formData.get('strategy')),
      ringSeconds: Number(formData.get('ringSeconds')) || 30,
      fallbackExtension: s(formData.get('fallbackExtension')) || undefined,
      members: parseMembers(formData.get('members')),
    });
    await writeRingGroupDialplanAndReload();
  });
}

export async function updateRingGroupAction(formData: FormData): Promise<void> {
  await flash('/ring-groups', '着信グループを更新しました', async () => {
    await requireRole('admin');
    updateRingGroup({
      number: s(formData.get('number')),
      name: s(formData.get('name')) || undefined,
      strategy: asStrategy(formData.get('strategy')),
      ringSeconds: Number(formData.get('ringSeconds')) || 30,
      fallbackExtension: s(formData.get('fallbackExtension')) || undefined,
      members: parseMembers(formData.get('members')),
    });
    await writeRingGroupDialplanAndReload();
  });
}

export async function deleteRingGroupAction(formData: FormData): Promise<void> {
  await flash('/ring-groups', '着信グループを削除しました', async () => {
    await requireRole('admin');
    const number = s(formData.get('number'));
    if (!number) throw new Error('番号が指定されていません');
    deleteRingGroup(number);
    await writeRingGroupDialplanAndReload();
  });
}

// ---- pickup groups ----
export async function createPickupGroupAction(formData: FormData): Promise<void> {
  await flash('/pickup-groups', 'ピックアップグループを追加しました', async () => {
    await requireRole('admin');
    createPickupGroup({
      name: s(formData.get('name')),
      members: parseMembers(formData.get('members')),
    });
    await writePickupDialplanAndReload();
    await writePjsipConfigAndReload();
  });
}

export async function updatePickupGroupAction(formData: FormData): Promise<void> {
  await flash('/pickup-groups', 'ピックアップグループを更新しました', async () => {
    await requireRole('admin');
    updatePickupGroup({
      name: s(formData.get('name')),
      members: parseMembers(formData.get('members')),
    });
    await writePickupDialplanAndReload();
    await writePjsipConfigAndReload();
  });
}

export async function deletePickupGroupAction(formData: FormData): Promise<void> {
  await flash('/pickup-groups', 'ピックアップグループを削除しました', async () => {
    await requireRole('admin');
    const name = s(formData.get('name'));
    if (!name) throw new Error('名前が指定されていません');
    deletePickupGroup(name);
    await writePickupDialplanAndReload();
    await writePjsipConfigAndReload();
  });
}

// ---- phonebook ----
export async function createPhonebookAction(formData: FormData): Promise<void> {
  await flash('/phonebook', '電話帳に追加しました', async () => {
    await requireAccount();
    createPhonebook({
      name: s(formData.get('name')),
      number: s(formData.get('number')),
      category: s(formData.get('category')) || undefined,
      note: s(formData.get('note')) || undefined,
    });
  });
}

export async function updatePhonebookAction(formData: FormData): Promise<void> {
  await flash('/phonebook', '電話帳を更新しました', async () => {
    await requireAccount();
    const id = Number(formData.get('id'));
    if (!Number.isInteger(id) || id <= 0) throw new Error('id が不正');
    updatePhonebook({
      id,
      name: s(formData.get('name')),
      number: s(formData.get('number')),
      category: s(formData.get('category')) || undefined,
      note: s(formData.get('note')) || undefined,
    });
  });
}

export async function deletePhonebookAction(formData: FormData): Promise<void> {
  await flash('/phonebook', '電話帳から削除しました', async () => {
    await requireRole('admin', 'supervisor');
    const id = Number(formData.get('id'));
    if (!Number.isInteger(id) || id <= 0) throw new Error('id が不正');
    deletePhonebook(id);
  });
}

// ---- holidays / time rules ----
export async function upsertHolidayAction(formData: FormData): Promise<void> {
  await flash('/business-hours', '祝日を保存しました', async () => {
    await requireRole('admin', 'supervisor');
    upsertHoliday(s(formData.get('date')), s(formData.get('name')));
    await writeBusinessHoursAndReload();
  });
}

export async function deleteHolidayAction(formData: FormData): Promise<void> {
  await flash('/business-hours', '祝日を削除しました', async () => {
    await requireRole('admin', 'supervisor');
    const date = s(formData.get('date'));
    if (!date) throw new Error('日付が指定されていません');
    deleteHoliday(date);
    await writeBusinessHoursAndReload();
  });
}

function readDays(formData: FormData): string {
  const picked = formData.getAll('day').map((v) => String(v));
  if (picked.length > 0) return daysToAsterisk(picked);
  const raw = s(formData.get('days'));
  return raw || '*';
}

export async function createTimeRuleAction(formData: FormData): Promise<void> {
  await flash('/business-hours', '時間帯ルールを追加しました', async () => {
    await requireRole('admin', 'supervisor');
    createTimeRule({
      name: s(formData.get('name')),
      days: readDays(formData),
      startTime: s(formData.get('startTime')),
      endTime: s(formData.get('endTime')),
      note: s(formData.get('note')) || undefined,
    });
    await writeBusinessHoursAndReload();
  });
}

export async function updateTimeRuleAction(formData: FormData): Promise<void> {
  await flash('/business-hours', '時間帯ルールを更新しました', async () => {
    await requireRole('admin', 'supervisor');
    const id = Number(formData.get('id'));
    if (!Number.isInteger(id) || id <= 0) throw new Error('id が不正');
    updateTimeRule({
      id,
      name: s(formData.get('name')),
      days: readDays(formData),
      startTime: s(formData.get('startTime')),
      endTime: s(formData.get('endTime')),
      note: s(formData.get('note')) || undefined,
    });
    await writeBusinessHoursAndReload();
  });
}

export async function deleteTimeRuleAction(formData: FormData): Promise<void> {
  await flash('/business-hours', '時間帯ルールを削除しました', async () => {
    await requireRole('admin', 'supervisor');
    const id = Number(formData.get('id'));
    if (!Number.isInteger(id) || id <= 0) throw new Error('id が不正');
    deleteTimeRule(id);
    await writeBusinessHoursAndReload();
  });
}

// ---- IVR ----
function parseIvrOptions(raw: string): IvrOption[] {
  const out: IvrOption[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    const [digit, action, target, label] = t.split('|').map((x) => x?.trim() ?? '');
    if (!digit || !action) continue;
    out.push({
      digit,
      action: action as IvrAction,
      target: target || null,
      label: label || null,
    });
  }
  return out;
}

export async function upsertIvrAction(formData: FormData): Promise<void> {
  await flash('/ivr', 'IVR を保存しました', async () => {
    await requireRole('admin');
    const number = s(formData.get('number'));
    const input = {
      number,
      name: s(formData.get('name')) || undefined,
      welcomePrompt: s(formData.get('welcomePrompt')) || undefined,
      menuPrompt: s(formData.get('menuPrompt')) || undefined,
      invalidPrompt: s(formData.get('invalidPrompt')) || undefined,
      goodbyePrompt: s(formData.get('goodbyePrompt')) || undefined,
      maxRetries: Number(formData.get('maxRetries')) || 3,
      waitSeconds: Number(formData.get('waitSeconds')) || 6,
      options: parseIvrOptions(s(formData.get('options'))),
    };
    if (getIvrMenu(number)) {
      updateIvrMenu(input);
    } else {
      createIvrMenu(input);
    }
    await writeIvrDialplanAndReload();
  });
}

export async function deleteIvrAction(formData: FormData): Promise<void> {
  await flash('/ivr', 'IVR を削除しました', async () => {
    await requireRole('admin');
    const number = s(formData.get('number'));
    if (!number) throw new Error('番号が指定されていません');
    deleteIvrMenu(number);
    await writeIvrDialplanAndReload();
  });
}

// ---- guidances ----
export async function deleteGuidanceAction(formData: FormData): Promise<void> {
  await flash('/guidances', 'ガイダンスを削除しました', async () => {
    await requireRole('admin');
    const name = s(formData.get('name'));
    if (!name) throw new Error('name が指定されていません');
    await deleteGuidance(name);
    await signalAsteriskReload();
  });
}

// ---- auth (login / logout は次の URL に redirect するので flash を使わない) ----
// next redirect param は同一オリジン内のローカルパス (/ で始まる) のみ許可。
// `//evil.com/...`, `http://...`, スキーマ付きを弾く。
function sanitizeNext(raw: string): string {
  if (!raw || !raw.startsWith('/')) return '/';
  if (raw.startsWith('//') || raw.startsWith('/\\')) return '/';
  return raw;
}

export async function loginAction(formData: FormData): Promise<void> {
  const username = s(formData.get('username'));
  const password = String(formData.get('password') ?? '');
  const totp = String(formData.get('totp') ?? '').trim();
  const next = sanitizeNext(s(formData.get('next')));
  const meta = await requestMeta();
  let ok = false;
  let why: string | undefined;
  try {
    if (!isIpAllowed(meta.ip)) {
      why = 'この IP からのログインは許可されていません';
      recordLoginAttempt(username, false, meta);
      recordAudit({ actor: username, action: 'login.blocked.ip', ip: meta.ip });
    } else if (username && isAccountLockedOut(username)) {
      // 失敗回数が閾値を超えたアカウントは 15 分待たないとログインできない。
      // username は valid/invalid どちらでもこの分岐に入りうるので、enumeration を避ける狙いで
      // メッセージは一般的にする。
      why = 'ログインが一時的に制限されています。しばらくしてからもう一度お試しください';
      recordLoginAttempt(username, false, meta);
      recordAudit({ actor: username, action: 'login.locked', ip: meta.ip });
    } else {
      const a = getAccountByUsername(username);
      const hash = a ? getAccountPasswordHash(a.id) : null;
      if (a && hash && verifyPassword(password, hash)) {
        const secret = getAccountTotpSecret(a.id);
        if (secret && !verifyTotp(secret, totp)) {
          why = '2FA コードが正しくありません';
          recordLoginAttempt(username, false, meta);
          recordAudit({ actor: username, action: 'login.totp.fail', ip: meta.ip });
        } else {
          ok = true;
          recordLoginAttempt(username, true, meta);
          await createSession(a.id, meta);
          recordAudit({ actor: a.username, action: 'login', ip: meta.ip, userAgent: meta.userAgent });
        }
      } else {
        why = 'ユーザー名またはパスワードが正しくありません';
        recordLoginAttempt(username, false, meta);
      }
    }
  } catch (err) {
    console.error('[loginAction]', err);
    why = (err as Error).message;
  }
  redirect(
    ok
      ? next
      : `/login?err=${encodeURIComponent(why ?? 'ログインに失敗しました')}&next=${encodeURIComponent(next)}`,
  );
}

export async function logoutAction(): Promise<void> {
  try {
    const me = await requireAccount();
    const meta = await requestMeta();
    recordAudit({ actor: me.username, action: 'logout', ip: meta.ip, userAgent: meta.userAgent });
  } catch {
    /* no-op */
  }
  await destroySession();
  redirect('/login');
}

// ---- self (/me) ----
export async function setupTotpAction(): Promise<void> {
  await flash('/me', '2FA を有効化しました', async () => {
    const me = await requireAccount();
    const secret = generateSecret();
    setAccountTotpSecret(me.id, secret);
    recordAudit({ actor: me.username, action: 'self.totp.enable' });
  });
}

export async function disableTotpAction(): Promise<void> {
  await flash('/me', '2FA を無効化しました', async () => {
    const me = await requireAccount();
    setAccountTotpSecret(me.id, null);
    recordAudit({ actor: me.username, action: 'self.totp.disable' });
  });
}

export async function updateMyDisplayNameAction(formData: FormData): Promise<void> {
  await flash('/me', '表示名を変更しました', async () => {
    const me = await requireAccount();
    const displayName = s(formData.get('displayName')) || null;
    updateAccountDisplayName(me.id, displayName);
    recordAudit({ actor: me.username, action: 'self.display_name' });
  });
}

export async function updateMyPasswordAction(formData: FormData): Promise<void> {
  await flash('/me', 'パスワードを変更しました', async () => {
    const me = await requireAccount();
    const pw = String(formData.get('password') ?? '');
    // policy 適用は updateAccountPassword 内で行う。
    updateAccountPassword(me.id, pw);
    recordAudit({ actor: me.username, action: 'self.password' });
  });
}

// ---- accounts (admin) ----
export async function createAccountAction(formData: FormData): Promise<void> {
  await flash('/accounts', 'アカウントを追加しました', async () => {
    const me = await requireRole('admin');
    const a = createAccount({
      username: s(formData.get('username')),
      displayName: s(formData.get('displayName')) || undefined,
      password: String(formData.get('password') ?? ''),
      role: (s(formData.get('role')) as Role) || 'user',
    });
    recordAudit({ actor: me.username, action: 'account.create', target: a.username });
  });
}

export async function updateAccountRoleAction(formData: FormData): Promise<void> {
  await flash('/accounts', 'ロールを更新しました', async () => {
    const me = await requireRole('admin');
    const id = Number(formData.get('id'));
    const role = s(formData.get('role')) as Role;
    if (!Number.isInteger(id) || id <= 0) throw new Error('id が不正');
    if (id === me.id && role !== 'admin') {
      throw new Error('自分のロールは降格できません');
    }
    const target = getAccountById(id);
    if (target?.role === 'admin' && role !== 'admin' && countAdmins(id) === 0) {
      throw new Error('最後の admin は降格できません');
    }
    updateAccountRole(id, role);
    recordAudit({ actor: me.username, action: 'account.role', target: String(id), details: { role } });
  });
}

export async function updateAccountDisplayNameAction(formData: FormData): Promise<void> {
  await flash('/accounts', '表示名を更新しました', async () => {
    const me = await requireRole('admin');
    const id = Number(formData.get('id'));
    if (!Number.isInteger(id) || id <= 0) throw new Error('id が不正');
    const displayName = s(formData.get('displayName')) || null;
    updateAccountDisplayName(id, displayName);
    recordAudit({ actor: me.username, action: 'account.display_name', target: String(id) });
  });
}

export async function updateAccountPasswordAction(formData: FormData): Promise<void> {
  await flash('/accounts', 'パスワードを更新しました', async () => {
    const me = await requireRole('admin');
    const id = Number(formData.get('id'));
    const pw = String(formData.get('password') ?? '');
    if (!Number.isInteger(id) || id <= 0) throw new Error('id が不正');
    // policy 適用は updateAccountPassword 内で行う。
    updateAccountPassword(id, pw);
    recordAudit({ actor: me.username, action: 'account.password', target: String(id) });
  });
}

export async function deleteAccountAction(formData: FormData): Promise<void> {
  await flash('/accounts', 'アカウントを削除しました', async () => {
    const me = await requireRole('admin');
    const id = Number(formData.get('id'));
    if (!Number.isInteger(id) || id <= 0) throw new Error('id が不正');
    if (id === me.id) throw new Error('自分自身は削除できません');
    const target = getAccountById(id);
    if (target?.role === 'admin' && countAdmins(id) === 0) {
      throw new Error('最後の admin は削除できません');
    }
    deleteAccount(id);
    recordAudit({ actor: me.username, action: 'account.delete', target: String(id) });
  });
}

// ---- security ----
export async function updatePolicyAction(formData: FormData): Promise<void> {
  await flash('/security', 'パスワードポリシーを更新しました', async () => {
    const me = await requireRole('admin');
    const before = getPolicy();
    const next = {
      minLength: Number(formData.get('minLength')) || 8,
      requireLowercase: formData.get('requireLowercase') === 'on',
      requireUppercase: formData.get('requireUppercase') === 'on',
      requireDigit: formData.get('requireDigit') === 'on',
      requireSymbol: formData.get('requireSymbol') === 'on',
      rotationDays: Number(formData.get('rotationDays')) || 0,
      lockoutThreshold: Number(formData.get('lockoutThreshold')) || 5,
    };
    updatePolicy(next);
    recordAudit({ actor: me.username, action: 'policy.password', details: { before, after: next } });
  });
}

export async function upsertIpAllowAction(formData: FormData): Promise<void> {
  await flash('/security', 'IP 許可リストを更新しました', async () => {
    const me = await requireRole('admin');
    const cidr = s(formData.get('cidr'));
    const note = s(formData.get('note')) || undefined;
    upsertIpAllow(cidr, note);
    recordAudit({ actor: me.username, action: 'ipallow.upsert', target: cidr, details: { note } });
  });
}

export async function deleteIpAllowAction(formData: FormData): Promise<void> {
  await flash('/security', 'IP 許可リストから削除しました', async () => {
    const me = await requireRole('admin');
    const cidr = s(formData.get('cidr'));
    deleteIpAllow(cidr);
    recordAudit({ actor: me.username, action: 'ipallow.delete', target: cidr });
  });
}

// ---- billing ----
export async function upsertRateAction(formData: FormData): Promise<void> {
  await flash('/billing', 'レートを保存しました', async () => {
    const me = await requireRole('admin', 'supervisor');
    upsertRate({
      prefix: s(formData.get('prefix')),
      label: s(formData.get('label')) || undefined,
      perMin: Number(formData.get('perMin')),
      setupFee: Number(formData.get('setupFee')) || 0,
    });
    recordAudit({ actor: me.username, action: 'rate.upsert', target: s(formData.get('prefix')) });
  });
}

export async function deleteRateAction(formData: FormData): Promise<void> {
  await flash('/billing', 'レートを削除しました', async () => {
    const me = await requireRole('admin', 'supervisor');
    const prefix = s(formData.get('prefix'));
    deleteRate(prefix);
    recordAudit({ actor: me.username, action: 'rate.delete', target: prefix });
  });
}

// ---- trunks ----
export async function upsertTrunkAction(formData: FormData): Promise<void> {
  await flash('/trunks', 'trunk を保存しました', async () => {
    const me = await requireRole('admin');
    upsertTrunk({
      name: s(formData.get('name')),
      host: s(formData.get('host')),
      port: Number(formData.get('port')) || 5060,
      username: s(formData.get('username')) || undefined,
      secret: s(formData.get('secret')) || undefined,
      registration: formData.get('registration') === 'on',
      fromUser: s(formData.get('fromUser')) || undefined,
      fromDomain: s(formData.get('fromDomain')) || undefined,
      didInbound: s(formData.get('didInbound')) || undefined,
      outboundPrefix: s(formData.get('outboundPrefix')) || undefined,
      note: s(formData.get('note')) || undefined,
    });
    await writeTrunksConfigAndReload();
    recordAudit({ actor: me.username, action: 'trunk.upsert', target: s(formData.get('name')) });
  });
}

export async function deleteTrunkAction(formData: FormData): Promise<void> {
  await flash('/trunks', 'trunk を削除しました', async () => {
    const me = await requireRole('admin');
    const name = s(formData.get('name'));
    deleteTrunk(name);
    await writeTrunksConfigAndReload();
    recordAudit({ actor: me.username, action: 'trunk.delete', target: name });
  });
}

// ---- upgrades ----
export async function scheduleUpgradeAction(formData: FormData): Promise<void> {
  await flash('/upgrades', 'バージョンアップを予約しました', async () => {
    const me = await requireRole('admin');
    const scheduledLocal = s(formData.get('scheduledAt'));
    const scheduledAt = scheduledLocal.length === 16 ? scheduledLocal + ':00Z' : scheduledLocal;
    scheduleUpgrade({
      scheduledAt,
      asteriskImage: s(formData.get('asteriskImage')),
      webImage: s(formData.get('webImage')) || undefined,
      note: s(formData.get('note')) || undefined,
    });
    recordAudit({ actor: me.username, action: 'upgrade.schedule', details: { scheduledAt } });
  });
}

export async function upsertPatientAction(formData: FormData): Promise<void> {
  const id = s(formData.get('id'));
  await flash(`/patients/${id}`, '患者情報を保存しました', async () => {
    const me = await requireAccount();
    upsertPatient({
      id,
      name: s(formData.get('name')) || undefined,
      kana: s(formData.get('kana')) || undefined,
      birthDate: s(formData.get('birthDate')) || undefined,
      phone: s(formData.get('phone')) || undefined,
      note: s(formData.get('note')) || undefined,
    });
    recordAudit({ actor: me.username, action: 'patient.upsert', target: id });
  });
}

export async function deletePatientAction(formData: FormData): Promise<void> {
  await flash('/patients', '患者を削除しました', async () => {
    const me = await requireRole('admin', 'supervisor');
    const id = s(formData.get('id'));
    deletePatient(id);
    recordAudit({ actor: me.username, action: 'patient.delete', target: id });
  });
}

export async function savePatientRecordAction(formData: FormData): Promise<void> {
  const pid = s(formData.get('patientId'));
  await flash(`/patients/${pid}`, '記録を保存しました', async () => {
    const me = await requireAccount();
    createPatientRecord({
      patientId: pid,
      extension: s(formData.get('extension')) || undefined,
      kind: (s(formData.get('kind')) as 'triage' | 'call' | 'note') || 'note',
      summary: s(formData.get('summary')) || undefined,
      note: s(formData.get('note')) || undefined,
    });
    recordAudit({ actor: me.username, action: 'patient.record.create', target: pid });
  });
}

export async function deletePatientRecordAction(formData: FormData): Promise<void> {
  const pid = s(formData.get('patientId'));
  await flash(`/patients/${pid}`, '記録を削除しました', async () => {
    const me = await requireRole('admin', 'supervisor');
    const id = Number(formData.get('id'));
    deletePatientRecord(id);
    recordAudit({ actor: me.username, action: 'patient.record.delete', target: String(id) });
  });
}

export async function updateNetworkAction(formData: FormData): Promise<void> {
  await flash('/network', 'ネットワーク設定を保存しました', async () => {
    const me = await requireRole('admin');
    updateNetworkSettings({
      externalIp: s(formData.get('externalIp')) || undefined,
      externalSignalingIp: s(formData.get('externalSignalingIp')) || undefined,
      localNet: s(formData.get('localNet')) || undefined,
    });
    await writePjsipConfigAndReload();
    recordAudit({
      actor: me.username,
      action: 'network.update',
      details: {
        externalIp: s(formData.get('externalIp')),
        externalSignalingIp: s(formData.get('externalSignalingIp')),
        localNet: s(formData.get('localNet')),
      },
    });
  });
}

export async function deleteUpgradeAction(formData: FormData): Promise<void> {
  await flash('/upgrades', 'バージョンアップ予約を削除しました', async () => {
    const me = await requireRole('admin');
    const id = Number(formData.get('id'));
    deleteUpgrade(id);
    recordAudit({ actor: me.username, action: 'upgrade.delete', target: String(id) });
  });
}
