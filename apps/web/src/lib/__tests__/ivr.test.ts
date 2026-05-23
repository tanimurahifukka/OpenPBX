import { describe, expect, it } from 'vitest';
import {
  parseIvrOptionLines,
  renderIvrDialplan,
  serializeIvrOptions,
  type IvrMenu,
  type IvrOption,
} from '../ivr';

describe('IVR option string format', () => {
  it('serializes empty array to empty string', () => {
    expect(serializeIvrOptions([])).toBe('');
  });

  it('round-trips through serialize → parse with all fields filled', () => {
    const input: IvrOption[] = [
      { digit: '1', action: 'goto_extension', target: '9001', label: '当日予約' },
      { digit: '2', action: 'goto_ringgroup', target: '6000', label: '看護師グループ' },
      { digit: '0', action: 'hangup', target: null, label: null },
    ];
    expect(parseIvrOptionLines(serializeIvrOptions(input))).toEqual(input);
  });

  it('round-trips with null target and null label', () => {
    const input: IvrOption[] = [
      { digit: '#', action: 'hangup', target: null, label: null },
    ];
    expect(parseIvrOptionLines(serializeIvrOptions(input))).toEqual(input);
  });

  it('preserves user-defined order (does not sort by digit)', () => {
    const input: IvrOption[] = [
      { digit: '9', action: 'goto_extension', target: '1001', label: 'last' },
      { digit: '1', action: 'goto_extension', target: '1002', label: 'middle' },
      { digit: '5', action: 'goto_extension', target: '1003', label: 'first-typed' },
    ];
    const out = parseIvrOptionLines(serializeIvrOptions(input));
    expect(out.map((o) => o.digit)).toEqual(['9', '1', '5']);
  });

  it('parser ignores blank lines and trims whitespace', () => {
    const raw = '\n  1 | goto_extension | 9001 | 当日予約 \n\n2|hangup||\n';
    expect(parseIvrOptionLines(raw)).toEqual([
      { digit: '1', action: 'goto_extension', target: '9001', label: '当日予約' },
      { digit: '2', action: 'hangup', target: null, label: null },
    ]);
  });

  it('parser skips lines missing digit or action', () => {
    expect(parseIvrOptionLines('|goto_extension|9001|\n1||9001|')).toEqual([]);
  });

  it('round-trips goto_ivr nesting action', () => {
    const input: IvrOption[] = [
      { digit: '9', action: 'goto_ivr', target: '9100', label: 'サブメニュー' },
    ];
    expect(parseIvrOptionLines(serializeIvrOptions(input))).toEqual(input);
  });
});

function fixtureMenu(over: Partial<IvrMenu> = {}): IvrMenu {
  return {
    id: 1,
    number: '9000',
    name: 'main',
    welcomePrompt: null,
    menuPrompt: 'custom/ivr-menu',
    invalidPrompt: null,
    goodbyePrompt: null,
    maxRetries: 3,
    waitSeconds: 6,
    afterHoursAction: null,
    afterHoursTarget: null,
    callerIdRoutes: [],
    options: [
      { digit: '1', action: 'goto_extension', target: '9001', label: '当日予約' },
      { digit: '0', action: 'hangup', target: null, label: null },
    ],
    updatedAt: '2026-05-21T00:00:00Z',
    ...over,
  };
}

describe('renderIvrDialplan', () => {
  it('emits a [ivr-<number>] context with menu and option labels', () => {
    const out = renderIvrDialplan([fixtureMenu()]);
    expect(out).toContain('[ivr-9000]');
    expect(out).toContain('exten => s,1,Answer()');
    expect(out).toContain('Background(custom/ivr-menu)');
    expect(out).toContain('exten => 1,1,NoOp(IVR 9000 option 1)');
    expect(out).toContain('Goto(internal,9001,1)');
    expect(out).toContain('exten => 0,1,NoOp(IVR 9000 option 0)');
  });

  it('renders goto_ivr as a Goto into the target IVR context', () => {
    const out = renderIvrDialplan([
      fixtureMenu({
        options: [
          { digit: '9', action: 'goto_ivr', target: '9100', label: 'サブメニュー' },
        ],
      }),
    ]);
    expect(out).toContain('Goto(ivr-9100,s,1)');
  });

  it('renders goto_ringgroup as a Goto into ringgroups context', () => {
    const out = renderIvrDialplan([
      fixtureMenu({
        options: [
          { digit: '2', action: 'goto_ringgroup', target: '6000', label: null },
        ],
      }),
    ]);
    expect(out).toContain('Goto(ringgroups,6000,1)');
  });

  it('does NOT emit business-hours wrapper when afterHoursAction is null', () => {
    const out = renderIvrDialplan([fixtureMenu({ afterHoursAction: null })]);
    expect(out).not.toContain('Gosub(businesshours');
    expect(out).not.toContain('BUSINESS_HOURS');
  });

  it('wraps menu entry with business-hours Gosub when afterHoursAction is set', () => {
    const out = renderIvrDialplan([
      fixtureMenu({ afterHoursAction: 'hangup', afterHoursTarget: null }),
    ]);
    expect(out).toContain('Gosub(businesshours,s,1)');
    expect(out).toContain('GotoIf($["${BUSINESS_HOURS}"="closed"]?ivr-9000,after-hours,1)');
    expect(out).toContain('exten => after-hours');
  });

  it('after-hours goto_ivr routes into target IVR', () => {
    const out = renderIvrDialplan([
      fixtureMenu({ afterHoursAction: 'goto_ivr', afterHoursTarget: '9999' }),
    ]);
    expect(out).toContain('Goto(ivr-9999,s,1)');
  });

  it('after-hours goto_extension routes into internal', () => {
    const out = renderIvrDialplan([
      fixtureMenu({ afterHoursAction: 'goto_extension', afterHoursTarget: '1001' }),
    ]);
    expect(out).toContain('Goto(internal,1001,1)');
  });

  it('emits exact-match CallerID route check on the s extension', () => {
    const out = renderIvrDialplan([
      fixtureMenu({
        callerIdRoutes: [
          { id: 1, position: 0, pattern: '0312345678', action: 'goto_extension', target: '1001', label: 'VIP' },
        ],
      }),
    ]);
    expect(out).toContain('GotoIf($["${CALLERID(num)}"="0312345678"]?ivr-9000,cid-0,1)');
    expect(out).toContain('exten => cid-0,1,NoOp(IVR 9000 caller-id route 0 VIP)');
    expect(out).toContain('Goto(internal,1001,1)');
  });

  it('emits prefix-match CallerID route using substring comparison', () => {
    const out = renderIvrDialplan([
      fixtureMenu({
        callerIdRoutes: [
          { id: 1, position: 0, pattern: '090*', action: 'hangup', target: null, label: null },
        ],
      }),
    ]);
    expect(out).toContain('GotoIf($["${CALLERID(num):0:3}"="090"]?ivr-9000,cid-0,1)');
  });

  it('CallerID route to goto_ivr nests properly', () => {
    const out = renderIvrDialplan([
      fixtureMenu({
        callerIdRoutes: [
          { id: 1, position: 0, pattern: '12345', action: 'goto_ivr', target: '9100', label: null },
        ],
      }),
    ]);
    expect(out).toContain('Goto(ivr-9100,s,1)');
  });

  it('does NOT emit CallerID routing block when routes are empty', () => {
    const out = renderIvrDialplan([fixtureMenu({ callerIdRoutes: [] })]);
    expect(out).not.toContain('CALLERID(num)');
    expect(out).not.toContain('exten => cid-');
  });
});
