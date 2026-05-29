import { describe, expect, it, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createInMemoryDb } from '../db';
import {
  addToBlacklist,
  getBlacklistEntry,
  deleteBlacklistEntry,
  listBlacklist,
  renderBlacklistDialplan,
  InvalidBlacklistError,
  type BlacklistEntry,
} from '../blacklist';

function entry(over: Partial<BlacklistEntry> = {}): BlacklistEntry {
  return { number: '0312345678', reason: null, hits: 0, createdAt: '', updatedAt: '', ...over };
}

describe('blacklist CRUD', () => {
  let db: Database.Database;
  beforeEach(() => {
    db = createInMemoryDb();
  });

  it('adds and reads back an entry', () => {
    addToBlacklist({ number: '0312345678', reason: '迷惑営業' }, db);
    const e = getBlacklistEntry('0312345678', db)!;
    expect(e.reason).toBe('迷惑営業');
    expect(e.hits).toBe(0);
  });

  it('is idempotent: re-adding an existing number updates the reason', () => {
    addToBlacklist({ number: '0312345678', reason: 'a' }, db);
    addToBlacklist({ number: '0312345678', reason: 'b' }, db);
    expect(listBlacklist(db)).toHaveLength(1);
    expect(getBlacklistEntry('0312345678', db)!.reason).toBe('b');
  });

  it('rejects an invalid number', () => {
    expect(() => addToBlacklist({ number: 'block-me' }, db)).toThrow(InvalidBlacklistError);
  });

  it('accepts a prefix-wildcard number', () => {
    expect(() => addToBlacklist({ number: '09012*' }, db)).not.toThrow();
  });

  it('deletes an entry', () => {
    addToBlacklist({ number: '0312345678' }, db);
    expect(deleteBlacklistEntry('0312345678', db)).toBe(true);
    expect(getBlacklistEntry('0312345678', db)).toBeNull();
  });
});

describe('renderBlacklistDialplan', () => {
  it('always emits a Gosub-safe [blacklist-check] with s -> Return even when empty', () => {
    const out = renderBlacklistDialplan([]);
    expect(out).toContain('[blacklist-check]');
    expect(out).toContain('exten => s,1,NoOp');
    expect(out).toContain('same => n,Return()');
    expect(out).toContain('exten => blocked,1,NoOp');
    expect(out).toContain('Hangup()');
  });

  it('emits an exact-match GotoIf for a full number', () => {
    const out = renderBlacklistDialplan([entry({ number: '0312345678' })]);
    expect(out).toContain('GotoIf($["${CALLERID(num)}"="0312345678"]?blacklist-check,blocked,1)');
  });

  it('emits a prefix substring match for a wildcard number', () => {
    const out = renderBlacklistDialplan([entry({ number: '09012*' })]);
    expect(out).toContain('GotoIf($["${CALLERID(num):0:5}"="09012"]?blacklist-check,blocked,1)');
  });
});
