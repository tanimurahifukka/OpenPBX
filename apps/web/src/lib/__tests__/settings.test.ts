import { describe, expect, it } from 'vitest';
import { parseConnectCode } from '../settings';

describe('parseConnectCode', () => {
  it('parses JSON format', () => {
    const r = parseConnectCode(
      '{"pushUrl":"https://cr.example.com/api","pushToken":"tok123","workspaceId":"ws-1","sourceAccountId":"sa-2"}',
    );
    expect(r).toEqual({
      ok: true,
      pushUrl: 'https://cr.example.com/api',
      pushToken: 'tok123',
      workspaceId: 'ws-1',
      sourceAccountId: 'sa-2',
    });
  });

  it('accepts alternate JSON keys (url, token, workspace, source)', () => {
    const r = parseConnectCode('{"url":"https://x","token":"t","workspace":"w","source":"s"}');
    expect(r).toMatchObject({ ok: true, pushUrl: 'https://x', pushToken: 't', workspaceId: 'w' });
  });

  it('parses openpbx-connect:// URL', () => {
    const r = parseConnectCode(
      'openpbx-connect://cr.example.com/api/v1/pbx-events?token=abc&workspace=ws-1&source=sa-2',
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.pushToken).toBe('abc');
      expect(r.workspaceId).toBe('ws-1');
      expect(r.sourceAccountId).toBe('sa-2');
      expect(r.pushUrl).toContain('cr.example.com');
    }
  });

  it('rejects empty string', () => {
    expect(parseConnectCode('')).toMatchObject({ ok: false });
    expect(parseConnectCode('   ')).toMatchObject({ ok: false });
  });

  it('rejects JSON missing pushUrl', () => {
    const r = parseConnectCode('{"pushToken":"t","workspaceId":"w"}');
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining('pushUrl') });
  });

  it('rejects JSON missing pushToken', () => {
    const r = parseConnectCode('{"pushUrl":"u","workspaceId":"w"}');
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining('pushToken') });
  });

  it('rejects openpbx-connect:// missing token param', () => {
    const r = parseConnectCode('openpbx-connect://x.com/?workspace=w');
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining('token') });
  });

  it('rejects unrecognized format', () => {
    const r = parseConnectCode('hello world');
    expect(r).toMatchObject({ ok: false });
  });

  it('trims whitespace', () => {
    const r = parseConnectCode('  {"pushUrl":"u","pushToken":"t","workspaceId":"w"}  ');
    expect(r.ok).toBe(true);
  });
});
