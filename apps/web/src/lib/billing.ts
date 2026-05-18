import { getDb } from './db';
import { listCdr } from './cdr';

export interface BillingRate {
  id: number;
  prefix: string;
  label: string | null;
  perMin: number;
  setupFee: number;
  updatedAt: string;
}

interface Row {
  id: number;
  prefix: string;
  label: string | null;
  per_min: number;
  setup_fee: number;
  updated_at: string;
}

function row(r: Row): BillingRate {
  return {
    id: r.id,
    prefix: r.prefix,
    label: r.label,
    perMin: r.per_min,
    setupFee: r.setup_fee,
    updatedAt: r.updated_at,
  };
}

export function listRates(): BillingRate[] {
  return (
    getDb()
      .prepare('SELECT id, prefix, label, per_min, setup_fee, updated_at FROM billing_rates ORDER BY prefix')
      .all() as Row[]
  ).map(row);
}

export function upsertRate(input: {
  prefix: string;
  label?: string;
  perMin: number;
  setupFee?: number;
}): void {
  if (!input.prefix.trim()) throw new Error('prefix 必須');
  if (Number.isNaN(input.perMin) || input.perMin < 0) throw new Error('per_min は 0 以上の数値');
  getDb()
    .prepare(
      `INSERT INTO billing_rates (prefix, label, per_min, setup_fee, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'))
       ON CONFLICT(prefix) DO UPDATE SET
         label = excluded.label,
         per_min = excluded.per_min,
         setup_fee = excluded.setup_fee,
         updated_at = datetime('now')`,
    )
    .run(input.prefix, input.label ?? null, input.perMin, input.setupFee ?? 0);
}

export function deleteRate(prefix: string): boolean {
  return getDb().prepare('DELETE FROM billing_rates WHERE prefix = ?').run(prefix).changes > 0;
}

export function rateFor(dst: string | null): BillingRate | null {
  if (!dst) return null;
  const rates = listRates();
  // 長い prefix から優先
  const sorted = [...rates].sort((a, b) => b.prefix.length - a.prefix.length);
  for (const r of sorted) {
    if (dst.startsWith(r.prefix)) return r;
  }
  return null;
}

export interface BillingRow {
  uniqueid: string;
  src: string | null;
  dst: string | null;
  startAt: string | null;
  billsec: number;
  rate: BillingRate | null;
  cost: number; // 円
}

export function listBilling(from?: string, to?: string): BillingRow[] {
  const cdr = listCdr({ from, to, limit: 1000 });
  return cdr.map((c) => {
    const r = rateFor(c.dst);
    let cost = 0;
    if (r && c.billsec > 0) {
      cost = r.setupFee + (c.billsec / 60) * r.perMin;
    }
    return {
      uniqueid: c.uniqueid,
      src: c.src,
      dst: c.dst,
      startAt: c.startAt,
      billsec: c.billsec,
      rate: r,
      cost: Math.round(cost * 100) / 100,
    };
  });
}
