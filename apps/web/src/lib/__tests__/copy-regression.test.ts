import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// 通常ユーザーが触る画面に、内部技術用語をそのまま表示していないかを CI で
// 機械的に監視する。違反する箇所が出たら次のどちらかで対応:
//   1) 文言を UX レビューの置換表 (docs UX 章 §4) に従って日本語にする
//   2) 内部用語が画面に出るのが意図的なら ALLOW_PER_FILE に追記して例外化
//
// 「ExternalEvent」「WorkerNode」「phone_stt」「pbx_edge」「dead」が
// 一般ユーザー向け Page (`apps/web/src/app/(authed)/` 配下を含む) で
// 文字列リテラルや JSX text として現れたら fail。
//
// 例外:
//   - `lib/` 配下: 内部実装は OK (型定義 / DB 列 / 関数識別子は英語)
//   - 管理者向け詳細 (audit, security, accounts, network, trunks, upgrades):
//     技術詳細を出すページなので OK
//   - actions.ts: server action 内部識別子は OK
//   - test ファイル: 検査対象外

const WEB_SRC_APP = path.resolve(__dirname, '../../app');

const FORBIDDEN_LITERALS: ReadonlyArray<string> = [
  'ExternalEvent',
  'WorkerNode',
  'phone_stt',
  'pbx_edge',
];

// "dead" は普段の英語にも出る単語なので、明らかな状態表示 "dead" / "Dead"
// 単独単語のときだけマッチさせる。
const DEAD_REGEX = /\b[Dd]ead\b/;

// 管理者詳細ページなど、技術用語の露出が許容されるパス。
const ALLOW_PATH_PREFIXES = [
  // 管理者画面 (技術詳細を見る目的)
  path.resolve(WEB_SRC_APP, 'accounts'),
  path.resolve(WEB_SRC_APP, 'audit'),
  path.resolve(WEB_SRC_APP, 'security'),
  path.resolve(WEB_SRC_APP, 'network'),
  path.resolve(WEB_SRC_APP, 'trunks'),
  path.resolve(WEB_SRC_APP, 'upgrades'),
  path.resolve(WEB_SRC_APP, 'devices'),
  // server actions 集約 (内部識別子)
  path.resolve(WEB_SRC_APP, 'actions.ts'),
  // login (技術 message は出さないが、ここで除外しても問題なし)
  path.resolve(WEB_SRC_APP, 'login'),
];

function isAllowed(filePath: string): boolean {
  return ALLOW_PATH_PREFIXES.some((p) => filePath.startsWith(p));
}

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    if (entry.name === 'node_modules') continue;
    if (entry.name.endsWith('.test.ts')) continue;
    if (entry.name.endsWith('.test.tsx')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listSourceFiles(full));
    else if (full.endsWith('.tsx') || full.endsWith('.ts')) out.push(full);
  }
  return out;
}

describe('copy regression (UX): 通常ユーザー画面に内部技術用語を出さない', () => {
  const files = listSourceFiles(WEB_SRC_APP).filter((f) => !isAllowed(f));

  for (const literal of FORBIDDEN_LITERALS) {
    it(`"${literal}" が user-facing ページに現れない`, () => {
      const violations: string[] = [];
      for (const f of files) {
        const text = fs.readFileSync(f, 'utf8');
        if (text.includes(literal)) {
          // 表示として書かれていそうな行だけ拾う (import 文 / 型注釈は除外)
          const lines = text.split('\n');
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (!line.includes(literal)) continue;
            // import 行 / 型注釈は無視
            if (/^\s*import\s/.test(line)) continue;
            if (/^\s*\/\//.test(line)) continue; // コメント
            if (/^\s*\*/.test(line)) continue; // JSDoc
            // 型注釈っぽい行 (interface / type / : { ... })
            if (/^\s*(interface|type|export\s+(interface|type))\b/.test(line)) continue;
            violations.push(`${path.relative(WEB_SRC_APP, f)}:${i + 1}: ${line.trim()}`);
          }
        }
      }
      expect(violations, violations.join('\n')).toEqual([]);
    });
  }

  it('"dead" 単独単語が user-facing ページに現れない (送信失敗状態は「確認が必要」と表示)', () => {
    const violations: string[] = [];
    for (const f of files) {
      const text = fs.readFileSync(f, 'utf8');
      const lines = text.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!DEAD_REGEX.test(line)) continue;
        if (/^\s*import\s/.test(line)) continue;
        if (/^\s*\/\//.test(line)) continue;
        if (/^\s*\*/.test(line)) continue;
        // outbox の OutboxStatus union 型 / map key 等の識別子は許容
        if (/'dead'/.test(line) || /"dead"/.test(line)) continue;
        // `.dead` プロパティアクセス (型として持っている OutboxStatus 等) は許容。
        // ユーザに見える文字列ではない。
        if (/\.dead\b/.test(line)) continue;
        // 型注釈中の identifier (e.g. `{ pending: number; sent: number; dead: number }`)
        if (/\bdead\s*:/.test(line)) continue;
        violations.push(`${path.relative(WEB_SRC_APP, f)}:${i + 1}: ${line.trim()}`);
      }
    }
    expect(violations, violations.join('\n')).toEqual([]);
  });
});
