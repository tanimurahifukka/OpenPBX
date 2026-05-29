import { describe, expect, it, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createInMemoryDb } from '../db';
import {
  createExtension,
  getExtension,
  renderExtensionRoutingDialplan,
  InvalidExtensionError,
  type Extension,
} from '../extensions';

function ext(over: Partial<Extension> = {}): Extension {
  return {
    number: '1001',
    displayName: 'Reception',
    secret: 'xxxx',
    note: null,
    webrtc: false,
    cfwdUnconditional: null,
    cfwdBusy: null,
    cfwdNoanswer: null,
    dnd: false,
    updatedAt: '',
    ...over,
  };
}

describe('extension forwarding / DND persistence + validation', () => {
  let db: Database.Database;
  beforeEach(() => {
    db = createInMemoryDb();
  });

  it('persists and reads back the forwarding fields and DND', () => {
    createExtension(
      { number: '1003', secret: 'xxxx', cfwdUnconditional: '1002', cfwdBusy: '1001', cfwdNoanswer: '9000', dnd: true },
      db,
    );
    const e = getExtension('1003', db)!;
    expect(e.cfwdUnconditional).toBe('1002');
    expect(e.cfwdBusy).toBe('1001');
    expect(e.cfwdNoanswer).toBe('9000');
    expect(e.dnd).toBe(true);
  });

  it('defaults forwarding fields to null and dnd to false', () => {
    createExtension({ number: '1004', secret: 'xxxx' }, db);
    const e = getExtension('1004', db)!;
    expect(e.cfwdUnconditional).toBeNull();
    expect(e.dnd).toBe(false);
  });

  it('accepts an external (mobile) forward target', () => {
    expect(() => createExtension({ number: '1005', secret: 'xxxx', cfwdUnconditional: '09012345678' }, db)).not.toThrow();
  });

  it('rejects an invalid forward target', () => {
    expect(() => createExtension({ number: '1006', secret: 'xxxx', cfwdBusy: 'call-me' }, db)).toThrow(
      InvalidExtensionError,
    );
  });
});

describe('renderExtensionRoutingDialplan', () => {
  it('emits no explicit exten for an extension without forwarding/DND', () => {
    const out = renderExtensionRoutingDialplan([ext()]);
    expect(out).toContain('[internal]');
    expect(out).toContain('転送 / DND 設定の内線なし');
    expect(out).not.toContain('exten => 1001');
  });

  it('emits an explicit exten with Hangup(BUSY) for a DND extension', () => {
    const out = renderExtensionRoutingDialplan([ext({ dnd: true })]);
    expect(out).toContain('exten => 1001,1,NoOp(routing 1001 dnd=1)');
    expect(out).toContain('Hangup(BUSY)');
  });

  it('emits Goto before any Dial for unconditional forwarding', () => {
    const out = renderExtensionRoutingDialplan([ext({ cfwdUnconditional: '1002' })]);
    expect(out).toContain('Goto(internal,1002,1)');
    expect(out).not.toContain('Dial(PJSIP/1001');
  });

  it('emits DIALSTATUS branch + fwd-busy label for busy forwarding', () => {
    const out = renderExtensionRoutingDialplan([ext({ cfwdBusy: '1002' })]);
    expect(out).toContain('Dial(PJSIP/1001,30,tTkKm)');
    expect(out).toContain('GotoIf($["${DIALSTATUS}"="BUSY"]?fwd-busy)');
    expect(out).toContain('same => n(fwd-busy),Goto(internal,1002,1)');
  });

  it('emits a fwd-noanswer label for no-answer forwarding', () => {
    const out = renderExtensionRoutingDialplan([ext({ cfwdNoanswer: '9000' })]);
    expect(out).toContain('GotoIf($["${DIALSTATUS}"="NOANSWER"]?fwd-noanswer)');
    expect(out).toContain('same => n(fwd-noanswer),Goto(internal,9000,1)');
  });

  it('keeps recording + MOH on the normal-answer path of a conditionally-forwarded extension', () => {
    const out = renderExtensionRoutingDialplan([ext({ cfwdNoanswer: '9000' })]);
    expect(out).toContain('MixMonitor(${RECORD_FILE})');
    expect(out).toContain('Set(CHANNEL(musicclass)=default)');
    expect(out).toContain('Set(EVENT_KIND=internal_call)');
  });
});
