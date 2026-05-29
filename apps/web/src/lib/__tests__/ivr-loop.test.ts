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
