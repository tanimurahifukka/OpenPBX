# Contributing to OpenPBX

OpenPBX への貢献ありがとうございます。本プロジェクトは将来 OSS として
広く公開される予定なので、コードを書く前に以下の規約を読んでください。

## 0. まず読むもの (必須)

1. [README.md](./README.md) — 起動方法と全体像
2. [docs/privacy-data-boundary.md](./docs/privacy-data-boundary.md) — **本リポジトリで何を保存して良いか / ダメか**
3. [docs/contracts/openpbx-event-v1.md](./docs/contracts/openpbx-event-v1.md) — command-room との連携契約

特に `docs/privacy-data-boundary.md` は不可侵ルール。違反する PR は
data-boundary guard test (`apps/web/src/lib/__tests__/data-boundary.test.ts`)
で機械的に弾かれます。

## 1. 開発環境

### 必須

- Node.js 20+
- Docker Desktop (macOS 推奨。Linux も可)
- macOS / Linux (Asterisk が動く環境)

### セットアップ

```bash
cp .env.example .env
# .env を編集。AMI_SECRET / NEXT_SERVER_ACTIONS_ENCRYPTION_KEY /
# BOOTSTRAP_ADMIN_PASSWORD を強い値に。
docker compose up -d --build
```

### Web アプリ単体

```bash
cd apps/web
npm install
npm run dev    # http://localhost:3000
npm test       # vitest
npm run build  # next build
```

## 2. 開発フロー

### 2.1 ブランチ

- `main` 直 push は禁止。必ず PR を切る。
- branch 名: `<type>/<short-summary>`
  - `feature/ivr-card-editor`
  - `fix/cookie-secure`
  - `chore/oss-license`
  - `docs/data-boundary`

### 2.2 PR 規約

- タイトルは 1 行で「何が変わるか」が分かる粒度
- 本文に以下を含める:
  - **なぜ**変更するか
  - **何が**変わるか
  - **テスト**は何を見たか
  - 残課題があれば明示
- 大きな機能追加は ADR を先に書いてレビューを通す

### 2.3 必須チェック

PR を出す前にローカルで:

```bash
cd apps/web
npx tsc --noEmit       # 型チェック
npm test               # vitest 全部
npm run lint           # ESLint
npm run build          # next build (production smoke)
```

GitHub Actions の `.github/workflows/ci.yml` でも同じものが走ります。

## 3. コード規約

### 3.1 言語

- ドキュメント (README, docs/*): 日本語
- コードのコメント: 日本語または英語
- 識別子 (関数名 / 変数名 / 型名): 英語
- UI 上のラベル: 日本語

### 3.2 構造

- Modular monolith。`apps/web/src/{app,lib,components}/` の境界を尊重
- DB スキーマ変更は `apps/web/src/lib/db.ts` の SCHEMA 文字列に追記し、
  既存 DB への影響を `migrate*()` 関数で冪等に処理する
- Server Action は `apps/web/src/app/actions.ts` に集約
- 全 Server Action は冒頭で `requireAccount()` または `requireRole()` を呼ぶ
- 全 protected Page は `await requireAccount()` を最初に呼ぶ
- 全 protected API は `requireApi()` ガードを使う

### 3.3 セキュリティ

#### やってはいけないこと

- secret / token をログに出力する (PII もダメ)
- secret を hardcode する (.env もしくは secret store に置く)
- `requireAccount()` 等を消すリファクタを行う
- middleware だけで認証を済ませる (middleware は早期リダイレクトのみ)
- patients / patient_records 等の医療特化テーブルを再追加する

#### やるべきこと

- API には `requireApi()` ガード
- Page には `await requireAccount()`
- Server Action には `await requireRole()` または `await requireAccount()`
- Asterisk config 生成系の入力は whitelist regex で validate
  (例: `apps/web/src/lib/trunks.ts` の `HOST_RE` / `SECRET_RE`)

## 4. プライバシ / データ境界

**`docs/privacy-data-boundary.md` を必ず読むこと**。

OpenPBX に **入れて良いもの**:

- PBX 設定 (extension, ring group, IVR, trunk)
- 通話履歴 (CDR)
- ローカル録音 wav / 通話 meta
- 薄い電話帳 (caller-name 解決用)
- PBX 操作の audit_log
- PBX Web UI ログイン用 account

OpenPBX に **入れてはいけないもの**:

- 顧客 / 患者 / 案件の canonical 属性 (氏名 + 生年月日 + 詳細プロフィール等)
- AI / 文字起こしによる派生データ (transcript 全文、AI summary、intent 分析)
- 第三者サービスの認証情報 (API token、OAuth refresh token)
- 通話相手の生 raw 番号の恒久保存 (phonebook は表示用キャッシュ)

PR でこれらを入れようとした場合、data-boundary guard test が落ちます。

## 5. テスト

### 5.1 必須

- 新規 lib 関数: vitest で unit test
- DB schema 変更: 既存 DB の冪等性を確認するテスト
- Server Action / API 追加: 認可テスト (権限なしで叩いて 401/403 になることを確認)

### 5.2 contract test

OpenPBX ↔ command-room の event v1 を変える場合:

- `fixtures/openpbx-event-v1/*.envelope.json` を更新
- `apps/web/src/lib/events/v1/__tests__/envelope-golden.test.ts` でテスト
- command-room repo にも同じ fixture を反映 (cross-repo review が必要)

## 6. ドキュメント

新機能や設計変更は以下も更新:

- README.md (機能リストや起動手順に影響するなら)
- docs/contracts/* (cross-repo contract を触るなら)
- docs/privacy-data-boundary.md (データ境界を変えるなら ADR 先行)
- 新 ADR (`docs/adr/NNNN-*.md` フォーマット) — 大きな設計判断の理由を残す

## 7. issue / discussion

- バグ報告: 再現手順 + 期待動作 + 実際の動作 + 環境 (OS, Docker version)
- 機能要望: ユースケース (誰がどう困るか) + 想定する画面 / API
- 質問: README + docs を読んでも分からない部分を明示

## 8. 行動規範

- 個人情報を含む録音や DB ダンプを issue / PR に貼らない
- 他の利用者を非難する書き方をしない
- レビューには建設的に答える (「全否定」より「ここをこう変えたら通せる」)

## 9. 著作権 / ライセンス

- このプロジェクトは [MIT License](./LICENSE) で配布されます
- PR をマージした場合、貢献部分は MIT のもとで配布されることに同意したものとみなします
- 第三者のコードを引用する場合は出典とライセンス互換性を確認すること

## 10. 質問

不明点があれば issue / discussion で質問してください。Wi-Fi を自分で
繋げられる程度の操作感覚があれば動かせるのが OpenPBX の目標なので、
「ここが分かりにくい」というフィードバックも歓迎です。
