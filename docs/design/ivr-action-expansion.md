# IVR action 拡張設計ドキュメント (Phase 3)

> 状態: draft / 設計のみ。実装は未着手。

OpenPBX の `/ivr` を IVRY 風の「電話対応フロー自動化ツール」に寄せるため、
現状 4 種類しかない `IvrAction` を業務アクションへ拡張する。

## 現状

`apps/web/src/lib/ivr-format.ts`:

```ts
export type IvrAction = 'goto_extension' | 'goto_ringgroup' | 'goto_ivr' | 'hangup';
```

UI は IvrEditor.tsx で「内線へ転送 / 着信グループへ / 別 IVR へ / 切断」の
4 つから選ぶ仕様。Asterisk dialplan 生成は `renderIvrDialplan()` (lib/ivr.ts)
で `Dial(PJSIP/...)` / `Goto(...)` / `Hangup()` に落ちる。

業務担当者から見ると「電話を取れない時間帯にどうするか」「録音を取りたい」
「URL を SMS で送りたい」が選べないので、PBX 管理ツール感が強い。

## ゴール

業務担当者が「この番号を押されたらこうする」を 1 画面で組み立てられるように、
以下のアクションを追加する。

```ts
export type IvrAction =
  | 'goto_extension'
  | 'goto_ringgroup'
  | 'goto_ivr'
  | 'play_guidance'           // 新規: アナウンスを再生して切る or 次へ
  | 'record_message'          // 新規: 留守電/伝言録音
  | 'send_sms'                // 新規: 発信者に SMS テンプレを送る
  | 'business_hours_branch'   // 新規: 営業時間ルールで分岐
  | 'hangup';
```

## アクション別 設計

### `play_guidance` (アナウンス再生)

**目的**: 「このメニュー無効です」「お電話ありがとうございました」のような
固定アナウンスを流す。続けて切る / メニューに戻る / 別ノードに移動を選ぶ。

**DB schema 追加**:

```sql
ALTER TABLE ivr_options ADD COLUMN guidance_path TEXT;          -- 再生する custom/* path
ALTER TABLE ivr_options ADD COLUMN next_action TEXT;            -- 'return_menu' | 'hangup' | NULL
```

互換性: 既存 row は `guidance_path=NULL`、`next_action=NULL` で問題なし。

**dialplan 生成**:

```
exten => 1,1,Playback(${GUIDANCE_PATH})
 same => n,Goto(${IVR_CTX},s,1)   ; next_action='return_menu' のとき
 same => n,Hangup()                ; next_action='hangup' のとき
```

**UI**:
カードに「再生ガイダンス [select]」「次の動作 [メニューに戻る/切断]」を出す。
GuidanceField を再利用。

---

### `record_message` (留守電/伝言録音)

**目的**: 「録音メッセージを受け付ける」アクション。営業時間外の留守電や、
特定メニュー (折返し依頼など) で発信者の声を 60 秒程度録音。

**DB schema 追加**:

```sql
ALTER TABLE ivr_options ADD COLUMN record_max_seconds INTEGER;  -- default 60
ALTER TABLE ivr_options ADD COLUMN record_intro_path TEXT;      -- 録音前のアナウンス
```

**dialplan 生成**:

`notify-event.sh` の既存パターンと揃える: `MixMonitor` ではなく `Record()` で
発信者音声を保存し、`h` extension で event 投下。

```
exten => 2,1,NoOp(record_message ${EVENT_KIND})
 same => n,Set(EVENT_KIND=ivr_recorded_message)
 same => n,Set(RECORD_FILE=${RECORDINGS_DIR}/${UNIQUEID}-ivr-${EXTEN}.wav)
 same => n,Answer()
 same => n,Wait(1)
 same => n,Playback(${INTRO_PATH})
 same => n,Playback(beep)
 same => n,Record(${RECORD_FILE},3,${MAX_SEC},k)
 same => n,Playback(auth-thankyou)
 same => n,Hangup()
```

**event v1 contract**:
既存の `same_day_reservation` / `callback_request` と同じ `kind` 系列に
`ivr_recorded_message` を追加。command-room 側で WorkItem 化される
（既存の `phone_stt` ingest 経路をそのまま使う）。

---

### `send_sms` (発信者に SMS テンプレ送信)

**目的**: 「予約フォームの URL を送る」「地図 URL を送る」など、口頭で
伝えるより SMS が確実な情報を自動送信。

**DB schema 追加** (新テーブル):

```sql
CREATE TABLE sms_templates (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  key         TEXT NOT NULL UNIQUE,     -- 'reservation_form' / 'access_map'
  name        TEXT NOT NULL,            -- UI 表示用
  body        TEXT NOT NULL,            -- {patient_name} 等のテンプレ変数を含む
  enabled     INTEGER NOT NULL DEFAULT 1,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE sms_outbox (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  to_number    TEXT NOT NULL,
  template_key TEXT NOT NULL REFERENCES sms_templates(key),
  body         TEXT NOT NULL,           -- 確定後のテキスト (変数展開後)
  status       TEXT NOT NULL DEFAULT 'pending',  -- pending | sent | failed | dead
  attempts     INTEGER NOT NULL DEFAULT 0,
  last_error   TEXT,
  uniqueid     TEXT,                    -- 紐付く Asterisk 通話
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  sent_at      TEXT
);
CREATE INDEX idx_sms_outbox_status ON sms_outbox(status, created_at);
```

**ivr_options 拡張**:

```sql
ALTER TABLE ivr_options ADD COLUMN sms_template_key TEXT;       -- どの template を送るか
```

**実装方針 (MVP)**:

1. dialplan で発信者番号を `EVENT_KIND=sms_request` + SMS template key 付きで
   `notify-event.sh` に渡し、`data/inbox/<uniqueId>.meta.json` に書く
2. watcher が meta を読んで `sms_outbox` に pending として INSERT
3. 送信ワーカーは未実装でよい (status=pending のまま残るだけ)
4. 送信実装は別 PR で Twilio / TwiML / vonage / なんでもプラグインに

**dialplan 生成**:

```
exten => 9,1,NoOp(send_sms ${SMS_TEMPLATE_KEY})
 same => n,Set(EVENT_KIND=sms_request)
 same => n,Set(SMS_TEMPLATE_KEY=reservation_form)
 same => n,Answer()
 same => n,Playback(custom/sms-sent-notice)
 same => n,Hangup()
```

`h` extension の notify-event.sh で SMS_TEMPLATE_KEY を meta に含める。

**UI**:
- /ivr のカードに「SMS テンプレ [select]」を出す (sms_templates から)。
- 新規ページ `/sms-templates` で CRUD (admin)。
- IVRY 風に「フォーム URL の SMS を送る」がデフォルトテンプレに入っていると親切。

---

### `business_hours_branch` (営業時間で枝分かれ)

**目的**: メニューの中に「営業時間外なら別の枝へ」を入れる。現在は
`ivr_menus.after_hours_action` がメニュー全体の after-hours しか持っておらず、
特定の数字 (例: 0 → 営業時間内はオペレーター、時間外は留守電) のような
分岐がない。

**DB schema 追加**:

```sql
ALTER TABLE ivr_options ADD COLUMN open_action TEXT;       -- 営業時間内のアクション
ALTER TABLE ivr_options ADD COLUMN open_target TEXT;
ALTER TABLE ivr_options ADD COLUMN closed_action TEXT;     -- 営業時間外のアクション
ALTER TABLE ivr_options ADD COLUMN closed_target TEXT;
ALTER TABLE ivr_options ADD COLUMN time_rule_id INTEGER REFERENCES time_rules(id) ON DELETE SET NULL;
```

action=business_hours_branch のとき、`open_action`/`closed_action` を見る。
他の action のときは無視。

**dialplan 生成** (営業時間判定は既存 [businesshours] context を参照):

```
exten => 0,1,NoOp(business_hours_branch ${TIME_RULE_ID})
 same => n,GotoIfTime(${OPEN_DAYS},${OPEN_HOURS},*,*?open_path)
 same => n,Goto(closed_path)
 same => n(open_path),Goto(${OPEN_CTX},${OPEN_TARGET},1)
 same => n(closed_path),Goto(${CLOSED_CTX},${CLOSED_TARGET},1)
```

**UI**: カードに「営業時間 [select from time_rules]」「営業時間内 → ...」
「営業時間外 → ...」の入れ子フォーム。

---

### `goto_ivr` (既存・補強)

既に存在するが、UI ヘルパで「別ルールへ」とだけ表示。多段フロー設計の基礎
として、循環防止のチェックを `validateIvrInput()` に入れる:

```ts
// 互いに goto_ivr で参照し合う A→B→A のループを検出して reject
```

---

### `hangup` (既存・補強)

切断前に goodbye_prompt が再生されないケースがあるので、`renderIvrDialplan()`
で hangup 直前に固定で `Playback(${goodbyePrompt})` を挟む統一化を行う。

## マイグレーション順序

新 column はすべて `ALTER TABLE ... ADD COLUMN ... NULL` で済むので冪等
migration として `migrateIvrMenus(db)` に追記する (既存パターンに揃える)。
`ivr_options` への ADD COLUMN は新規列が NULL のままで現行 IVR は壊れない。

`sms_templates` / `sms_outbox` は新規テーブルなので `CREATE TABLE IF NOT EXISTS`
で SCHEMA に追加。

## UI 影響範囲

- `apps/web/src/app/ivr/IvrEditor.tsx`:
  - `ACTION_OPTIONS` に 4 つ追加
  - `ACTION_META` に shortLabel / badgeClass / helper 追加
  - カードの追加フィールド表示ロジック: action ごとに必要なフィールド
    (guidance / record / sms / business hours) を出し分け
  - 既存の DnD / カード構造は変えない
- `apps/web/src/app/ivr/page.tsx`:
  - `listSmsTemplates()` を呼んで IvrEditor に渡す
  - `listTimeRules()` を呼んで business_hours_branch 用に渡す
- 新ページ `/sms-templates`:
  - admin だけがアクセス可 (`requireRole('admin')`)
  - 通常の CRUD ページ
- `lib/ivr.ts` / `lib/ivr-format.ts`:
  - `IvrAction` 型拡張
  - `IvrOption` interface に新 field
  - `validateIvrInput()` に新 action ごとの検証分岐
  - `renderIvrDialplan()` に dialplan 生成分岐

## ロールアウト案

1 PR で全部入れると IvrEditor が更に肥大化するので、2 PR に分割推奨:

### PR A: `feature/ivr-actions-playback-and-record`
- `play_guidance` / `record_message`
- `ivr_options` への ADD COLUMN
- IvrEditor の action selector とカード分岐
- dialplan 生成と event v1 contract 拡張 (kind=`ivr_recorded_message`)

### PR B: `feature/ivr-sms-and-business-hours`
- `sms_templates` / `sms_outbox` 新テーブル
- `send_sms` / `business_hours_branch` action
- 新ページ `/sms-templates`
- watcher が meta → sms_outbox に積むまで (実送信は後)

両 PR とも:
- migration は ALTER ADD COLUMN / CREATE TABLE IF NOT EXISTS の冪等パターン
- 既存 IVR ルールは新 column が NULL で動作し続ける
- 既存 test (52 件) は壊さない

## 出さない/見送る

- React Flow キャンバス: 既に `IvrCanvas.tsx` が存在するが、新 action が
  カード UI で表現できる限りキャンバスは現状維持。多段フローを `ivr_nodes /
  ivr_edges` に移行する設計は別 ADR にする。
- draft / published / version: 「保存 = 即 reload」の現状は本番リスクだが、
  状態モデル変更が大きいので別 PR (`feature/ivr-draft-publish`) に切る。
- IVR 別ダッシュボード: CDR を IVR 別に集計する画面は別 PR で。

## オープン課題

- SMS 送信のプロバイダ抽象化: Twilio 固有にすると依存が増える。outbox 方式
  で「送信ワーカーは別プロセス」にしておくと差し替え可能。
- `record_message` の録音長さデフォルト: 60 秒で固定か、template 化するか。
- `business_hours_branch` で同じ time_rule を IVR と外側 dialplan 両方で
  使う場合、time_rule の意味のずれが出るリスク。MVP では IVR 内のみで参照
  し、`writeBusinessHoursAndReload()` が生成する `[businesshours]` context
  を `GotoIfTime` で参照する形に統一する。
