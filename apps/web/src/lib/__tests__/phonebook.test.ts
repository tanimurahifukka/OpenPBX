import { describe, expect, it, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createInMemoryDb } from '../db';
import {
  createPhonebook,
  updatePhonebook,
  deletePhonebook,
  listPhonebook,
  lookupByNumber,
  InvalidPhonebookError,
} from '../phonebook';

let db: Database.Database;
beforeEach(() => {
  db = createInMemoryDb();
});

describe('createPhonebook', () => {
  it('strips spaces and parentheses from the number before storing', () => {
    const e = createPhonebook({ name: 'Clinic A', number: '03 (1234) 5678' }, db);
    expect(e.number).toBe('0312345678');
  });

  it('trims the name and nullifies blank org/category', () => {
    const e = createPhonebook({ name: '  田中  ', number: '1001', org: '  ', category: '' }, db);
    expect(e.name).toBe('田中');
    expect(e.org).toBeNull();
    expect(e.category).toBeNull();
  });

  it('rejects an empty name', () => {
    expect(() => createPhonebook({ name: '   ', number: '1001' }, db)).toThrow(InvalidPhonebookError);
  });

  it('rejects an empty number', () => {
    expect(() => createPhonebook({ name: 'X', number: '' }, db)).toThrow(InvalidPhonebookError);
  });

  it('rejects a number with invalid characters', () => {
    expect(() => createPhonebook({ name: 'X', number: 'call-me' }, db)).toThrow(InvalidPhonebookError);
  });
});

describe('lookupByNumber (reverse lookup)', () => {
  it('returns the matching entry', () => {
    createPhonebook({ name: 'Supplier', number: '0312345678', org: 'Acme' }, db);
    const hit = lookupByNumber('0312345678', db);
    expect(hit?.name).toBe('Supplier');
    expect(hit?.org).toBe('Acme');
  });

  it('returns null when no entry matches', () => {
    expect(lookupByNumber('09099998888', db)).toBeNull();
  });
});

describe('listPhonebook', () => {
  beforeEach(() => {
    createPhonebook({ name: '皮膚科クリニック', number: '0311112222', org: 'メディカル', category: '取引先' }, db);
    createPhonebook({ name: 'Pharmacy', number: '0644445555', org: 'Yakkyoku', category: '顧客' }, db);
  });

  it('returns all entries when query is empty', () => {
    expect(listPhonebook(undefined, db)).toHaveLength(2);
  });

  it('matches on name', () => {
    expect(listPhonebook('Pharmacy', db).map((e) => e.number)).toEqual(['0644445555']);
  });

  it('matches on number fragment', () => {
    expect(listPhonebook('1111', db).map((e) => e.name)).toEqual(['皮膚科クリニック']);
  });

  it('matches on org', () => {
    expect(listPhonebook('Yakkyoku', db)).toHaveLength(1);
  });

  it('matches on category', () => {
    expect(listPhonebook('取引先', db).map((e) => e.org)).toEqual(['メディカル']);
  });
});

describe('updatePhonebook / deletePhonebook', () => {
  it('returns null when the id does not exist', () => {
    expect(updatePhonebook({ id: 9999, name: 'X', number: '1001' }, db)).toBeNull();
  });

  it('updates an existing entry', () => {
    const e = createPhonebook({ name: 'Before', number: '1001' }, db);
    const updated = updatePhonebook({ id: e.id, name: 'After', number: '1002' }, db);
    expect(updated?.name).toBe('After');
    expect(updated?.number).toBe('1002');
  });

  it('deletes an entry', () => {
    const e = createPhonebook({ name: 'Temp', number: '1001' }, db);
    expect(deletePhonebook(e.id, db)).toBe(true);
    expect(lookupByNumber('1001', db)).toBeNull();
  });
});
