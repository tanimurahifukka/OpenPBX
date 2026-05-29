import { describe, expect, it, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createInMemoryDb } from '../db';
import {
  validatePassword,
  updatePolicy,
  getPolicy,
  isIpAllowed,
  upsertIpAllow,
  cidrMatch,
} from '../policy';

let db: Database.Database;
beforeEach(() => {
  db = createInMemoryDb();
});

describe('validatePassword (default seeded policy: min 8, lowercase, digit)', () => {
  it('flags a too-short password', () => {
    expect(validatePassword('aa1', db).join(' ')).toContain('8');
  });

  it('flags a missing digit', () => {
    expect(validatePassword('allletters', db).some((e) => e.includes('数字'))).toBe(true);
  });

  it('passes a compliant password', () => {
    expect(validatePassword('password1', db)).toEqual([]);
  });

  it('enforces uppercase and symbol when the policy enables them', () => {
    updatePolicy({ ...getPolicy(db), requireUppercase: true, requireSymbol: true }, db);
    const errs = validatePassword('password1', db);
    expect(errs.some((e) => e.includes('大文字'))).toBe(true);
    expect(errs.some((e) => e.includes('記号'))).toBe(true);
    expect(validatePassword('Password1!', db)).toEqual([]);
  });
});

describe('isIpAllowed', () => {
  it('allows any IP when the allow-list is empty', () => {
    expect(isIpAllowed('203.0.113.99', db)).toBe(true);
  });

  it('allows an IP inside a configured /24 and rejects one outside', () => {
    upsertIpAllow('192.168.1.0/24', undefined, db);
    expect(isIpAllowed('192.168.1.50', db)).toBe(true);
    expect(isIpAllowed('10.0.0.1', db)).toBe(false);
  });

  it('rejects a missing IP when the list is non-empty', () => {
    upsertIpAllow('192.168.1.0/24', undefined, db);
    expect(isIpAllowed(null, db)).toBe(false);
  });

  it('rejects a malformed CIDR at insert time', () => {
    expect(() => upsertIpAllow('not-a-cidr', undefined, db)).toThrow();
  });
});

describe('cidrMatch', () => {
  it('matches an address inside a /24', () => {
    expect(cidrMatch('192.168.1.50', '192.168.1.0/24')).toBe(true);
  });

  it('does not match an address outside the /24', () => {
    expect(cidrMatch('192.168.2.1', '192.168.1.0/24')).toBe(false);
  });

  it('handles an exact /32 match', () => {
    expect(cidrMatch('203.0.113.5', '203.0.113.5/32')).toBe(true);
    expect(cidrMatch('203.0.113.6', '203.0.113.5/32')).toBe(false);
  });

  it('returns false for a malformed IP', () => {
    expect(cidrMatch('999.999.999.999', '192.168.1.0/24')).toBe(false);
    expect(cidrMatch('garbage', '192.168.1.0/24')).toBe(false);
  });
});
