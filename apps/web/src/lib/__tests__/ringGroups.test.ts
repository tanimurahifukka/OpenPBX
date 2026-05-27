import { describe, expect, it, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createInMemoryDb } from '../db';
import {
  createRingGroup,
  getRingGroup,
  renderRingGroupDialplan,
  type RingGroup,
} from '../ringGroups';

let db: Database.Database;

beforeEach(() => {
  db = createInMemoryDb();
});

describe('ringGroup fallbackAction', () => {
  it('defaults to hangup when no fallback set', () => {
    const g = createRingGroup({ number: '6000', members: ['1001'] }, db);
    expect(g.fallbackAction).toBe('hangup');
    expect(g.fallbackTarget).toBeNull();
  });

  it('stores and reads fallbackAction', () => {
    const g = createRingGroup({
      number: '6000',
      members: ['1001'],
      fallbackAction: 'goto_voicemail',
      fallbackTarget: '9100',
    }, db);
    expect(g.fallbackAction).toBe('goto_voicemail');
    expect(g.fallbackTarget).toBe('9100');
  });

  it('legacy fallbackExtension maps to goto_extension', () => {
    const g = createRingGroup({
      number: '6000',
      members: ['1001'],
      fallbackExtension: '9002',
    }, db);
    expect(g.fallbackAction).toBe('goto_extension');
    expect(g.fallbackTarget).toBe('9002');
  });
});

describe('renderRingGroupDialplan fallback', () => {
  function fixture(over: Partial<RingGroup> = {}): RingGroup {
    return {
      id: 1,
      number: '6000',
      name: null,
      strategy: 'ringall',
      ringSeconds: 30,
      fallbackExtension: null,
      fallbackAction: 'hangup',
      fallbackTarget: null,
      members: ['1001', '1002'],
      updatedAt: '',
      ...over,
    };
  }

  it('renders Hangup when fallbackAction is hangup', () => {
    const out = renderRingGroupDialplan([fixture()]);
    expect(out).toContain('Hangup()');
    expect(out).not.toContain('Goto(');
  });

  it('renders goto_extension fallback', () => {
    const out = renderRingGroupDialplan([fixture({
      fallbackAction: 'goto_extension',
      fallbackTarget: '9002',
    })]);
    expect(out).toContain('Goto(internal,9002,1)');
  });

  it('renders goto_ivr fallback', () => {
    const out = renderRingGroupDialplan([fixture({
      fallbackAction: 'goto_ivr',
      fallbackTarget: '9000',
    })]);
    expect(out).toContain('Goto(ivr-9000,s,1)');
  });

  it('renders goto_voicemail fallback', () => {
    const out = renderRingGroupDialplan([fixture({
      fallbackAction: 'goto_voicemail',
      fallbackTarget: '9100',
    })]);
    expect(out).toContain('VoiceMail(9100@default,u)');
    expect(out).toContain('Hangup()');
  });
});
