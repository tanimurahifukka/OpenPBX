import type Database from 'better-sqlite3';
import { getDb } from './db';
import { writeDialplanFile, signalAsteriskReload } from './dialplan';

export type RingStrategy = 'ringall' | 'linear';
export type FallbackAction = 'goto_extension' | 'goto_ivr' | 'goto_voicemail' | 'hangup';

export interface RingGroup {
  id: number;
  number: string;
  name: string | null;
  strategy: RingStrategy;
  ringSeconds: number;
  fallbackExtension: string | null;
  fallbackAction: FallbackAction;
  fallbackTarget: string | null;
  members: string[];
  updatedAt: string;
}

export class InvalidRingGroupError extends Error {}

const NUMBER_RE = /^[0-9]{2,6}$/;
const STRATEGIES = new Set<RingStrategy>(['ringall', 'linear']);

const FALLBACK_ACTIONS: ReadonlyArray<FallbackAction> = ['goto_extension', 'goto_ivr', 'goto_voicemail', 'hangup'];

interface Row {
  id: number;
  number: string;
  name: string | null;
  strategy: RingStrategy;
  ring_seconds: number;
  fallback_extension: string | null;
  fallback_action: FallbackAction | null;
  fallback_target: string | null;
  updated_at: string;
}

function getMembers(id: number, db: Database.Database): string[] {
  return (
    db
      .prepare(
        'SELECT extension_number FROM ring_group_members WHERE ring_group_id = ? ORDER BY priority, extension_number',
      )
      .all(id) as Array<{ extension_number: string }>
  ).map((r) => r.extension_number);
}

function rowToGroup(r: Row, db: Database.Database): RingGroup {
  let fallbackAction: FallbackAction = 'hangup';
  let fallbackTarget: string | null = null;
  if (r.fallback_action && FALLBACK_ACTIONS.includes(r.fallback_action)) {
    fallbackAction = r.fallback_action;
    fallbackTarget = r.fallback_target;
  } else if (r.fallback_extension) {
    fallbackAction = 'goto_extension';
    fallbackTarget = r.fallback_extension;
  }
  return {
    id: r.id,
    number: r.number,
    name: r.name,
    strategy: r.strategy,
    ringSeconds: r.ring_seconds,
    fallbackExtension: r.fallback_extension,
    fallbackAction,
    fallbackTarget,
    members: getMembers(r.id, db),
    updatedAt: r.updated_at,
  };
}

export function listRingGroups(db: Database.Database = getDb()): RingGroup[] {
  const rows = db
    .prepare(
      'SELECT id, number, name, strategy, ring_seconds, fallback_extension, fallback_action, fallback_target, updated_at FROM ring_groups ORDER BY number',
    )
    .all() as Row[];
  return rows.map((r) => rowToGroup(r, db));
}

export function getRingGroup(number: string, db: Database.Database = getDb()): RingGroup | null {
  const row = db
    .prepare(
      'SELECT id, number, name, strategy, ring_seconds, fallback_extension, fallback_action, fallback_target, updated_at FROM ring_groups WHERE number = ?',
    )
    .get(number) as Row | undefined;
  return row ? rowToGroup(row, db) : null;
}

export interface UpsertRingGroupInput {
  number: string;
  name?: string;
  strategy?: RingStrategy;
  ringSeconds?: number;
  fallbackExtension?: string;
  fallbackAction?: FallbackAction;
  fallbackTarget?: string | null;
  members?: string[];
}

function validate(input: UpsertRingGroupInput): void {
  if (!NUMBER_RE.test(input.number)) {
    throw new InvalidRingGroupError('着信グループ番号は 2〜6 桁の数字');
  }
  const s = input.strategy ?? 'ringall';
  if (!STRATEGIES.has(s)) {
    throw new InvalidRingGroupError(`未知の strategy: ${s}`);
  }
  const sec = input.ringSeconds ?? 30;
  if (!Number.isInteger(sec) || sec < 5 || sec > 180) {
    throw new InvalidRingGroupError('呼出時間は 5〜180 秒');
  }
  for (const m of input.members ?? []) {
    if (!NUMBER_RE.test(m)) throw new InvalidRingGroupError(`メンバー番号が不正: ${m}`);
  }
  if (input.fallbackExtension && !NUMBER_RE.test(input.fallbackExtension)) {
    throw new InvalidRingGroupError('fallback も内線番号形式');
  }
  const fa = input.fallbackAction ?? 'hangup';
  if (!FALLBACK_ACTIONS.includes(fa)) {
    throw new InvalidRingGroupError(`未知の fallback action: ${fa}`);
  }
  if (fa !== 'hangup' && input.fallbackTarget && !NUMBER_RE.test(input.fallbackTarget)) {
    throw new InvalidRingGroupError('fallback target は番号形式');
  }
}

export function createRingGroup(input: UpsertRingGroupInput, db: Database.Database = getDb()): RingGroup {
  validate(input);
  if (getRingGroup(input.number, db)) {
    throw new InvalidRingGroupError(`着信グループ ${input.number} は既に存在します`);
  }
  const info = db
    .prepare(
      `INSERT INTO ring_groups (number, name, strategy, ring_seconds, fallback_extension, fallback_action, fallback_target, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    )
    .run(
      input.number,
      input.name ?? null,
      input.strategy ?? 'ringall',
      input.ringSeconds ?? 30,
      input.fallbackExtension ?? null,
      input.fallbackAction ?? null,
      input.fallbackTarget ?? null,
    );
  const id = Number(info.lastInsertRowid);
  replaceMembers(id, input.members ?? [], db);
  return getRingGroup(input.number, db)!;
}

export function updateRingGroup(input: UpsertRingGroupInput, db: Database.Database = getDb()): RingGroup {
  validate(input);
  const existing = getRingGroup(input.number, db);
  if (!existing) throw new InvalidRingGroupError(`着信グループ ${input.number} は存在しません`);
  db.prepare(
    `UPDATE ring_groups
        SET name = ?, strategy = ?, ring_seconds = ?, fallback_extension = ?, fallback_action = ?, fallback_target = ?, updated_at = datetime('now')
      WHERE id = ?`,
  ).run(
    input.name ?? null,
    input.strategy ?? 'ringall',
    input.ringSeconds ?? 30,
    input.fallbackExtension ?? null,
    input.fallbackAction ?? null,
    input.fallbackTarget ?? null,
    existing.id,
  );
  if (input.members !== undefined) replaceMembers(existing.id, input.members, db);
  return getRingGroup(input.number, db)!;
}

export function deleteRingGroup(number: string, db: Database.Database = getDb()): boolean {
  const r = db.prepare('DELETE FROM ring_groups WHERE number = ?').run(number);
  return r.changes > 0;
}

function replaceMembers(groupId: number, members: string[], db: Database.Database): void {
  const tx = db.transaction((m: string[]) => {
    db.prepare('DELETE FROM ring_group_members WHERE ring_group_id = ?').run(groupId);
    const ins = db.prepare(
      'INSERT INTO ring_group_members (ring_group_id, extension_number, priority) VALUES (?, ?, ?)',
    );
    m.forEach((n, i) => ins.run(groupId, n, i));
  });
  tx(members);
}

function fallbackDialplan(g: RingGroup): string[] {
  const action = g.fallbackAction;
  const target = g.fallbackTarget;
  if (action === 'goto_extension' && target) return [`Goto(internal,${target},1)`];
  if (action === 'goto_ivr' && target) return [`Goto(ivr-${target},s,1)`];
  if (action === 'goto_voicemail' && target) return [`VoiceMail(${target}@default,u)`, 'Hangup()'];
  return ['Hangup()'];
}

// dialplan.d/ringgroups.conf を全グループから再生成する。
export function renderRingGroupDialplan(groups: RingGroup[]): string {
  const lines: string[] = [];
  lines.push('; AUTO-GENERATED by Web (/ring-groups). 手で編集しないこと。');
  lines.push(`; updated_at: ${new Date().toISOString()}`);
  lines.push('');
  lines.push('[ringgroups]');
  if (groups.length === 0) {
    lines.push('; (まだグループがありません)');
  }
  for (const g of groups) {
    lines.push(`; --- ${g.number} ${g.name ?? ''} (${g.strategy}) ---`);
    if (g.members.length === 0) {
      lines.push(`exten => ${g.number},1,NoOp(empty ring group ${g.number})`);
      lines.push(' same => n,Playback(invalid)');
      lines.push(' same => n,Hangup()');
      lines.push('');
      continue;
    }
    if (g.strategy === 'ringall') {
      const dialString = g.members.map((m) => `PJSIP/${m}`).join('&');
      lines.push(`exten => ${g.number},1,NoOp(ring group ${g.number} ringall)`);
      lines.push(` same => n,Dial(${dialString},${g.ringSeconds},tTm)`);
    } else {
      lines.push(`exten => ${g.number},1,NoOp(ring group ${g.number} linear)`);
      g.members.forEach((m) => {
        lines.push(` same => n,Dial(PJSIP/${m},${g.ringSeconds},tTm)`);
      });
    }
    const fb = fallbackDialplan(g);
    for (const cmd of fb) {
      lines.push(` same => n,${cmd}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

export async function writeRingGroupDialplanAndReload(): Promise<void> {
  const groups = listRingGroups();
  const content = renderRingGroupDialplan(groups);
  await writeDialplanFile('ringgroups.conf', content);
  await signalAsteriskReload();
}
