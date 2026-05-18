import type Database from 'better-sqlite3';
import { getDb } from './db';
import { writeDialplanFile, signalAsteriskReload } from './dialplan';

export type IvrAction = 'goto_extension' | 'goto_ringgroup' | 'hangup';

export interface IvrOption {
  digit: string;
  action: IvrAction;
  target: string | null;
  label: string | null;
}

export interface IvrMenu {
  id: number;
  number: string;
  name: string | null;
  welcomePrompt: string | null;
  menuPrompt: string | null;
  invalidPrompt: string | null;
  goodbyePrompt: string | null;
  maxRetries: number;
  waitSeconds: number;
  options: IvrOption[];
  updatedAt: string;
}

export class InvalidIvrError extends Error {}

const NUMBER_RE = /^[0-9]{2,6}$/;
const DIGIT_RE = /^[0-9*#]$/;
const PROMPT_RE = /^[A-Za-z0-9_./-]+$/;

interface MenuRow {
  id: number;
  number: string;
  name: string | null;
  welcome_prompt: string | null;
  menu_prompt: string | null;
  invalid_prompt: string | null;
  goodbye_prompt: string | null;
  max_retries: number;
  wait_seconds: number;
  updated_at: string;
}

interface OptionRow {
  ivr_menu_id: number;
  digit: string;
  action: IvrAction;
  target: string | null;
  label: string | null;
}

function loadOptions(menuId: number, db: Database.Database): IvrOption[] {
  return (
    db
      .prepare('SELECT digit, action, target, label FROM ivr_options WHERE ivr_menu_id = ? ORDER BY digit')
      .all(menuId) as OptionRow[]
  ).map((r) => ({ digit: r.digit, action: r.action, target: r.target, label: r.label }));
}

function rowTo(r: MenuRow, db: Database.Database): IvrMenu {
  return {
    id: r.id,
    number: r.number,
    name: r.name,
    welcomePrompt: r.welcome_prompt,
    menuPrompt: r.menu_prompt,
    invalidPrompt: r.invalid_prompt,
    goodbyePrompt: r.goodbye_prompt,
    maxRetries: r.max_retries,
    waitSeconds: r.wait_seconds,
    options: loadOptions(r.id, db),
    updatedAt: r.updated_at,
  };
}

export function listIvrMenus(db: Database.Database = getDb()): IvrMenu[] {
  const rows = db
    .prepare(
      `SELECT id, number, name, welcome_prompt, menu_prompt, invalid_prompt, goodbye_prompt,
              max_retries, wait_seconds, updated_at FROM ivr_menus ORDER BY number`,
    )
    .all() as MenuRow[];
  return rows.map((r) => rowTo(r, db));
}

export function getIvrMenu(number: string, db: Database.Database = getDb()): IvrMenu | null {
  const r = db
    .prepare(
      `SELECT id, number, name, welcome_prompt, menu_prompt, invalid_prompt, goodbye_prompt,
              max_retries, wait_seconds, updated_at FROM ivr_menus WHERE number = ?`,
    )
    .get(number) as MenuRow | undefined;
  return r ? rowTo(r, db) : null;
}

export interface UpsertIvrInput {
  number: string;
  name?: string;
  welcomePrompt?: string;
  menuPrompt?: string;
  invalidPrompt?: string;
  goodbyePrompt?: string;
  maxRetries?: number;
  waitSeconds?: number;
  options: IvrOption[];
}

function validate(i: UpsertIvrInput): void {
  if (!NUMBER_RE.test(i.number)) throw new InvalidIvrError('IVR 番号は 2〜6 桁');
  const prompts = [i.welcomePrompt, i.menuPrompt, i.invalidPrompt, i.goodbyePrompt];
  for (const p of prompts) {
    if (p && !PROMPT_RE.test(p)) {
      throw new InvalidIvrError(`prompt 名が不正: ${p}`);
    }
  }
  const seen = new Set<string>();
  for (const o of i.options) {
    if (!DIGIT_RE.test(o.digit)) throw new InvalidIvrError(`digit が不正: ${o.digit}`);
    if (seen.has(o.digit)) throw new InvalidIvrError(`digit が重複: ${o.digit}`);
    seen.add(o.digit);
    if (o.action === 'goto_extension' || o.action === 'goto_ringgroup') {
      if (!o.target || !NUMBER_RE.test(o.target)) {
        throw new InvalidIvrError(`target が不正: ${o.target}`);
      }
    }
  }
}

export function createIvrMenu(input: UpsertIvrInput, db: Database.Database = getDb()): IvrMenu {
  validate(input);
  if (getIvrMenu(input.number, db)) throw new InvalidIvrError(`IVR ${input.number} は既存`);
  const info = db
    .prepare(
      `INSERT INTO ivr_menus (number, name, welcome_prompt, menu_prompt, invalid_prompt, goodbye_prompt,
                              max_retries, wait_seconds, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    )
    .run(
      input.number,
      input.name ?? null,
      input.welcomePrompt ?? null,
      input.menuPrompt ?? null,
      input.invalidPrompt ?? null,
      input.goodbyePrompt ?? null,
      input.maxRetries ?? 3,
      input.waitSeconds ?? 6,
    );
  replaceOptions(Number(info.lastInsertRowid), input.options, db);
  return getIvrMenu(input.number, db)!;
}

export function updateIvrMenu(input: UpsertIvrInput, db: Database.Database = getDb()): IvrMenu {
  validate(input);
  const existing = getIvrMenu(input.number, db);
  if (!existing) throw new InvalidIvrError(`IVR ${input.number} は存在しません`);
  db.prepare(
    `UPDATE ivr_menus
        SET name = ?, welcome_prompt = ?, menu_prompt = ?, invalid_prompt = ?, goodbye_prompt = ?,
            max_retries = ?, wait_seconds = ?, updated_at = datetime('now')
      WHERE id = ?`,
  ).run(
    input.name ?? null,
    input.welcomePrompt ?? null,
    input.menuPrompt ?? null,
    input.invalidPrompt ?? null,
    input.goodbyePrompt ?? null,
    input.maxRetries ?? 3,
    input.waitSeconds ?? 6,
    existing.id,
  );
  replaceOptions(existing.id, input.options, db);
  return getIvrMenu(input.number, db)!;
}

export function deleteIvrMenu(number: string, db: Database.Database = getDb()): boolean {
  return db.prepare('DELETE FROM ivr_menus WHERE number = ?').run(number).changes > 0;
}

function replaceOptions(menuId: number, options: IvrOption[], db: Database.Database): void {
  const tx = db.transaction((opts: IvrOption[]) => {
    db.prepare('DELETE FROM ivr_options WHERE ivr_menu_id = ?').run(menuId);
    const ins = db.prepare(
      'INSERT INTO ivr_options (ivr_menu_id, digit, action, target, label) VALUES (?, ?, ?, ?, ?)',
    );
    for (const o of opts) {
      ins.run(menuId, o.digit, o.action, o.target ?? null, o.label ?? null);
    }
  });
  tx(options);
}

// dialplan 生成: 各 IVR を context [ivr-<number>] にする。internal context から
// `exten => <number>,1,Goto(ivr-<number>,s,1)` で入る。
export function renderIvrDialplan(): string {
  const menus = listIvrMenus();
  const lines: string[] = [];
  lines.push('; AUTO-GENERATED by Web (/ivr).');
  lines.push(`; updated_at: ${new Date().toISOString()}`);
  lines.push('');

  // internal にエントリ追加
  lines.push('[internal]');
  for (const m of menus) {
    lines.push(`exten => ${m.number},1,NoOp(IVR ${m.number} entry)`);
    lines.push(` same => n,Goto(ivr-${m.number},s,1)`);
  }
  lines.push('');

  for (const m of menus) {
    lines.push(`[ivr-${m.number}]`);
    lines.push(`exten => s,1,Answer()`);
    lines.push(` same => n,Wait(1)`);
    if (m.welcomePrompt) lines.push(` same => n,Playback(${m.welcomePrompt})`);
    lines.push(' same => n,Set(IVR_TRIES=0)');
    lines.push(' same => n,Goto(menu,1)');
    lines.push('');
    lines.push('exten => menu,1,Set(IVR_TRIES=$[${IVR_TRIES} + 1])');
    lines.push(` same => n,GotoIf($[\${IVR_TRIES} > ${m.maxRetries}]?give-up)`);
    if (m.menuPrompt) lines.push(` same => n,Background(${m.menuPrompt})`);
    lines.push(` same => n,WaitExten(${m.waitSeconds})`);
    if (m.goodbyePrompt) {
      lines.push(` same => n(give-up),Playback(${m.goodbyePrompt})`);
    } else {
      lines.push(' same => n(give-up),NoOp(IVR give-up)');
    }
    lines.push(' same => n,Hangup()');
    lines.push('');
    for (const o of m.options) {
      lines.push(`; ${o.label ?? ''}`);
      lines.push(`exten => ${o.digit},1,NoOp(IVR ${m.number} option ${o.digit})`);
      if (o.action === 'goto_extension' && o.target) {
        lines.push(` same => n,Goto(internal,${o.target},1)`);
      } else if (o.action === 'goto_ringgroup' && o.target) {
        lines.push(` same => n,Goto(ringgroups,${o.target},1)`);
      } else {
        if (m.goodbyePrompt) lines.push(` same => n,Playback(${m.goodbyePrompt})`);
        lines.push(' same => n,Hangup()');
      }
      lines.push('');
    }
    const invalidPrompt = m.invalidPrompt ?? null;
    if (invalidPrompt) {
      lines.push(`exten => t,1,Playback(${invalidPrompt})`);
      lines.push(' same => n,Goto(menu,1)');
      lines.push(`exten => i,1,Playback(${invalidPrompt})`);
      lines.push(' same => n,Goto(menu,1)');
    } else {
      lines.push('exten => t,1,Goto(menu,1)');
      lines.push('exten => i,1,Goto(menu,1)');
    }
    lines.push('');
  }
  return lines.join('\n');
}

export async function writeIvrDialplanAndReload(): Promise<void> {
  const content = renderIvrDialplan();
  await writeDialplanFile('ivr.conf', content);
  await signalAsteriskReload();
}
