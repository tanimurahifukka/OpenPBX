# OpenPBX

Asterisk + Next.js + SQLite による **Mac で動く PBX の MVP**。BIZTEL / RemoTEL を参考に、
内線・IVR・着信グループ・録音・WebRTC・外線 (SIP trunk) ・課金・監査ログ・認証 (2FA 含む)
まで一通り Web UI から操作できる範囲をまとめた個人開発プロジェクト。

> ⚠️ **このリポジトリは MVP / 学習目的です**。デフォルトの secret やパスワードがコードに
> ハードコードされています。**本番運用する前に必ず後述の "本番化チェックリスト" の値を変更**
> してください。

## できること (概要)

| 機能カテゴリ | 内容 |
| --- | --- |
| 内線 | 端末 CRUD / WebRTC フラグ / Asterisk PJSIP 設定の自動生成 + reload |
| 着信ルーティング | 着信グループ (ringall / linear) / ピックアップ (*8) / IVR エディタ |
| 通話制御 | 録音 (Asterisk Record / MixMonitor) / `data/inbox/` へ wav+meta.json 投下 |
| 履歴 / 監視 | 発着信履歴 (CDR) / 端末ライブ状態 (AMI + SSE) / 同時通話数グラフ |
| 業務時間 | 祝日カレンダー / 時間帯ルール / カレンダールール |
| 音声 | 共通ガイダンス管理 (wav アップロード) / 日本語 TTS スクリプト (macOS の say + afconvert) |
| 認証 | Cookie session + scrypt / ロール (user / supervisor / admin) / 2FA (TOTP) |
| セキュリティ | パスワードポリシー / IP アクセス制御 (CIDR) / 操作監査ログ / ログイン履歴 |
| 課金 | レート表 (prefix × 円/分) と CDR から自動算出 |
| 外線 | SIP trunk CRUD (DID inbound / outbound prefix) / Asterisk PJSIP 動的生成 |
| ブラウザ電話 | sip.js + Asterisk WebSocket (wss) のソフトフォン UI |
| クライアント連携 | Click-to-call API + Chrome 拡張 (`chrome-extension/`) |
| 運用 | バージョンアップ予約 / `dialplan.d/` 動的書き出し |

PBX 単体として完結する設計で、文字起こし / AI 要約などは **隣の `command-room-ai/` 別リポ**
(本リポでは `data/inbox/` の wav+meta.json を後段で拾う設計) で扱うことを想定。

## アーキ図

```
[Groundwire / 他 SIP client]
        │  SIP/RTP (5060/UDP, 5060/TCP, 10000-10020/UDP)
        ▼
[Asterisk container]                          host-tts/ (Mac say で IVR 音声生成)
  - pjsip.conf + pjsip.d/*.conf (Web が動的生成)
  - extensions.conf + dialplan.d/*.conf (同上)
  - AMI (5038/tcp) ← Web から購読
  - http.conf + http(s)/wss (8088 / 8089)
  - cdr_csv → Master.csv
        │  evt
        ▼
notify-event.sh → /inbox/<basename>.{wav,meta.json}
        │
        ▼ (外部 AI 統合層は別 repo: command-room-ai)
        
[Web container — Next.js 15 + SQLite]
  - middleware (cookie 認証ガード + IP 制御)
  - /api/* (originate, devices/stream SSE, recordings, etc.)
  - /pages (UI、全機能の CRUD)
  - lib/ami.ts (AMI client, 自前 TCP)
  - lib/cdr.ts (Master.csv tail → cdr_records)
  - lib/auth.ts (scrypt + cookie session + TOTP)
```

## 起動 (Mac + Docker Desktop)

```bash
git clone https://github.com/tanimurahifukka/OpenPBX.git
cd OpenPBX
docker compose build
docker compose up -d
```

初回ビルドは Asterisk + Next.js のイメージビルドで数分。起動後:

- **ブラウザ管理画面**: <http://localhost:3000>
- **SIP signaling**: `<Mac の IP>:5060` (UDP/TCP)
- **WebRTC (wss)**: `<Mac の IP>:8089` (証明書は別途、後述)
- **RTP media**: `localhost:10000-10020/udp`

### 初回ログイン

```
ユーザー: admin
パスワード: admin-please-change
```

→ ログイン後、**すぐに `/me` から自分のパスワードを変更**してください。
   `/accounts` でロール (user / supervisor / admin) を持つ別ユーザを追加できます。

### 内線の登録 (Groundwire 等)

| 項目 | 値 |
| --- | --- |
| Username / Auth Username | `1001` |
| Password | `secret-1001` ※`/extensions` で変更可 |
| Server / Domain | `<Mac の IP>` (例 `192.168.1.10`) |
| Port | `5060` |
| Transport | UDP (TCP / TLS でも可) |

## 主要画面 (URL とロール)

| URL | 機能 | 必要ロール |
| --- | --- | --- |
| `/` | 概要ダッシュボード (端末数 / Inbox / pjsip 更新) | user+ |
| `/extensions` | 内線端末 CRUD + WebRTC フラグ | user+ |
| `/devices` | AMI 経由のライブ端末状態 (SSE) | user+ |
| `/ring-groups` | 着信グループ (ringall / linear) | user+ |
| `/pickup-groups` | ピックアップグループ (`*8`) | user+ |
| `/phonebook` | 共通電話帳 + 逆引き API | user+ |
| `/business-hours` | 祝日 / 時間帯ルール | user+ |
| `/ivr` | IVR エディタ (DB 駆動 dialplan) | user+ |
| `/guidances` | ガイダンス wav 管理 | user+ |
| `/cdr` | 発着信履歴 (CDR, 検索付き) | user+ |
| `/recordings` | 録音 wav 一覧 + 再生 | user+ |
| `/concurrency` | 同時通話数履歴グラフ | user+ |
| `/softphone` | ブラウザ電話 (sip.js, WebRTC 必要) | user+ |
| `/billing` | レート設定 + 課金明細 | supervisor / admin |
| `/audit` | 操作 / ログイン履歴 | supervisor / admin |
| `/accounts` | アカウント管理 | admin |
| `/security` | パスワードポリシー / IP 許可リスト | admin |
| `/trunks` | SIP trunk (外線) 設定 | admin |
| `/network` | 外部 IP / NAT 設定 (Tailscale や WAN 越し用) | admin |
| `/upgrades` | バージョンアップ予約 | admin |
| `/me` | マイアカウント (表示名 / パスワード / 2FA) | self |

## 特殊番号 (デフォルト)

| 特番 | 用途 |
| --- | --- |
| `1001`, `1002`, `1003` | seed された内線 |
| `9000` | IVR (`/ivr` で編集可) |
| `9001` | 当日予約録音 → `data/inbox/` 投下 |
| `9002` | 折返し依頼録音 → 同上 |
| `*8` | 同じピックアップグループの呼出を代理応答 |
| `6XXX` | 着信グループ番号帯 (任意) |

## Tailscale で内線を外出先から使う

同じ Tailnet (Tailscale 仮想ネットワーク) 上の端末を **そのまま内線として登録**できます。
出張中の iPhone や自宅 Mac から、社内 LAN にいるかのように内線通話が可能です。

### 手順

1. **ホスト Mac に Tailscale を入れて Tailnet に参加**
   ```bash
   brew install --cask tailscale
   open -a Tailscale     # GUI でログイン
   tailscale ip -4       # 100.x.x.x の IP を取得
   ```
2. 内線で使う他端末 (iPhone / Android / Mac / Linux) を **同じ Tailnet** に追加
3. ブラウザで <http://localhost:3000/network> を開き、
   取得した 100.x.x.x を **External Media Address** と **External Signaling Address** に入力
4. **Local Net は空欄のまま** 保存
5. 出先の SIP クライアント (Groundwire / Linphone / Zoiper) で `Server` に
   その 100.x.x.x を、`Port` に `5060` を、`Username/Password` には `/extensions` の値を入力

これで Tailnet 上の任意の端末から、社内と同じ番号体系で内線通話・IVR・録音まで全部使えます。

### 仕組み

- `/network` で設定した値が `asterisk/pjsip.d/transports.conf` に自動反映され、Asterisk reload
- PJSIP の transport セクションに `external_media_address` / `external_signaling_address` /
  必要な場合だけ `local_net` を埋め込むことで、Asterisk が Contact ヘッダ・RTP の外向き IP を
  正しく返す
- Mac の Docker Desktop では、スマホ / LAN / Tailnet は Asterisk container から見ると
  そのまま到達できる「ローカルネット」ではありません。`local_net` に `192.168.0.0/16` や
  `100.64.0.0/10` を入れると外部 IP 書換が止まり、登録や通話が不安定になります
- ホスト Mac の Tailscale が `100.x.x.x:5060` を listen し、Docker Desktop の port publish
  経由で Asterisk container に転送

### トラブルシュート

- **音が片方向**: RTP ポート (10000-10020/udp) が Tailscale でも通る必要あり。Tailscale は
  UDP をそのまま通すので通常は OK。Mac のファイアウォールで Docker への UDP を許可
- **登録は通るが通話が切れる / 登録が不安定**: Local Net に LAN/Tailnet の CIDR を入れていないか確認。
  Docker Desktop では通常空欄にする
- **WAN グローバル IP でも同じ仕組みで動く**: ルータの 5060 + 10000-10020 を forward すれば
  Tailscale を使わずに同じ設定で WAN 公開も可能 (推奨はしない、Tailscale 経由の方が安全)

## WebRTC ソフトフォン (ブラウザ電話)

`/softphone` を使う前に Asterisk container に TLS 証明書を置いてください。
ローカル開発なら `mkcert` 推奨:

```bash
brew install mkcert nss
mkcert -install
mkcert -cert-file asterisk/certs/asterisk.pem \
       -key-file asterisk/certs/asterisk.key \
       localhost 127.0.0.1 $(hostname -s)
docker compose restart asterisk
```

`/extensions` で対象内線の **「WebRTC を有効化」** にチェック → ブラウザで `/softphone` → 「登録」。
証明書が自己署名なので一度 `https://<host>:8089/` を別タブで開いて承認しておく必要があります。

## Chrome 拡張 (Click-to-call)

`chrome-extension/` をパッケージ化なしの拡張機能として読み込むと、ページ上の電話番号や
`tel:` リンクをクリックすると AMI Originate 経由で内線→相手に発信されます。詳細は
`chrome-extension/README.md` を参照。

## TTS (IVR 音声生成)

macOS の `say` で日本語 IVR プロンプトを `asterisk/sounds/custom/` に生成:

```bash
./host-tts/make-prompts.sh
```

デフォルト声は `Kyoko`。`TTS_VOICE=Sandy ./host-tts/make-prompts.sh` で変更可。

## 外部統合層 (AI / 文字起こし) を繋ぐとき

PBX 側は `data/inbox/<basename>.{wav,meta.json}` を出力するだけ。
別 repo (例: `command-room-ai`) で `data/inbox/` を監視するワーカーを書き、
Whisper / Bonsai / LLM 等で処理する設計。本リポは AI 機能を一切持たない。

`meta.json` のスキーマ:

```json
{
  "schema": "command-room-pbx/v1",
  "source": "asterisk",
  "kind": "same_day_reservation",
  "extension": "9001",
  "callerId": "1001",
  "callerName": "Reception 1001",
  "uniqueId": "1779019798.0",
  "recordingFile": "1779019798.0-9001-1001.wav",
  "receivedAt": "2026-05-17T13:27:03Z"
}
```

## ディレクトリ構成

```
OpenPBX/
├ docker-compose.yml
├ asterisk/                  # Asterisk 設定 (テンプレ + 動的書き出し)
│  ├ pjsip.conf / pjsip.d/*.conf
│  ├ extensions.conf / dialplan.d/*.conf
│  ├ manager.conf            # AMI
│  ├ cdr.conf / http.conf
│  ├ sounds/custom/          # IVR 音声 (host-tts で生成)
│  ├ certs/                  # mkcert などの TLS 証明書
│  ├ notify-event.sh         # 録音 → inbox 投下
│  └ entrypoint.sh           # reload watcher + asterisk 起動
├ apps/web/                  # Next.js 15 (App Router) + Tailwind + SQLite
│  ├ src/app/                # 各 CRUD ページ + Server Action (actions.ts)
│  ├ src/lib/                # ドメインロジック (extensions / cdr / ami / auth ...)
│  ├ src/components/         # ConfirmButton / FlashBanner
│  └ src/middleware.ts       # 認証 + IP 制御ガード
├ chrome-extension/          # Click-to-call (manifest v3)
├ host-tts/make-prompts.sh   # macOS の say で IVR 音声を生成
├ data/                      # SQLite / 録音 / inbox / signals (gitignore)
└ README.md
```

## 本番化チェックリスト ⚠️

リポジトリのデフォルト値は **学習用です**。実環境で運用する前に **必ず以下を変更**:

| 値 | デフォルト | 変更場所 |
| --- | --- | --- |
| admin パスワード | `admin-please-change` | `/me` から変更 |
| 内線 1001/1002 の secret | `secret-1001` / `secret-1002` | `/extensions` から変更 |
| AMI secret | `openpbx-ami-secret` | `asterisk/manager.conf` + `docker-compose.yml` の env |
| Server Action 暗号化 key | リポ固定値 | `docker-compose.yml` の `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` (生成: `openssl rand -base64 32`) |
| Cookie secure フラグ | `false` (LAN 想定) | `apps/web/src/lib/auth.ts` の `createSession` |
| AMI のアクセス許可レンジ | `172.0.0.0/8` (Docker bridge) | `asterisk/manager.conf` |

加えて:

- production では HTTPS + リバプロ (nginx / Caddy) の前段配置を推奨
- WebRTC 証明書は **mkcert ではなく Let's Encrypt 等** の正式 CA で
- SIP trunk の `secret` は **絶対に platform secret で**

## ライセンスとリスク

- 本リポは個人の学習・実験プロジェクト。**商用利用は無保証**
- Asterisk / Next.js / sip.js などの依存ライブラリのライセンスは各 OSS に従う
- BIZTEL / RemoTEL とは無関係 (機能を参考にした個人実装)

## 開発メモ

- 全 Server Action は `apps/web/src/app/actions.ts` の `flash()` ヘルパで包まれており、成功/失敗が `FlashBanner` で UI に出る
- 動的 PJSIP / dialplan は `/signals/reload` を Web が touch → Asterisk container の watcher が `pjsip reload` / `dialplan reload` を発火
- DB マイグレーションは `apps/web/src/lib/db.ts` の `migrateXxx()` で冪等に列追加
- ロール: `user / supervisor / admin`。Server Action 内で `requireRole(...)` ガード

問題が見つかったら issues へ。
