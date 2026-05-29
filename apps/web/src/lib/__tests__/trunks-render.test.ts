import { describe, expect, it } from 'vitest';
import {
  renderTrunksPjsipConfig,
  renderTrunksDialplan,
  validateTrunkInput,
  type SipTrunk,
} from '../trunks';

function trunk(over: Partial<SipTrunk> = {}): SipTrunk {
  return {
    id: 1,
    name: 'main',
    host: 'sip.example.com',
    port: 5060,
    username: 'user1',
    secret: 'pass1',
    registration: true,
    fromUser: null,
    fromDomain: null,
    didInbound: null,
    outboundPrefix: null,
    note: null,
    updatedAt: '',
    ...over,
  };
}

describe('renderTrunksPjsipConfig', () => {
  it('emits auth / aor / endpoint / identify sections per trunk', () => {
    const out = renderTrunksPjsipConfig([trunk()]);
    expect(out).toContain('[main-auth]');
    expect(out).toContain('type=auth');
    expect(out).toContain('username=user1');
    expect(out).toContain('password=pass1');
    expect(out).toContain('type=aor');
    expect(out).toContain('type=endpoint');
    expect(out).toContain('context=from-trunk');
    expect(out).toContain('[main-identify]');
    expect(out).toContain('match=sip.example.com');
  });

  it('sets contact=sip:host:port on the aor', () => {
    const out = renderTrunksPjsipConfig([trunk({ host: '203.0.113.9', port: 5070 })]);
    expect(out).toContain('contact=sip:203.0.113.9:5070');
  });

  it('emits a registration section only when registration=1', () => {
    expect(renderTrunksPjsipConfig([trunk({ registration: true })])).toContain('type=registration');
    expect(renderTrunksPjsipConfig([trunk({ registration: false })])).not.toContain('type=registration');
  });

  it('emits from_user / from_domain only when provided', () => {
    const out = renderTrunksPjsipConfig([trunk({ fromUser: 'caller', fromDomain: 'pbx.local' })]);
    expect(out).toContain('from_user=caller');
    expect(out).toContain('from_domain=pbx.local');
    expect(renderTrunksPjsipConfig([trunk()])).not.toContain('from_user=');
  });
});

describe('renderTrunksDialplan', () => {
  it('routes did_inbound into the internal context', () => {
    const out = renderTrunksDialplan([trunk({ didInbound: '0312345678' })]);
    expect(out).toContain('exten => 0312345678,1,NoOp(inbound from main)');
    expect(out).toContain('Goto(internal,0312345678,1)');
  });

  it('always emits a catch-all _X. hangup in from-trunk', () => {
    const out = renderTrunksDialplan([trunk()]);
    expect(out).toContain('[from-trunk]');
    expect(out).toContain('exten => _X.,1,NoOp(no inbound route)');
    expect(out).toContain('Hangup()');
  });

  it('emits an outbound Dial block only when a trunk has an outbound_prefix', () => {
    const out = renderTrunksDialplan([trunk({ outboundPrefix: '0' })]);
    expect(out).toContain('[internal]');
    expect(out).toContain('exten => _0X.,1,NoOp(outbound via main)');
    expect(out).toContain('Dial(PJSIP/${EXTEN}@main,60,tTkK)');
  });

  it('omits the [internal] outbound block when no trunk has a prefix', () => {
    const out = renderTrunksDialplan([trunk()]);
    expect(out).not.toContain('outbound via');
  });
});

describe('validateTrunkInput (config-injection guards)', () => {
  it('rejects a host containing a semicolon (PJSIP comment / injection)', () => {
    expect(() => validateTrunkInput({ name: 'x', host: 'evil;injected' })).toThrow();
  });

  it('rejects a host containing whitespace', () => {
    expect(() => validateTrunkInput({ name: 'x', host: 'sip evil' })).toThrow();
  });

  it('rejects a secret containing a semicolon', () => {
    expect(() => validateTrunkInput({ name: 'x', host: 'sip.example.com', secret: 'pa;ss' })).toThrow();
  });

  it('accepts a clean trunk input', () => {
    expect(() => validateTrunkInput({ name: 'main', host: 'sip.example.com', secret: 'pass1' })).not.toThrow();
  });
});
