import { describe, it, expect } from 'vitest';

// actions.ts の sanitizeNext と同一ロジック。Server Action 内の private 関数なので
// 純関数として再現してテストする。
function sanitizeNext(raw: string): string {
  if (!raw || !raw.startsWith('/')) return '/';
  if (raw.startsWith('//') || raw.startsWith('/\\')) return '/';
  return raw;
}

describe('sanitizeNext (redirect safety)', () => {
  it('allows relative paths', () => {
    expect(sanitizeNext('/ivr')).toBe('/ivr');
    expect(sanitizeNext('/dashboard')).toBe('/dashboard');
    expect(sanitizeNext('/workitems/123')).toBe('/workitems/123');
  });

  it('empty string falls back to /', () => {
    expect(sanitizeNext('')).toBe('/');
  });

  it('rejects absolute HTTP URLs', () => {
    expect(sanitizeNext('http://localhost:3000/ivr')).toBe('/');
    expect(sanitizeNext('http://localhost:3001/dashboard')).toBe('/');
    expect(sanitizeNext('https://evil.com/steal')).toBe('/');
  });

  it('rejects protocol-relative URLs', () => {
    expect(sanitizeNext('//evil.com')).toBe('/');
    expect(sanitizeNext('//evil.com/steal')).toBe('/');
  });

  it('rejects backslash-based bypass', () => {
    expect(sanitizeNext('/\\evil.com')).toBe('/');
  });
});
