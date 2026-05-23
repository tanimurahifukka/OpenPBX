# OpenPBX データ境界 (OSS 公開前提)

> 状態: stable. 本リポジトリは将来 OSS 公開予定。
> 顧客 / 患者 / 案件の canonical data、AI summary、全文 transcript は
> OpenPBX 側に保存しない設計を固定する。

## なぜこの doc があるか

OpenPBX を OSS として公開しても、利用者が PBX に多くの個人情報を抱え込まない
よう、**何を持って良いか / 持ってはいけないか** を repo の規約として残す。

過去 (`patients` / `patient_records` テーブル) のように医療特化のドメイン
モデルが入ると、

- OSS clone した別業種が使いにくい
- 機微情報の境界が曖昧で audit log の責任分界が出来ない
- PBX が落ちると患者カルテも止まる、という「PBX に過剰結合した業務」が
  生まれる

ことを防ぐ。

## OpenPBX に保存して良いもの

- **PBX 動作に必要な設定**:
  - extension (内線番号, secret, displayName, WebRTC フラグ, メモ)
  - ring group / pickup group
  - dialplan / IVR menu / IVR options
  - 営業時間ルール / 祝日カレンダー
  - SIP trunk (host / username / secret / DID / outbound prefix)
  - ガイダンス wav (Asterisk path 単位、短い text メモ可)
- **PBX 操作のための薄いキャッシュ**:
  - phonebook (display name / 番号 / 任意ラベル `org` / 短い `note`)
  - 役割: 着信時の caller-name 解決、UI 上の番号→相手表示
- **PBX 自体の運用ログ**:
  - CDR (Asterisk Master.csv ingest)
  - audit_log (PBX 設定変更の actor/action/target)
  - login_history (PBX Web UI へのログイン)
- **PBX ローカル成果物**:
  - data/recordings/*.wav (生録音)
  - data/inbox/*.{wav,meta.json} (Asterisk から AI 連携前段への引き渡し)
  - data/outbox-v1/*.json (command-room-pbx/event/v1 envelope)
- **ローカル auth**:
  - PBX Web UI ログイン用 account (scrypt password hash + optional TOTP)
  - これは PBX オペレーター用であって、業務システム側のユーザーとは別もの

## OpenPBX に保存してはいけないもの

- **顧客 / 患者 / 案件の canonical 属性**:
  - 氏名, ふりがな, 生年月日, 性別, 住所
  - 診療カルテ, 案件メモ, 商談履歴, 契約情報
  - 患者ID / 顧客ID といった一意 ID (= canonical DB の主キー)
  - これらは command-room (または別 SaaS) が canonical 元として持つ
- **AI / 文字起こし系の派生データ**:
  - 通話の transcript (full / 部分)
  - AI summary, sentiment, intent 解析結果
  - 通話内容を要約した自由テキスト
  - 音声から起こした「会話の中身」全般
- **長期保存される個人情報**:
  - 通話相手の生 (raw) 電話番号を恒久的に保存する場合は要検討
    - PBX 内 phonebook の `number` 列は表示用キャッシュ扱い (本人と紐づける
      ことを前提としない)。canonical 連絡先 DB ではない。
  - 通話相手のメールアドレス, SNS ID, クレジットカード番号
- **第三者サービスの認証情報**:
  - 外部 CRM / カルテシステム / メッセージサービス等の API token
  - OAuth refresh token
  - これらは command-room の UserSecret に保管する

## phonebook の扱い (重要)

OSS 公開後、利用者は phonebook に「全顧客リスト」を入れたくなる誘惑がある。
これは設計意図と異なる:

- phonebook の目的: **着信時の caller-name resolution** + **クリックトゥコール
  の発信元 UX**
- canonical 連絡先 DB として運用しない:
  - メモ欄に診療情報や契約金額など機微情報を書かない
  - 「顧客の同意ステータス」など業務状態を持たせない
  - 全文検索 / フィルタ / レポートのインプットにしない

UI 上では:
- `note` placeholder に「機微情報を書かないでください」のような注意を出す
- ✅ よい例: 「優良取引先」「お断り顧客」「03 担当: 田中」
- ❌ 悪い例: カルテ内容、契約金額、本人確認書類の番号

## command-room との責務分離

| 領域 | OpenPBX | command-room |
|---|---|---|
| 通話発生イベント (`ExternalEvent`) | 起票 + 永続 outbox | 受け取り、AutomationRule で WorkItem 化 |
| `CallRecord` (通話履歴) | 持たない | canonical owner |
| `recording` (wav, sha256, objectKey) | 生 wav はローカル、relativePath/sha256 のみ送る | objectKey で Storage に登録、access control 担当 |
| 全文 transcript | 触れない (Hayabusa が処理し command-room に直送) | DataClass=Sensitive で保存 |
| 顧客/患者 detail | 持たない | canonical owner |
| 電話帳 (薄い表示用) | display cache を持つ | (将来) canonical 連絡先 DB から OpenPBX に sync する経路を作る |
| ユーザー認証 (業務) | 持たない | canonical IdP |
| ユーザー認証 (PBX Web UI 用) | 自前 cookie session | 関与しない |
| AuditLog | PBX 操作のみ (extension CRUD 等) | 業務操作 |

## migration 規約

- `patients` / `patient_records` テーブルを再追加するスキーマ変更は **禁止**。
- 古い DB に残っている場合は `dropPatientTables(db)` (db.ts) が起動時に削除
  する。再追加する場合は本 doc の見直しと PR 議論が必須。
- phonebook への列追加は OK だが、本人を一意に特定する強い ID (顧客番号 /
  患者番号 / マイナンバー等) を入れない。

## test guard

CI で患者系シンボルが復活していないことを grep ベースで監視する
([apps/web/src/lib/__tests__/data-boundary.test.ts](../apps/web/src/lib/__tests__/data-boundary.test.ts))。

具体的には:
- `patients` / `patient_records` テーブルを CREATE TABLE するコードがない
- `interface Patient` 等のドメイン型が再導入されていない
- `apps/web/src/app/patients/` ディレクトリが存在しない

このテストが落ちたら本 doc を読んで設計の再合意をしてからマージする。

## OSS 公開前チェックリスト

- [x] patients/triage 系のソース・テーブル削除済み
- [x] `.env.example` に bootstrap admin / AMI secret / event push の env を整理
- [x] hardcoded secret なし (manager.conf は template、bootstrap admin は env)
- [ ] README に「OpenPBX は canonical 連絡先 DB ではない」を明記
- [ ] LICENSE 追加 (MIT または Apache 2.0)
- [ ] CONTRIBUTING.md (data boundary を読むよう要求)
- [ ] 既存 issue / PR から個人情報の自由テキストを除去
