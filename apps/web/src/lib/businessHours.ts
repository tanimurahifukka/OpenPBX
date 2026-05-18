import type Database from 'better-sqlite3';
import { getDb } from './db';
import { writeDialplanFile, signalAsteriskReload } from './dialplan';

export interface Holiday {
  date: string; // YYYY-MM-DD
  name: string;
  updatedAt: string;
}

export interface TimeRule {
  id: number;
  name: string;
  days: string;
  startTime: string;
  endTime: string;
  note: string | null;
  updatedAt: string;
}

export class InvalidBusinessHoursError extends Error {}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;
const DAYS_RE = /^[*a-z&,-]+$/;
const NAME_RE = /^[^,|]{1,32}$/; // ,| 以外 1-32 文字 (日本語可)

// 曜日チェックボックス (mon..sun) の配列を Asterisk dialplan の days_of_week 表記に変換する。
// 入力: ["mon","tue","wed","thu","fri"] → "mon-fri"
// 入力: ["mon","wed","fri"] → "mon&wed&fri"
// 入力: 全選択 → "*"
const WEEK = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
type Day = (typeof WEEK)[number];

export function daysToAsterisk(picked: string[]): string {
  const set = new Set(picked.filter((d) => (WEEK as readonly string[]).includes(d)));
  if (set.size === 0) return '*';
  if (set.size === 7) return '*';
  // 連続範囲を検出
  const indices = WEEK.map((d, i) => (set.has(d) ? i : -1)).filter((i) => i >= 0);
  // 全部隣接していれば "start-end"
  let consecutive = true;
  for (let i = 1; i < indices.length; i++) {
    if (indices[i] !== indices[i - 1] + 1) {
      consecutive = false;
      break;
    }
  }
  if (consecutive && indices.length >= 2) {
    return `${WEEK[indices[0]]}-${WEEK[indices[indices.length - 1]]}`;
  }
  return indices.map((i) => WEEK[i]).join('&');
}

// Asterisk 表記 ("mon-fri" / "mon&wed" / "*") から配列に逆変換 (UI 復元用)
export function asteriskToDays(value: string): Day[] {
  if (!value || value === '*') return [...WEEK];
  const out = new Set<Day>();
  for (const part of value.split('&')) {
    const m = part.match(/^([a-z]{3})-([a-z]{3})$/);
    if (m) {
      const s = WEEK.indexOf(m[1] as Day);
      const e = WEEK.indexOf(m[2] as Day);
      if (s >= 0 && e >= 0) for (let i = s; i <= e; i++) out.add(WEEK[i]);
    } else if ((WEEK as readonly string[]).includes(part)) {
      out.add(part as Day);
    }
  }
  return [...WEEK].filter((d) => out.has(d));
}

// ---- holidays ----
interface HolidayRow {
  date: string;
  name: string;
  updated_at: string;
}

export function listHolidays(db: Database.Database = getDb()): Holiday[] {
  return (
    db.prepare('SELECT date, name, updated_at FROM holidays ORDER BY date').all() as HolidayRow[]
  ).map((r) => ({ date: r.date, name: r.name, updatedAt: r.updated_at }));
}

export function upsertHoliday(date: string, name: string, db: Database.Database = getDb()): void {
  if (!DATE_RE.test(date)) throw new InvalidBusinessHoursError('日付は YYYY-MM-DD 形式');
  if (!name.trim()) throw new InvalidBusinessHoursError('名前は必須');
  db.prepare(
    `INSERT INTO holidays (date, name, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(date) DO UPDATE SET name = excluded.name, updated_at = datetime('now')`,
  ).run(date, name.trim());
}

export function deleteHoliday(date: string, db: Database.Database = getDb()): boolean {
  return db.prepare('DELETE FROM holidays WHERE date = ?').run(date).changes > 0;
}

// ---- time rules ----
interface TimeRuleRow {
  id: number;
  name: string;
  days: string;
  start_time: string;
  end_time: string;
  note: string | null;
  updated_at: string;
}

export function listTimeRules(db: Database.Database = getDb()): TimeRule[] {
  return (
    db
      .prepare(
        'SELECT id, name, days, start_time, end_time, note, updated_at FROM time_rules ORDER BY name',
      )
      .all() as TimeRuleRow[]
  ).map((r) => ({
    id: r.id,
    name: r.name,
    days: r.days,
    startTime: r.start_time,
    endTime: r.end_time,
    note: r.note,
    updatedAt: r.updated_at,
  }));
}

export interface UpsertTimeRuleInput {
  id?: number;
  name: string;
  days: string;
  startTime: string;
  endTime: string;
  note?: string;
}

function validateRule(i: UpsertTimeRuleInput): void {
  if (!NAME_RE.test(i.name)) throw new InvalidBusinessHoursError('名前は 1-32 文字 (, | 不可)');
  if (!DAYS_RE.test(i.days)) throw new InvalidBusinessHoursError('曜日指定が不正');
  if (!TIME_RE.test(i.startTime)) throw new InvalidBusinessHoursError('開始時刻は HH:MM');
  if (!TIME_RE.test(i.endTime)) throw new InvalidBusinessHoursError('終了時刻は HH:MM');
}

export function createTimeRule(input: UpsertTimeRuleInput, db: Database.Database = getDb()): TimeRule {
  validateRule(input);
  const info = db
    .prepare(
      `INSERT INTO time_rules (name, days, start_time, end_time, note, updated_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))`,
    )
    .run(input.name, input.days, input.startTime, input.endTime, input.note ?? null);
  return listTimeRules(db).find((r) => r.id === Number(info.lastInsertRowid))!;
}

export function updateTimeRule(input: UpsertTimeRuleInput, db: Database.Database = getDb()): TimeRule | null {
  validateRule(input);
  if (!input.id) throw new InvalidBusinessHoursError('id required');
  const r = db
    .prepare(
      `UPDATE time_rules
          SET name = ?, days = ?, start_time = ?, end_time = ?, note = ?, updated_at = datetime('now')
        WHERE id = ?`,
    )
    .run(input.name, input.days, input.startTime, input.endTime, input.note ?? null, input.id);
  if (r.changes === 0) return null;
  return listTimeRules(db).find((x) => x.id === input.id) ?? null;
}

export function deleteTimeRule(id: number, db: Database.Database = getDb()): boolean {
  return db.prepare('DELETE FROM time_rules WHERE id = ?').run(id).changes > 0;
}

// ---- dialplan 生成 ----
// [businesshours] context を生成して、内線/外線フローから Gosub で参照する想定。
// 使い方 (将来):
//   same => n,Gosub(businesshours,s,1(open))     ; CHAN(open) に 'yes'/'no' が入る
export function renderBusinessHoursDialplan(): string {
  const rules = listTimeRules();
  const holidays = listHolidays();
  const lines: string[] = [];
  lines.push('; AUTO-GENERATED by Web (/business-hours).');
  lines.push(`; updated_at: ${new Date().toISOString()}`);
  lines.push('');
  lines.push('[businesshours]');
  // 祝日チェック (GotoIfTime に YYYY-MM-DD は使えないので、今日の日付と比較)
  lines.push('exten => s,1,NoOp(business hours check)');
  lines.push(' same => n,Set(TODAY=${STRFTIME(${EPOCH},,%Y-%m-%d)})');
  if (holidays.length > 0) {
    const cond = holidays.map((h) => `$["${h.date}"="${ '${TODAY}'}"]`).join(',');
    // 単一の GotoIf チェーンで書く
    holidays.forEach((h, i) => {
      lines.push(` same => n,GotoIf($["${h.date}" = "\${TODAY}"]?closed)`);
    });
  }
  // time rules: 「いずれか」の rule にマッチしたら open。
  rules.forEach((r) => {
    lines.push(
      ` same => n,GotoIfTime(${r.startTime}-${r.endTime},${r.days},*,*?open)`,
    );
  });
  // どれにもマッチしなかった → closed
  lines.push(' same => n,Set(BUSINESS_HOURS=closed)');
  lines.push(' same => n,Return()');
  lines.push(' same => n(open),Set(BUSINESS_HOURS=open)');
  lines.push(' same => n,Return()');
  lines.push(' same => n(closed),Set(BUSINESS_HOURS=closed)');
  lines.push(' same => n,Return()');
  lines.push('');
  return lines.join('\n');
}

export async function writeBusinessHoursAndReload(): Promise<void> {
  const content = renderBusinessHoursDialplan();
  await writeDialplanFile('business-hours.conf', content);
  await signalAsteriskReload();
}
