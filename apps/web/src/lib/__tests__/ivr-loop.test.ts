import { describe, expect, it, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createInMemoryDb } from '../db';
import { detectIvrLoop, createIvrMenu, InvalidIvrError, type IvrMenu, type IvrOption } from '../ivr';

function gotoIvr(targets: string[]): IvrOption[] {
  return targets.map((t, i) => ({ digit: String(i + 1), action: 'goto_ivr' as const, target: t, label: null }));
}

function menu(number: string, targets: string[]): IvrMenu {
  return {
    id: 0,
    number,
    name: null,
    welcomePrompt: null,
    menuPrompt: null,
    invalidPrompt: null,
    goodbyePrompt: null,
    maxRetries: 3,
    waitSeconds: 6,
    afterHoursAction: null,
    afterHoursTarget: null,
    callerIdRoutes: [],
    options: gotoIvr(targets),
    updatedAt: '',
  };
}

describe('detectIvrLoop', () => {
  it('flags a direct self-reference (A -> A)', () => {
    expect(detectIvrLoop([], { number: '8001', options: gotoIvr(['8001']) })).toBe(true);
  });

  it('flags a two-hop cycle (A -> B -> A)', () => {
    expect(detectIvrLoop([menu('8002', ['8001'])], { number: '8001', options: gotoIvr(['8002']) })).toBe(true);
  });

  it('allows an acyclic chain (A -> B -> C)', () => {
    const others = [menu('8002', ['8003']), menu('8003', [])];
    expect(detectIvrLoop(others, { number: '8001', options: gotoIvr(['8002']) })).toBe(false);
  });

  it('allows a menu with no goto_ivr options', () => {
    const options: IvrOption[] = [{ digit: '1', action: 'goto_extension', target: '1001', label: null }];
    expect(detectIvrLoop([], { number: '8001', options })).toBe(false);
  });
});

describe('createIvrMenu rejects loops', () => {
  let db: Database.Database;
  beforeEach(() => {
    db = createInMemoryDb();
  });

  it('creating a back-reference that closes a cycle throws', () => {
    createIvrMenu({ number: '8001', options: gotoIvr(['8002']) }, db); // A -> B (B absent yet)
    expect(() => createIvrMenu({ number: '8002', options: gotoIvr(['8001']) }, db)).toThrow(InvalidIvrError);
  });
});

describe('createIvrMenu validates play_guidance / record_message', () => {
  let db: Database.Database;
  beforeEach(() => {
    db = createInMemoryDb();
  });

  it('rejects play_guidance without a guidance path', () => {
    expect(() =>
      createIvrMenu({ number: '8010', options: [{ digit: '1', action: 'play_guidance', target: null, label: null }] }, db),
    ).toThrow(InvalidIvrError);
  });

  it('accepts play_guidance with a valid path', () => {
    expect(() =>
      createIvrMenu(
        { number: '8011', options: [{ digit: '1', action: 'play_guidance', target: 'custom/info', label: null }] },
        db,
      ),
    ).not.toThrow();
  });

  it('rejects record_message with out-of-range seconds', () => {
    expect(() =>
      createIvrMenu(
        {
          number: '8012',
          options: [{ digit: '1', action: 'record_message', target: null, label: null, recordMaxSeconds: 1 }],
        },
        db,
      ),
    ).toThrow(InvalidIvrError);
  });

  it('rejects business_hours_branch with a transfer action but no target', () => {
    expect(() =>
      createIvrMenu(
        {
          number: '8014',
          options: [
            {
              digit: '0',
              action: 'business_hours_branch',
              target: null,
              label: null,
              openAction: 'goto_extension',
              openTarget: null,
              closedAction: 'hangup',
              closedTarget: null,
            },
          ],
        },
        db,
      ),
    ).toThrow(InvalidIvrError);
  });

  it('accepts business_hours_branch with a valid open transfer and closed hangup', () => {
    expect(() =>
      createIvrMenu(
        {
          number: '8015',
          options: [
            {
              digit: '0',
              action: 'business_hours_branch',
              target: null,
              label: null,
              openAction: 'goto_extension',
              openTarget: '1001',
              closedAction: 'hangup',
              closedTarget: null,
            },
          ],
        },
        db,
      ),
    ).not.toThrow();
  });

  it('persists record_message fields through create + reload', () => {
    const m = createIvrMenu(
      {
        number: '8013',
        options: [
          {
            digit: '1',
            action: 'record_message',
            target: null,
            label: null,
            recordMaxSeconds: 45,
            recordIntroPath: 'custom/intro',
          },
        ],
      },
      db,
    );
    expect(m.options[0].recordMaxSeconds).toBe(45);
    expect(m.options[0].recordIntroPath).toBe('custom/intro');
  });
});
