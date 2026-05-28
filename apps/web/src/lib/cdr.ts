// Asterisk の cdr_csv (Master.csv) を tail で取り込み、cdr_records テーブルに upsert する。
// 仕様: https://docs.asterisk.org/Configuration/Reports/CDR/CDR-CSV-Backend/
// 各行は double-quoted CSV。フィールド順は accountcode,src,dst,dcontext,clid,channel,
// dstchannel,lastapp,lastdata,start,answer,end,duration,billsec,disposition,amaflag,userfield,uniqueid

import fs from 'node:fs/promises';
import fssync from 'node:fs';
import { getDb } from './db';
import { detectMissedCalls, deduplicateByCaller, enqueueMissedCallEvent, recordMissedCallEvent } from './missedCalls';

const CSV_PATH = process.env.CDR_CSV_PATH ?? '/app/data/asterisk-cdr/Master.csv';

interface CdrRow {
  accountcode: string;
  src: string;
  dst: string;
  dcontext: string;
  clid: string;
  channel: string;
  dstchannel: string;
  lastapp: string;
  lastdata: string;
  start: string;
  answer: string;
  end: string;
  duration: string;
  billsec: string;
  disposition: string;
  amaflag: string;
  userfield: string;
  uniqueid: string;
}

// Asterisk の cdr_csv は version によりフィールド数が変わる。
// 古い版: 18 列 (userfield あり)
// 21+ : 17 列 (userfield 省略、最後が uniqueid)
// 順序は固定なので、 cols.length が 17 か 18 かで uniqueid 位置を判定する。
const FIELDS_18 = [
  'accountcode', 'src', 'dst', 'dcontext', 'clid', 'channel', 'dstchannel',
  'lastapp', 'lastdata', 'start', 'answer', 'end', 'duration', 'billsec',
  'disposition', 'amaflag', 'userfield', 'uniqueid',
] as const;
const FIELDS_17 = [
  'accountcode', 'src', 'dst', 'dcontext', 'clid', 'channel', 'dstchannel',
  'lastapp', 'lastdata', 'start', 'answer', 'end', 'duration', 'billsec',
  'disposition', 'amaflag', 'uniqueid',
] as const;

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuote) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuote = false;
        }
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') inQuote = true;
      else if (ch === ',') {
        out.push(cur);
        cur = '';
      } else cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function rowFromCols(cols: string[]): CdrRow | null {
  const row = {} as Record<string, string>;
  let fields: readonly string[];
  if (cols.length >= 18) fields = FIELDS_18;
  else if (cols.length >= 17) fields = FIELDS_17;
  else return null;
  for (let i = 0; i < fields.length; i++) row[fields[i]] = cols[i] ?? '';
  if (!row.userfield) row.userfield = '';
  return row as unknown as CdrRow;
}

function dispositionLabel(s: string): string {
  // ANSWERED / NO ANSWER / BUSY / FAILED など。生のままを SQLite に入れる。
  return s;
}

async function getState(): Promise<{ source_path: string | null; inode: number | null; offset: number }> {
  const db = getDb();
  const r = db
    .prepare('SELECT source_path, inode, offset FROM cdr_ingest_state WHERE id = 1')
    .get() as { source_path: string | null; inode: number | null; offset: number } | undefined;
  return r ?? { source_path: null, inode: null, offset: 0 };
}

function saveState(sourcePath: string, inode: number, offset: number) {
  getDb()
    .prepare(
      `INSERT INTO cdr_ingest_state (id, source_path, inode, offset, updated_at)
       VALUES (1, ?, ?, ?, datetime('now'))
       ON CONFLICT(id) DO UPDATE SET source_path = excluded.source_path, inode = excluded.inode, offset = excluded.offset, updated_at = datetime('now')`,
    )
    .run(sourcePath, inode, offset);
}

const INSERT_SQL = `
INSERT INTO cdr_records (uniqueid, src, dst, dcontext, clid, channel, dst_channel, lastapp, lastdata,
                        start_at, answer_at, end_at, duration, billsec, disposition, amaflag,
                        accountcode, userfield, imported_at)
VALUES (@uniqueid, @src, @dst, @dcontext, @clid, @channel, @dstchannel, @lastapp, @lastdata,
        @start, @answer, @end, @duration, @billsec, @disposition, @amaflag,
        @accountcode, @userfield, datetime('now'))
ON CONFLICT(uniqueid) DO UPDATE SET
  src = excluded.src,
  dst = excluded.dst,
  start_at = excluded.start_at,
  answer_at = excluded.answer_at,
  end_at = excluded.end_at,
  duration = excluded.duration,
  billsec = excluded.billsec,
  disposition = excluded.disposition
`;

export async function ingestCdrOnce(): Promise<{ ingested: number; offset: number; skipped: boolean }> {
  let st;
  try {
    st = await fs.stat(CSV_PATH);
  } catch {
    return { ingested: 0, offset: 0, skipped: true };
  }
  if (!st.isFile() || st.size === 0) return { ingested: 0, offset: 0, skipped: true };

  const state = await getState();
  let offset = state.offset;
  // inode 変化 = rotation → 先頭から
  if (state.inode !== st.ino) {
    offset = 0;
  }
  if (offset >= st.size) {
    // 何も新規なし
    saveState(CSV_PATH, st.ino, offset);
    return { ingested: 0, offset, skipped: false };
  }

  const stream = fssync.createReadStream(CSV_PATH, { start: offset, end: st.size - 1, encoding: 'utf-8' });
  let buf = '';
  let bytes = 0;
  for await (const chunk of stream) {
    buf += chunk;
    bytes += Buffer.byteLength(chunk as string);
  }
  const newOffset = offset + bytes;
  const lines = buf.split('\n');
  // 末尾が改行で終わっていない場合は次回に持ち越すべきだが、簡略化して捨てる
  const records: CdrRow[] = [];
  for (const line of lines) {
    const trimmed = line.replace(/\r$/, '');
    if (!trimmed) continue;
    const cols = parseCsvLine(trimmed);
    const row = rowFromCols(cols);
    if (row && row.uniqueid) records.push(row);
  }

  const db = getDb();
  const insert = db.prepare(INSERT_SQL);
  const tx = db.transaction((rows: CdrRow[]) => {
    for (const r of rows) {
      insert.run({
        uniqueid: r.uniqueid,
        src: r.src,
        dst: r.dst,
        dcontext: r.dcontext,
        clid: r.clid,
        channel: r.channel,
        dstchannel: r.dstchannel,
        lastapp: r.lastapp,
        lastdata: r.lastdata,
        start: r.start || null,
        answer: r.answer || null,
        end: r.end || null,
        duration: Number(r.duration) || 0,
        billsec: Number(r.billsec) || 0,
        disposition: dispositionLabel(r.disposition),
        amaflag: r.amaflag,
        accountcode: r.accountcode,
        userfield: r.userfield,
      });
    }
  });
  tx(records);
  saveState(CSV_PATH, st.ino, newOffset);
  return { ingested: records.length, offset: newOffset, skipped: false };
}

export interface CdrRecord {
  uniqueid: string;
  src: string | null;
  dst: string | null;
  dcontext: string | null;
  clid: string | null;
  channel: string | null;
  dstChannel: string | null;
  lastapp: string | null;
  lastdata: string | null;
  startAt: string | null;
  answerAt: string | null;
  endAt: string | null;
  duration: number;
  billsec: number;
  disposition: string | null;
}

interface CdrRow2 {
  uniqueid: string;
  src: string | null;
  dst: string | null;
  dcontext: string | null;
  clid: string | null;
  channel: string | null;
  dst_channel: string | null;
  lastapp: string | null;
  lastdata: string | null;
  start_at: string | null;
  answer_at: string | null;
  end_at: string | null;
  duration: number;
  billsec: number;
  disposition: string | null;
}

export interface ListCdrFilter {
  from?: string; // UTC datetime
  to?: string;
  src?: string;
  dst?: string;
  disposition?: string;
  limit?: number;
}

export function listCdr(filter: ListCdrFilter = {}): CdrRecord[] {
  const conds: string[] = [];
  const params: unknown[] = [];
  if (filter.from) {
    conds.push('start_at >= ?');
    params.push(filter.from);
  }
  if (filter.to) {
    conds.push('start_at <= ?');
    params.push(filter.to);
  }
  if (filter.src) {
    conds.push('src LIKE ?');
    params.push(`%${filter.src}%`);
  }
  if (filter.dst) {
    conds.push('dst LIKE ?');
    params.push(`%${filter.dst}%`);
  }
  if (filter.disposition) {
    conds.push('disposition = ?');
    params.push(filter.disposition);
  }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const limit = Math.min(Math.max(filter.limit ?? 200, 1), 1000);
  const rows = getDb()
    .prepare(
      `SELECT uniqueid, src, dst, dcontext, clid, channel, dst_channel, lastapp, lastdata,
              start_at, answer_at, end_at, duration, billsec, disposition
         FROM cdr_records
         ${where}
         ORDER BY datetime(start_at) DESC, uniqueid DESC
         LIMIT ?`,
    )
    .all(...params, limit) as CdrRow2[];
  return rows.map((r) => ({
    uniqueid: r.uniqueid,
    src: r.src,
    dst: r.dst,
    dcontext: r.dcontext,
    clid: r.clid,
    channel: r.channel,
    dstChannel: r.dst_channel,
    lastapp: r.lastapp,
    lastdata: r.lastdata,
    startAt: r.start_at,
    answerAt: r.answer_at,
    endAt: r.end_at,
    duration: r.duration,
    billsec: r.billsec,
    disposition: r.disposition,
  }));
}

// バックグラウンドで 10 秒ごとに ingest する。シングルトン化。
const KEY = '__commandRoomCdrTicker';
export function startCdrIngestLoop(): void {
  const g = globalThis as unknown as Record<string, NodeJS.Timeout | undefined>;
  if (g[KEY]) return;
  async function tick() {
    try {
      const result = await ingestCdrOnce();
      if (result.ingested > 0) {
        try {
          const missed = deduplicateByCaller(detectMissedCalls(2));
          for (const call of missed) {
            const inserted = recordMissedCallEvent(call.uniqueid);
            if (inserted) enqueueMissedCallEvent(call);
          }
          if (missed.length > 0) {
            console.log(`[cdr] detected ${missed.length} missed call(s)`);
          }
        } catch (e) {
          console.error('[cdr] missed call detection error', e);
        }
      }
    } catch (e) {
      console.error('[cdr] ingest error', e);
    }
  }
  g[KEY] = setInterval(tick, 10_000);
  tick();
}
