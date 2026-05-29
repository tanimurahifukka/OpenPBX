// 純粋な型定義 + parse/serialize ユーティリティ。
// クライアントコンポーネントからも安全に import できるよう、ここでは DB / next/headers
// 等のサーバ専用モジュールに依存しない。

export type IvrAction =
  | 'goto_extension'
  | 'goto_ringgroup'
  | 'goto_ivr'
  | 'send_sms'
  | 'play_guidance'
  | 'record_message'
  | 'hangup';

// play_guidance のガイダンス再生後の動作。
export type IvrNextAction = 'return_menu' | 'hangup';

export type AfterHoursAction = 'goto_ivr' | 'goto_extension' | 'goto_voicemail' | 'hangup';

export type CallerIdRouteAction = 'goto_ivr' | 'goto_extension' | 'hangup';

export interface IvrOption {
  digit: string;
  action: IvrAction;
  target: string | null;
  label: string | null;
  // play_guidance: 再生後の動作。record_message では未使用。
  nextAction?: IvrNextAction | null;
  // record_message: 録音最大秒 (既定 60) と録音前アナウンス path。
  recordMaxSeconds?: number | null;
  recordIntroPath?: string | null;
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

// 位置: digit|action|target|label[|nextAction|recordMaxSeconds|recordIntroPath]
// 末尾3フィールドは play_guidance / record_message のときだけ付与する。空のとき
// は付けないので、従来の 4 フィールド形式とラウンドトリップ互換を保つ。
export function parseIvrOptionLines(raw: string): IvrOption[] {
  const out: IvrOption[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    const [digit, action, target, label, nextAction, recordMax, recordIntro] = t
      .split('|')
      .map((x) => x?.trim() ?? '');
    if (!digit || !action) continue;
    const o: IvrOption = {
      digit,
      action: action as IvrAction,
      target: target || null,
      label: label || null,
    };
    if (nextAction) o.nextAction = nextAction as IvrNextAction;
    if (recordMax) {
      const n = Number(recordMax);
      if (Number.isFinite(n)) o.recordMaxSeconds = n;
    }
    if (recordIntro) o.recordIntroPath = recordIntro;
    out.push(o);
  }
  return out;
}

export function serializeIvrOptions(options: IvrOption[]): string {
  return options
    .map((o) => {
      const base = `${o.digit}|${o.action}|${o.target ?? ''}|${o.label ?? ''}`;
      const hasExtra =
        o.nextAction != null || o.recordMaxSeconds != null || o.recordIntroPath != null;
      if (!hasExtra) return base;
      return `${base}|${o.nextAction ?? ''}|${o.recordMaxSeconds ?? ''}|${o.recordIntroPath ?? ''}`;
    })
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
