import { describe, expect, it, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createInMemoryDb } from '../db';
import { createTimeRule, upsertHoliday, isWithinBusinessHours } from '../businessHours';
import { summarizeActiveCalls } from '../ami';
import type { DeviceInfo, DeviceState } from '../ami';

// ADR 0018 §D — PBX Safety Kernel building blocks.

let db: Database.Database;
beforeEach(() => {
  db = createInMemoryDb();
});

function dev(state: DeviceState): DeviceInfo {
  return {
    device: `PJSIP/100${Math.random()}`,
    extension: '1001',
    state,
    contact: null,
    reachable: true,
    updatedAt: new Date().toISOString(),
  };
}

describe('isWithinBusinessHours', () => {
  it('returns false when no time rules are configured', () => {
    expect(isWithinBusinessHours(new Date('2026-05-29T03:00:00'), db)).toBe(false);
  });

  it('returns true inside a weekday rule window', () => {
    createTimeRule(
      { name: '平日', days: 'mon-fri', startTime: '09:00', endTime: '18:00' },
      db,
    );
    // 2026-05-29 is a Friday. 10:30 local is inside 09:00-18:00.
    expect(isWithinBusinessHours(new Date('2026-05-29T10:30:00'), db)).toBe(true);
  });

  it('returns false outside the window', () => {
    createTimeRule(
      { name: '平日', days: 'mon-fri', startTime: '09:00', endTime: '18:00' },
      db,
    );
    expect(isWithinBusinessHours(new Date('2026-05-29T20:00:00'), db)).toBe(false);
  });

  it('returns false on a configured holiday even inside the window', () => {
    createTimeRule(
      { name: '平日', days: 'mon-fri', startTime: '09:00', endTime: '18:00' },
      db,
    );
    upsertHoliday('2026-05-29', '臨時休業', db);
    expect(isWithinBusinessHours(new Date('2026-05-29T10:30:00'), db)).toBe(false);
  });

  it('handles overnight windows (start > end)', () => {
    createTimeRule(
      { name: '夜間', days: '*', startTime: '22:00', endTime: '06:00' },
      db,
    );
    expect(isWithinBusinessHours(new Date('2026-05-29T23:30:00'), db)).toBe(true);
    expect(isWithinBusinessHours(new Date('2026-05-29T05:00:00'), db)).toBe(true);
    expect(isWithinBusinessHours(new Date('2026-05-29T12:00:00'), db)).toBe(false);
  });

  it('respects the weekday set', () => {
    createTimeRule(
      { name: '土曜', days: 'sat', startTime: '09:00', endTime: '12:00' },
      db,
    );
    // 2026-05-29 is Friday -> not matched.
    expect(isWithinBusinessHours(new Date('2026-05-29T10:00:00'), db)).toBe(false);
    // 2026-05-30 is Saturday -> matched.
    expect(isWithinBusinessHours(new Date('2026-05-30T10:00:00'), db)).toBe(true);
  });
});

describe('summarizeActiveCalls', () => {
  it('counts busy/ringing devices as active', () => {
    const summary = summarizeActiveCalls([
      dev('inuse'),
      dev('ringing'),
      dev('not_inuse'),
      dev('unavailable'),
    ]);
    expect(summary.activeDevices).toBe(2);
    expect(summary.anyActiveCall).toBe(true);
  });

  it('reports no active call when all idle', () => {
    const summary = summarizeActiveCalls([dev('not_inuse'), dev('unavailable')]);
    expect(summary).toEqual({ activeDevices: 0, anyActiveCall: false });
  });
});
