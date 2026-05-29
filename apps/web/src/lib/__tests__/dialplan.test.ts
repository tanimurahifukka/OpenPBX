import { describe, expect, it, beforeAll } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

// DIALPLAN_OUT_DIR is read at module-load time, so point it at a temp dir
// BEFORE importing the module under test.
let writeDialplanFile: typeof import('../dialplan').writeDialplanFile;
let tmpDir: string;

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpbx-dialplan-'));
  process.env.DIALPLAN_OUT_DIR = tmpDir;
  ({ writeDialplanFile } = await import('../dialplan'));
});

describe('writeDialplanFile filename guard', () => {
  it('rejects a filename without a .conf extension', async () => {
    await expect(writeDialplanFile('foo', '; x')).rejects.toThrow(/invalid dialplan filename/);
  });

  it('rejects path traversal in the filename', async () => {
    await expect(writeDialplanFile('../evil.conf', '; x')).rejects.toThrow(/invalid dialplan filename/);
  });

  it('rejects a nested path segment', async () => {
    await expect(writeDialplanFile('sub/dir.conf', '; x')).rejects.toThrow(/invalid dialplan filename/);
  });

  it('writes content for a valid .conf name', async () => {
    const out = await writeDialplanFile('blacklist.conf', '; hello');
    expect(out).toBe(path.join(tmpDir, 'blacklist.conf'));
    expect(fs.readFileSync(out, 'utf-8')).toBe('; hello');
  });
});
