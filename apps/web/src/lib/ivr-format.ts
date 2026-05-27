// 純粋な型定義 + parse/serialize ユーティリティ。
// クライアントコンポーネントからも安全に import できるよう、ここでは DB / next/headers
// 等のサーバ専用モジュールに依存しない。

export type IvrAction = 'goto_extension' | 'goto_ringgroup' | 'goto_ivr' | 'send_sms' | 'hangup';

export type AfterHoursAction = 'goto_ivr' | 'goto_extension' | 'goto_voicemail' | 'hangup';

export type CallerIdRouteAction = 'goto_ivr' | 'goto_extension' | 'hangup';

export interface IvrOption {
  digit: string;
  action: IvrAction;
  target: string | null;
  label: string | null;
}

export interface CallerIdRoute {
  id: number;
  position: number;
  pattern: string;
  action: CallerIdRouteAction;
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
  afterHoursAction: AfterHoursAction | null;
  afterHoursTarget: string | null;
  callerIdRoutes: CallerIdRoute[];
  options: IvrOption[];
  updatedAt: string;
}

export interface UpsertCallerIdRoute {
  pattern: string;
  action: CallerIdRouteAction;
  target: string | null;
  label: string | null;
}

export function parseIvrOptionLines(raw: string): IvrOption[] {
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

export function serializeIvrOptions(options: IvrOption[]): string {
  return options
    .map((o) => `${o.digit}|${o.action}|${o.target ?? ''}|${o.label ?? ''}`)
    .join('\n');
}

export function parseCallerIdRouteLines(raw: string): UpsertCallerIdRoute[] {
  const out: UpsertCallerIdRoute[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    const [pattern, action, target, label] = t.split('|').map((x) => x?.trim() ?? '');
    if (!pattern || !action) continue;
    if (action !== 'goto_ivr' && action !== 'goto_extension' && action !== 'hangup') continue;
    out.push({
      pattern,
      action,
      target: target || null,
      label: label || null,
    });
  }
  return out;
}

export function serializeCallerIdRoutes(routes: CallerIdRoute[]): string {
  return routes
    .map((r) => `${r.pattern}|${r.action}|${r.target ?? ''}|${r.label ?? ''}`)
    .join('\n');
}
