import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS extensions (
  number             TEXT PRIMARY KEY,
  display_name       TEXT,
  secret             TEXT NOT NULL DEFAULT '',
  note               TEXT,
  webrtc             INTEGER NOT NULL DEFAULT 0,
  cfwd_unconditional TEXT,                       -- 無条件転送先 (内線/外線番号)。NULL=無効
  cfwd_busy          TEXT,                       -- 話中時の転送先。NULL=無効
  cfwd_noanswer      TEXT,                       -- 無応答時の転送先。NULL=無効
  dnd                INTEGER NOT NULL DEFAULT 0, -- 取り込み中 (Do Not Disturb)
  updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cdr_records (
  uniqueid       TEXT PRIMARY KEY,
  src            TEXT,
  dst            TEXT,
  dcontext       TEXT,
  clid           TEXT,
  channel        TEXT,
  dst_channel    TEXT,
  lastapp        TEXT,
  lastdata       TEXT,
  start_at       TEXT,
  answer_at      TEXT,
  end_at         TEXT,
  duration       INTEGER,
  billsec        INTEGER,
  disposition    TEXT,
  amaflag        TEXT,
  accountcode    TEXT,
  userfield      TEXT,
  imported_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_cdr_start ON cdr_records(start_at DESC);
CREATE INDEX IF NOT EXISTS idx_cdr_src ON cdr_records(src);
CREATE INDEX IF NOT EXISTS idx_cdr_dst ON cdr_records(dst);

CREATE TABLE IF NOT EXISTS cdr_ingest_state (
  id           INTEGER PRIMARY KEY CHECK (id = 1),
  source_path  TEXT,
  inode        INTEGER,
  offset       INTEGER NOT NULL DEFAULT 0,
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ring_groups (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  number             TEXT NOT NULL UNIQUE,
  name               TEXT,
  strategy           TEXT NOT NULL DEFAULT 'ringall',
  ring_seconds       INTEGER NOT NULL DEFAULT 30,
  fallback_extension TEXT,
  updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ring_group_members (
  ring_group_id    INTEGER NOT NULL REFERENCES ring_groups(id) ON DELETE CASCADE,
  extension_number TEXT NOT NULL,
  priority         INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (ring_group_id, extension_number)
);

CREATE TABLE IF NOT EXISTS pickup_groups (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL UNIQUE,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pickup_group_members (
  pickup_group_id   INTEGER NOT NULL REFERENCES pickup_groups(id) ON DELETE CASCADE,
  extension_number  TEXT NOT NULL,
  PRIMARY KEY (pickup_group_id, extension_number)
);

CREATE TABLE IF NOT EXISTS phonebook (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT NOT NULL,
  number       TEXT NOT NULL,
  org          TEXT,           -- 組織名 / 会社名 (多業種向け: 取引先・顧客の会社名など)
  category     TEXT,           -- 任意ラベル (顧客 / 取引先 / スタッフ など)
  note         TEXT,
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_phonebook_number ON phonebook(number);
CREATE INDEX IF NOT EXISTS idx_phonebook_name   ON phonebook(name);
-- idx_phonebook_org は migratePhonebook 内で org 列の ALTER 後に作る
-- (CREATE TABLE IF NOT EXISTS は既存 DB だと no-op なため、org 列がまだ無い状態で
--  CREATE INDEX を走らせると "no such column" で applySchema 全体が失敗する)

CREATE TABLE IF NOT EXISTS holidays (
  date       TEXT PRIMARY KEY,   -- YYYY-MM-DD
  name       TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS time_rules (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL UNIQUE,
  days        TEXT NOT NULL DEFAULT 'mon-fri',
  start_time  TEXT NOT NULL DEFAULT '09:00',
  end_time    TEXT NOT NULL DEFAULT '18:00',
  note        TEXT,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ivr_menus (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  number              TEXT NOT NULL UNIQUE,
  name                TEXT,
  welcome_prompt      TEXT,                   -- sounds/<path>
  menu_prompt         TEXT,                   -- sounds/<path>
  invalid_prompt      TEXT,
  goodbye_prompt      TEXT,
  max_retries         INTEGER NOT NULL DEFAULT 3,
  wait_seconds        INTEGER NOT NULL DEFAULT 6,
  after_hours_action  TEXT,                   -- 'goto_ivr' | 'goto_extension' | 'hangup' | NULL
  after_hours_target  TEXT,
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ivr_options (
  ivr_menu_id  INTEGER NOT NULL REFERENCES ivr_menus(id) ON DELETE CASCADE,
  digit        TEXT NOT NULL,
  action       TEXT NOT NULL,
  target       TEXT,
  label        TEXT,
  PRIMARY KEY (ivr_menu_id, digit)
);

CREATE TABLE IF NOT EXISTS ivr_caller_id_routes (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  ivr_menu_id   INTEGER NOT NULL REFERENCES ivr_menus(id) ON DELETE CASCADE,
  position      INTEGER NOT NULL DEFAULT 0,
  pattern       TEXT NOT NULL,             -- '0312345678' or '090*'
  action        TEXT NOT NULL,             -- 'goto_ivr' | 'goto_extension' | 'hangup'
  target        TEXT,
  label         TEXT
);
CREATE INDEX IF NOT EXISTS idx_ivr_cid_routes_menu
  ON ivr_caller_id_routes(ivr_menu_id, position);

CREATE TABLE IF NOT EXISTS app_settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS guidances (
  name        TEXT PRIMARY KEY,
  text        TEXT,
  source      TEXT NOT NULL DEFAULT 'upload',
  size        INTEGER,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS accounts (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  username        TEXT NOT NULL UNIQUE,
  display_name    TEXT,
  password_hash   TEXT NOT NULL,         -- scrypt $N$r$p$salt$hash
  role            TEXT NOT NULL DEFAULT 'user',  -- 'user' | 'supervisor' | 'admin'
  totp_secret     TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token         TEXT PRIMARY KEY,
  account_id    INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at    TEXT NOT NULL,
  user_agent    TEXT,
  ip            TEXT
);

CREATE TABLE IF NOT EXISTS audit_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  actor         TEXT,                       -- username
  action        TEXT NOT NULL,              -- 'extension.create', 'login', ...
  target        TEXT,
  details       TEXT,                       -- JSON
  ip            TEXT,
  user_agent    TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC);

CREATE TABLE IF NOT EXISTS login_history (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL,
  success       INTEGER NOT NULL,
  ip            TEXT,
  user_agent    TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_login_history_user ON login_history(username, created_at DESC);

CREATE TABLE IF NOT EXISTS password_policies (
  id                INTEGER PRIMARY KEY CHECK (id = 1),
  min_length        INTEGER NOT NULL DEFAULT 8,
  require_lowercase INTEGER NOT NULL DEFAULT 1,
  require_uppercase INTEGER NOT NULL DEFAULT 0,
  require_digit     INTEGER NOT NULL DEFAULT 1,
  require_symbol    INTEGER NOT NULL DEFAULT 0,
  rotation_days     INTEGER NOT NULL DEFAULT 0,
  lockout_threshold INTEGER NOT NULL DEFAULT 5,
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO password_policies (id) VALUES (1);

CREATE TABLE IF NOT EXISTS ip_allow_list (
  cidr        TEXT PRIMARY KEY,
  note        TEXT,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS billing_rates (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  prefix      TEXT NOT NULL UNIQUE,  -- "0X" / "0X0" / "INTL" / "MOBILE"
  label       TEXT,
  per_min     REAL NOT NULL,         -- 円 / 分
  setup_fee   REAL NOT NULL DEFAULT 0,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS concurrency_snapshots (
  minute_at   TEXT PRIMARY KEY,
  channels    INTEGER NOT NULL,
  recorded_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS network_settings (
  id              INTEGER PRIMARY KEY CHECK (id = 1),
  external_ip     TEXT,                 -- 例: Tailscale IP (100.x.x.x) や WAN グローバル IP
  external_signaling_ip TEXT,           -- SIP signaling 用 (省略時 external_ip と同じ)
  local_net       TEXT,                 -- Docker Desktop では通常 NULL。Asterisk が直接到達できる CIDR のみ指定
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO network_settings (id) VALUES (1);

-- patients / patient_records は廃止 (多業種化のため /phonebook に統合)。
-- 既存 DB には残っている場合があるが新スキーマには定義しない。
-- DROP は db migration として init() 内で別途実行する (db 既存テーブルがあるとき)。

CREATE TABLE IF NOT EXISTS version_upgrades (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  scheduled_at TEXT NOT NULL,         -- UTC
  asterisk_image TEXT NOT NULL,        -- 例: ubuntu:24.04 (再ビルド時の base)
  web_image      TEXT,
  note          TEXT,
  applied_at    TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sip_trunks (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT NOT NULL UNIQUE,
  host            TEXT NOT NULL,
  port            INTEGER NOT NULL DEFAULT 5060,
  username        TEXT,
  secret          TEXT,
  registration    INTEGER NOT NULL DEFAULT 1,
  from_user       TEXT,
  from_domain     TEXT,
  did_inbound     TEXT,                       -- 着信時にこの番号を internal の extension に渡す
  outbound_prefix TEXT,                       -- 例: "0" を外線 prefix にする
  note            TEXT,
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS missed_call_events (
  uniqueid    TEXT PRIMARY KEY,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS voicemail_boxes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  number      TEXT NOT NULL UNIQUE,
  name        TEXT,
  prompt      TEXT,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS voicemail_messages (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  box_id          INTEGER NOT NULL REFERENCES voicemail_boxes(id) ON DELETE CASCADE,
  caller_id       TEXT NOT NULL,
  caller_name     TEXT NOT NULL DEFAULT '',
  unique_id       TEXT NOT NULL UNIQUE,
  recording_file  TEXT,
  duration_sec    INTEGER,
  status          TEXT NOT NULL DEFAULT 'new',
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  read_at         TEXT,
  callback_at     TEXT
);
CREATE INDEX IF NOT EXISTS idx_vm_messages_box ON voicemail_messages(box_id, status);
CREATE INDEX IF NOT EXISTS idx_vm_messages_created ON voicemail_messages(created_at DESC);

CREATE TABLE IF NOT EXISTS event_outbox (
  event_id      TEXT PRIMARY KEY,             -- openpbx:<pbxInstanceId>:<uniqueId>
  status        TEXT NOT NULL DEFAULT 'pending',  -- pending | sent | dead
  payload_json  TEXT NOT NULL,                -- command-room-pbx/event/v1 本文
  attempts      INTEGER NOT NULL DEFAULT 0,
  last_error    TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  sent_at       TEXT
);
CREATE INDEX IF NOT EXISTS idx_event_outbox_status ON event_outbox(status, created_at);
`;

const SEED_EXTENSIONS = `
INSERT OR IGNORE INTO extensions (number, display_name, secret, note) VALUES
  ('1001', 'Reception 1001', 'secret-1001', '受付'),
  ('1002', 'Staff 1002',     'secret-1002', 'バックオフィス');
`;

export function applySchema(db: Database.Database): void {
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  migrateExtensions(db);
  migratePhonebook(db);
  migrateIvrMenus(db);
  migrateRingGroups(db);
  dropPatientTables(db);
  db.exec(SEED_EXTENSIONS);
  seedDefaultIvr(db);
}

function seedDefaultIvr(db: Database.Database): void {
  // user_version >= 1 なら seed 済み (ユーザーが 9000 を削除しても再投入しない)。
  const userVersion = db.pragma('user_version', { simple: true }) as number;
  if (userVersion >= 1) return;

  const row = db.prepare('SELECT COUNT(*) AS count FROM ivr_menus').get() as { count: number };
  if (row.count === 0) {
    const seed = db.transaction(() => {
      const info = db
        .prepare(
          `INSERT INTO ivr_menus (number, name, welcome_prompt, menu_prompt, invalid_prompt, goodbye_prompt,
                                  max_retries, wait_seconds, after_hours_action, after_hours_target, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, datetime('now'))`,
        )
        .run(
          '9000',
          'メインメニュー',
          'custom/ivr-welcome',
          'custom/ivr-menu',
          'custom/ivr-invalid',
          'custom/ivr-goodbye',
          3,
          6,
        );
      const menuId = Number(info.lastInsertRowid);
      const insertOption = db.prepare(
        'INSERT INTO ivr_options (ivr_menu_id, digit, action, target, label) VALUES (?, ?, ?, ?, ?)',
      );
      insertOption.run(menuId, '1', 'goto_extension', '9001', '営業窓口');
      insertOption.run(menuId, '2', 'goto_extension', '9002', '折返し依頼');
      insertOption.run(menuId, '0', 'goto_extension', '1001', 'オペレーター');
    });
    seed();
  }
  // 既存 DB (count > 0) と新規 seed 済みの両方で「以降は再 seed 不要」マーク。
  db.pragma('user_version = 1');
}

// 既存 phonebook に org 列を後付け追加する冪等マイグレーション。
// CREATE INDEX idx_phonebook_org も org 列の存在を確認した後でここで作る。
function migratePhonebook(db: Database.Database): void {
  const cols = db.prepare(`PRAGMA table_info(phonebook)`).all() as Array<{ name: string }>;
  const names = new Set(cols.map((c) => c.name));
  if (!names.has('org')) {
    db.exec(`ALTER TABLE phonebook ADD COLUMN org TEXT`);
  }
  db.exec(`CREATE INDEX IF NOT EXISTS idx_phonebook_org ON phonebook(org)`);
}

// patients / patient_records は廃止。古い DB に残っている場合は削除する。
// foreign_keys = ON なので順序は重要 (FK 側の patient_records から)。
function dropPatientTables(db: Database.Database): void {
  db.exec(`
    DROP INDEX IF EXISTS idx_patient_records_date;
    DROP INDEX IF EXISTS idx_patient_records_pid;
    DROP TABLE IF EXISTS patient_records;
    DROP INDEX IF EXISTS idx_patients_name;
    DROP INDEX IF EXISTS idx_patients_kana;
    DROP TABLE IF EXISTS patients;
  `);
}

// 既存DBに対する冪等マイグレーション。
function migrateIvrMenus(db: Database.Database): void {
  const cols = db.prepare(`PRAGMA table_info(ivr_menus)`).all() as Array<{ name: string }>;
  const names = new Set(cols.map((c) => c.name));
  if (!names.has('after_hours_action')) {
    db.exec(`ALTER TABLE ivr_menus ADD COLUMN after_hours_action TEXT`);
  }
  if (!names.has('after_hours_target')) {
    db.exec(`ALTER TABLE ivr_menus ADD COLUMN after_hours_target TEXT`);
  }
}

function migrateRingGroups(db: Database.Database): void {
  const cols = db.prepare(`PRAGMA table_info(ring_groups)`).all() as Array<{ name: string }>;
  const names = new Set(cols.map((c) => c.name));
  if (!names.has('fallback_action')) {
    db.exec(`ALTER TABLE ring_groups ADD COLUMN fallback_action TEXT`);
  }
  if (!names.has('fallback_target')) {
    db.exec(`ALTER TABLE ring_groups ADD COLUMN fallback_target TEXT`);
  }
}

function migrateExtensions(db: Database.Database): void {
  const cols = db.prepare(`PRAGMA table_info(extensions)`).all() as Array<{ name: string }>;
  const names = new Set(cols.map((c) => c.name));
  if (!names.has('secret')) {
    db.exec(`ALTER TABLE extensions ADD COLUMN secret TEXT NOT NULL DEFAULT ''`);
    db.prepare(`UPDATE extensions SET secret = 'secret-1001' WHERE number = '1001' AND secret = ''`).run();
    db.prepare(`UPDATE extensions SET secret = 'secret-1002' WHERE number = '1002' AND secret = ''`).run();
  }
  if (!names.has('updated_at')) {
    db.exec(`ALTER TABLE extensions ADD COLUMN updated_at TEXT`);
    db.exec(`UPDATE extensions SET updated_at = datetime('now') WHERE updated_at IS NULL`);
  }
  if (!names.has('webrtc')) {
    db.exec(`ALTER TABLE extensions ADD COLUMN webrtc INTEGER NOT NULL DEFAULT 0`);
  }
  if (!names.has('cfwd_unconditional')) {
    db.exec(`ALTER TABLE extensions ADD COLUMN cfwd_unconditional TEXT`);
  }
  if (!names.has('cfwd_busy')) {
    db.exec(`ALTER TABLE extensions ADD COLUMN cfwd_busy TEXT`);
  }
  if (!names.has('cfwd_noanswer')) {
    db.exec(`ALTER TABLE extensions ADD COLUMN cfwd_noanswer TEXT`);
  }
  if (!names.has('dnd')) {
    db.exec(`ALTER TABLE extensions ADD COLUMN dnd INTEGER NOT NULL DEFAULT 0`);
  }
}

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;
  const file = process.env.DATABASE_PATH ?? path.resolve(process.cwd(), 'data/db/command-room.sqlite');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  applySchema(db);
  _db = db;
  // Bootstrap admin (循環 import を避けるため遅延 require)
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { ensureBootstrapAdmin } = require('./auth') as typeof import('./auth');
    ensureBootstrapAdmin();
  } catch (e) {
    console.warn('[db] bootstrap admin failed', e);
  }
  // 起動時に pjsip.d と dialplan.d を最新で書き出して reload signal を投げる。
  // 失敗してもアプリ起動は続行 (include 先に空ファイルがあれば Asterisk は問題なし)。
  (async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { writePjsipConfigAndReload } = require('./extensions') as typeof import('./extensions');
      await writePjsipConfigAndReload();
      console.log('[db] pjsip.d initialized on startup');
    } catch (e) {
      console.warn('[db] pjsip.d initial sync failed', e);
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { writeIvrDialplanAndReload } = require('./ivr') as typeof import('./ivr');
      await writeIvrDialplanAndReload();
      console.log('[db] ivr dialplan initialized on startup');
    } catch (e) {
      console.warn('[db] ivr dialplan initial sync failed', e);
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { writeVoicemailDialplanAndReload } = require('./voicemail') as typeof import('./voicemail');
      await writeVoicemailDialplanAndReload();
      console.log('[db] voicemail dialplan initialized on startup');
    } catch (e) {
      console.warn('[db] voicemail dialplan initial sync failed', e);
    }
    try {
      // CDR を 10 秒ごとに ingest するループを起動時に開始 (/cdr を開かなくても動く)
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { startCdrIngestLoop } = require('./cdr') as typeof import('./cdr');
      startCdrIngestLoop();
      console.log('[db] CDR ingest loop started');
    } catch (e) {
      console.warn('[db] CDR ingest loop start failed', e);
    }
    try {
      // command-room-pbx/event/v1 への upgrade ループ。data/inbox/*.meta.json を tail し
      // data/outbox-v1/<eventId>.json + event_outbox テーブルに記録する。
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { startEventV1Loop } = require('./events/v1/watcher') as typeof import('./events/v1/watcher');
      startEventV1Loop();
      console.log('[db] event-v1 upgrade loop started');
    } catch (e) {
      console.warn('[db] event-v1 upgrade loop start failed', e);
    }
    try {
      // command-room への HTTP push（env が揃っているときだけ起動）。
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { startEventV1PushLoop } = require('./events/v1/emit') as typeof import('./events/v1/emit');
      startEventV1PushLoop();
    } catch (e) {
      console.warn('[db] event-v1 push loop start failed', e);
    }
  })();
  return db;
}

export function createInMemoryDb(): Database.Database {
  const db = new Database(':memory:');
  applySchema(db);
  return db;
}
