import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// docs/privacy-data-boundary.md の規約を CI で機械的に守るための guard test。
// patients / patient_records / interface Patient 等が再導入されたら fail する。
//
// 失敗したら docs/privacy-data-boundary.md を読んで設計の再合意をしてから
// マージすること (= 単に test を消して通すのは禁止)。

const REPO_ROOT = path.resolve(__dirname, '../../../../../');
const WEB_SRC = path.resolve(__dirname, '../../');

function listFiles(dir: string, exts: string[]): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listFiles(full, exts));
    } else if (exts.some((e) => entry.name.endsWith(e))) {
      out.push(full);
    }
  }
  return out;
}

// 自分自身 (この test ファイル) と data-boundary doc は除外する。
// それ以外で禁止シンボルを参照しているファイルがあれば fail。
const ALLOW_REFERENCING = new Set<string>([
  __filename,
  path.resolve(WEB_SRC, 'lib/db.ts'), // dropPatientTables() で DROP するため言及あり
]);

const ALLOW_DOC_REFERENCES = [
  // 設計 doc 自身は OK
  path.resolve(REPO_ROOT, 'docs/privacy-data-boundary.md'),
];

describe('OSS data-boundary guard', () => {
  it('apps/web/src/app/patients/ ディレクトリが存在しない', () => {
    const p = path.resolve(WEB_SRC, 'app/patients');
    expect(fs.existsSync(p), `禁止: ${p} が再追加されている`).toBe(false);
  });

  it('apps/web/src/app/triage/ ディレクトリが存在しない', () => {
    const p = path.resolve(WEB_SRC, 'app/triage');
    expect(fs.existsSync(p), `禁止: ${p} が再追加されている`).toBe(false);
  });

  it('apps/web/src/lib/patients.ts が存在しない', () => {
    const p = path.resolve(WEB_SRC, 'lib/patients.ts');
    expect(fs.existsSync(p), `禁止: ${p} が再追加されている`).toBe(false);
  });

  it('apps/web/src/app/api/patients/ が存在しない', () => {
    const p = path.resolve(WEB_SRC, 'app/api/patients');
    expect(fs.existsSync(p), `禁止: ${p} が再追加されている`).toBe(false);
  });

  it('apps/web/src のソースに CREATE TABLE patients / interface Patient が現れない', () => {
    const files = listFiles(WEB_SRC, ['.ts', '.tsx']);
    const violations: string[] = [];
    for (const f of files) {
      if (ALLOW_REFERENCING.has(f)) continue;
      const text = fs.readFileSync(f, 'utf8');
      // CREATE TABLE patients / patient_records / interface Patient {
      if (/CREATE\s+TABLE[^;]*\bpatients\b/.test(text)) violations.push(`${f}: CREATE TABLE patients`);
      if (/CREATE\s+TABLE[^;]*\bpatient_records\b/.test(text)) {
        violations.push(`${f}: CREATE TABLE patient_records`);
      }
      if (/\binterface\s+Patient\b/.test(text)) violations.push(`${f}: interface Patient`);
      if (/\binterface\s+PatientRecord\b/.test(text)) violations.push(`${f}: interface PatientRecord`);
    }
    expect(violations, violations.join('\n')).toEqual([]);
  });

  it('docs/privacy-data-boundary.md が存在し、再導入禁止の明文がある', () => {
    const docPath = ALLOW_DOC_REFERENCES[0];
    expect(fs.existsSync(docPath)).toBe(true);
    const doc = fs.readFileSync(docPath, 'utf8');
    expect(doc).toContain('patients');
    expect(doc).toMatch(/再追加|禁止/);
  });
});
