import type Database from 'better-sqlite3';
import { getDb } from './db';
import { writeDialplanFile, signalAsteriskReload } from './dialplan';
import { renderBusinessHoursDialplan } from './businessHours';
import {
  parseIvrOptionLines as _parseIvrOptionLines,
  serializeIvrOptions as _serializeIvrOptions,
  parseCallerIdRouteLines as _parseCallerIdRouteLines,
  serializeCallerIdRoutes as _serializeCallerIdRoutes,
  type AfterHoursAction,
  type CallerIdRoute,
  type CallerIdRouteAction,
  type IvrAction,
  type IvrMenu,
  type IvrOption,
  type UpsertCallerIdRoute,
} from './ivr-format';

export type {
  AfterHoursAction,
  CallerIdRoute,
  CallerIdRouteAction,
  IvrAction,
  IvrMenu,
  IvrOption,
  UpsertCallerIdRoute,
};

export const parseIvrOptionLines = _parseIvrOptionLines;
export const serializeIvrOptions = _serializeIvrOptions;
export const parseCallerIdRouteLines = _parseCallerIdRouteLines;
export const serializeCallerIdRoutes = _serializeCallerIdRoutes;

export class InvalidIvrError extends Error {}

const NUMBER_RE = /^[0-9]{2,6}$/;
const DIGIT_RE = /^[0-9*#]$/;
const PROMPT_RE = /^[A-Za-z0-9_./-]+$/;
const CID_PATTERN_RE = /^[0-9+]{1,20}\*?$/;
const IVR_ACTIONS: ReadonlyArray<IvrAction> = [
  'goto_extension',
  'goto_ringgroup',
  'goto_ivr',
  'send_sms',
  'hangup',
];
const AFTER_HOURS_ACTIONS: ReadonlyArray<AfterHoursAction> = [
  'goto_ivr',
  'goto_extension',
  'goto_voicemail',
  'hangup',
];
const CALLER_ID_ROUTE_ACTIONS: ReadonlyArray<CallerIdRouteAction> = [
  'goto_ivr',
  'goto_extension',
  'hangup',
];
const TARGET_REQUIRING_ACTIONS: ReadonlyArray<IvrAction> = [
  'goto_extension',
  'goto_ringgroup',
  'goto_ivr',
  'send_sms',
];

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
  after_hours_action: AfterHoursAction | null;
  after_hours_target: string | null;
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
      .prepare('SELECT digit, action, target, label FROM ivr_options WHERE ivr_menu_id = ? ORDER BY rowid ASC')
      .all(menuId) as OptionRow[]
  ).map((r) => ({ digit: r.digit, action: r.action, target: r.target, label: r.label }));
}

interface CallerIdRouteRow {
  id: number;
  position: number;
  pattern: string;
  action: CallerIdRouteAction;
  target: string | null;
  label: string | null;
}

function loadCallerIdRoutes(menuId: number, db: Database.Database): CallerIdRoute[] {
  return (
    db
      .prepare(
        'SELECT id, position, pattern, action, target, label FROM ivr_caller_id_routes WHERE ivr_menu_id = ? ORDER BY position ASC, id ASC',
      )
      .all(menuId) as CallerIdRouteRow[]
  ).map((r) => ({
    id: r.id,
    position: r.position,
    pattern: r.pattern,
    action: r.action,
    target: r.target,
    label: r.label,
  }));
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
    afterHoursAction: r.after_hours_action,
    afterHoursTarget: r.after_hours_target,
    callerIdRoutes: loadCallerIdRoutes(r.id, db),
    options: loadOptions(r.id, db),
    updatedAt: r.updated_at,
  };
}

const MENU_COLUMNS =
  `id, number, name, welcome_prompt, menu_prompt, invalid_prompt, goodbye_prompt,
   max_retries, wait_seconds, after_hours_action, after_hours_target, updated_at`;

export function listIvrMenus(db: Database.Database = getDb()): IvrMenu[] {
  const rows = db
    .prepare(`SELECT ${MENU_COLUMNS} FROM ivr_menus ORDER BY number`)
    .all() as MenuRow[];
  return rows.map((r) => rowTo(r, db));
}

export function getIvrMenu(number: string, db: Database.Database = getDb()): IvrMenu | null {
  const r = db
    .prepare(`SELECT ${MENU_COLUMNS} FROM ivr_menus WHERE number = ?`)
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
  afterHoursAction?: AfterHoursAction | null;
  afterHoursTarget?: string | null;
  callerIdRoutes?: UpsertCallerIdRoute[];
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
    if (!IVR_ACTIONS.includes(o.action)) {
      throw new InvalidIvrError(`action が不正: ${o.action}`);
    }
    if (seen.has(o.digit)) throw new InvalidIvrError(`digit が重複: ${o.digit}`);
    seen.add(o.digit);
    if (TARGET_REQUIRING_ACTIONS.includes(o.action)) {
      if (!o.target) {
        throw new InvalidIvrError(`target が不正: ${o.target}`);
      }
      if (o.action === 'send_sms') {
        if (!/^[a-z0-9_-]+$/.test(o.target)) {
          throw new InvalidIvrError(`SMS テンプレートスラグが不正: ${o.target}`);
        }
      } else {
        if (!NUMBER_RE.test(o.target)) {
          throw new InvalidIvrError(`target が不正: ${o.target}`);
        }
      }
    }
  }
  if (i.afterHoursAction) {
    if (!AFTER_HOURS_ACTIONS.includes(i.afterHoursAction)) {
      throw new InvalidIvrError(`after-hours action が不正: ${i.afterHoursAction}`);
    }
    if (i.afterHoursAction !== 'hangup' && i.afterHoursAction !== 'goto_voicemail') {
      if (!i.afterHoursTarget || !NUMBER_RE.test(i.afterHoursTarget)) {
        throw new InvalidIvrError(`after-hours target が不正: ${i.afterHoursTarget}`);
      }
    }
    if (i.afterHoursAction === 'goto_voicemail') {
      if (!i.afterHoursTarget || !NUMBER_RE.test(i.afterHoursTarget)) {
        throw new InvalidIvrError(`voicemail メールボックスが不正: ${i.afterHoursTarget}`);
      }
    }
  }
  for (const r of i.callerIdRoutes ?? []) {
    if (!CID_PATTERN_RE.test(r.pattern)) {
      throw new InvalidIvrError(`CallerID pattern が不正: ${r.pattern}`);
    }
    if (!CALLER_ID_ROUTE_ACTIONS.includes(r.action)) {
      throw new InvalidIvrError(`CallerID route の action が不正: ${r.action}`);
    }
    if (r.action !== 'hangup') {
      if (!r.target || !NUMBER_RE.test(r.target)) {
        throw new InvalidIvrError(`CallerID route の target が不正: ${r.target}`);
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
                              max_retries, wait_seconds, after_hours_action, after_hours_target, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
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
      input.afterHoursAction ?? null,
      input.afterHoursTarget ?? null,
    );
  replaceOptions(Number(info.lastInsertRowid), input.options, db);
  replaceCallerIdRoutes(Number(info.lastInsertRowid), input.callerIdRoutes ?? [], db);
  return getIvrMenu(input.number, db)!;
}

export function updateIvrMenu(input: UpsertIvrInput, db: Database.Database = getDb()): IvrMenu {
  validate(input);
  const existing = getIvrMenu(input.number, db);
  if (!existing) throw new InvalidIvrError(`IVR ${input.number} は存在しません`);
  db.prepare(
    `UPDATE ivr_menus
        SET name = ?, welcome_prompt = ?, menu_prompt = ?, invalid_prompt = ?, goodbye_prompt = ?,
            max_retries = ?, wait_seconds = ?, after_hours_action = ?, after_hours_target = ?,
            updated_at = datetime('now')
      WHERE id = ?`,
  ).run(
    input.name ?? null,
    input.welcomePrompt ?? null,
    input.menuPrompt ?? null,
    input.invalidPrompt ?? null,
    input.goodbyePrompt ?? null,
    input.maxRetries ?? 3,
    input.waitSeconds ?? 6,
    input.afterHoursAction ?? null,
    input.afterHoursTarget ?? null,
    existing.id,
  );
  replaceOptions(existing.id, input.options, db);
  replaceCallerIdRoutes(existing.id, input.callerIdRoutes ?? [], db);
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

function replaceCallerIdRoutes(
  menuId: number,
  routes: UpsertCallerIdRoute[],
  db: Database.Database,
): void {
  const tx = db.transaction((rs: UpsertCallerIdRoute[]) => {
    db.prepare('DELETE FROM ivr_caller_id_routes WHERE ivr_menu_id = ?').run(menuId);
    const ins = db.prepare(
      'INSERT INTO ivr_caller_id_routes (ivr_menu_id, position, pattern, action, target, label) VALUES (?, ?, ?, ?, ?, ?)',
    );
    rs.forEach((r, i) => {
      ins.run(menuId, i, r.pattern, r.action, r.target ?? null, r.label ?? null);
    });
  });
  tx(routes);
}

function afterHoursTargetGoto(action: AfterHoursAction, target: string | null): string | null {
  if (action === 'hangup') return null;
  if (action === 'goto_ivr' && target) return `Goto(ivr-${target},s,1)`;
  if (action === 'goto_extension' && target) return `Goto(internal,${target},1)`;
  if (action === 'goto_voicemail' && target) return `Goto(voicemail-${target},s,1)`;
  return null;
}

function callerIdRouteGoto(
  action: CallerIdRouteAction,
  target: string | null,
): string | null {
  if (action === 'hangup') return null;
  if (action === 'goto_ivr' && target) return `Goto(ivr-${target},s,1)`;
  if (action === 'goto_extension' && target) return `Goto(internal,${target},1)`;
  return null;
}

export function callerIdMatchExpr(pattern: string): string {
  if (pattern.endsWith('*')) {
    const prefix = pattern.slice(0, -1);
    return `$["\${CALLERID(num):0:${prefix.length}}"="${prefix}"]`;
  }
  return `$["\${CALLERID(num)}"="${pattern}"]`;
}

function optionGoto(opt: IvrOption): string[] | null {
  if (opt.action === 'goto_extension' && opt.target) return [`Goto(internal,${opt.target},1)`];
  if (opt.action === 'goto_ringgroup' && opt.target) return [`Goto(ringgroups,${opt.target},1)`];
  if (opt.action === 'goto_ivr' && opt.target) return [`Goto(ivr-${opt.target},s,1)`];
  if (opt.action === 'send_sms' && opt.target) {
    return [
      `Set(SMS_TEMPLATE=${opt.target})`,
      `System(/usr/local/bin/sms-send.sh \${CALLERID(num)} ${opt.target})`,
      'Playback(custom/sms-sent)',
    ];
  }
  return null;
}

export function renderIvrDialplan(menus: IvrMenu[] = listIvrMenus()): string {
  const lines: string[] = [];
  lines.push('; AUTO-GENERATED by Web (/ivr).');
  lines.push(`; updated_at: ${new Date().toISOString()}`);
  lines.push('');

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
    m.callerIdRoutes.forEach((r, i) => {
      lines.push(` same => n,GotoIf(${callerIdMatchExpr(r.pattern)}?ivr-${m.number},cid-${i},1)`);
    });
    if (m.afterHoursAction) {
      lines.push(' same => n,Gosub(businesshours,s,1)');
      lines.push(` same => n,GotoIf($["\${BUSINESS_HOURS}"="closed"]?ivr-${m.number},after-hours,1)`);
    }
    if (m.welcomePrompt) lines.push(` same => n,Playback(${m.welcomePrompt})`);
    lines.push(' same => n,Set(IVR_TRIES=0)');
    lines.push(' same => n,Goto(menu,1)');
    lines.push('');

    m.callerIdRoutes.forEach((r, i) => {
      const labelComment = r.label ? ` ${r.label}` : '';
      lines.push(`exten => cid-${i},1,NoOp(IVR ${m.number} caller-id route ${i}${labelComment})`);
      const goto = callerIdRouteGoto(r.action, r.target);
      if (goto) {
        lines.push(` same => n,${goto}`);
      } else {
        if (m.goodbyePrompt) lines.push(` same => n,Playback(${m.goodbyePrompt})`);
        lines.push(' same => n,Hangup()');
      }
      lines.push('');
    });

    if (m.afterHoursAction) {
      lines.push(`exten => after-hours,1,NoOp(IVR ${m.number} after-hours: ${m.afterHoursAction})`);
      const afterCmd = afterHoursTargetGoto(m.afterHoursAction, m.afterHoursTarget);
      if (afterCmd) {
        if (m.afterHoursAction === 'goto_voicemail' && m.goodbyePrompt) {
          lines.push(` same => n,Playback(${m.goodbyePrompt})`);
        }
        lines.push(` same => n,${afterCmd}`);
        lines.push(' same => n,Hangup()');
      } else {
        if (m.goodbyePrompt) lines.push(` same => n,Playback(${m.goodbyePrompt})`);
        lines.push(' same => n,Hangup()');
      }
      lines.push('');
    }

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
      const cmds = optionGoto(o);
      if (cmds) {
        for (const cmd of cmds) {
          lines.push(` same => n,${cmd}`);
        }
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
  if (content.includes('Gosub(businesshours')) {
    await writeDialplanFile('business-hours.conf', renderBusinessHoursDialplan());
  }
  await writeDialplanFile('ivr.conf', content);
  await signalAsteriskReload();
}
