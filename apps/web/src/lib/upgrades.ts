import { getDb } from './db';

export interface UpgradeJob {
  id: number;
  scheduledAt: string;
  asteriskImage: string;
  webImage: string | null;
  note: string | null;
  appliedAt: string | null;
  createdAt: string;
}

interface Row {
  id: number;
  scheduled_at: string;
  asterisk_image: string;
  web_image: string | null;
  note: string | null;
  applied_at: string | null;
  created_at: string;
}

function rowTo(r: Row): UpgradeJob {
  return {
    id: r.id,
    scheduledAt: r.scheduled_at,
    asteriskImage: r.asterisk_image,
    webImage: r.web_image,
    note: r.note,
    appliedAt: r.applied_at,
    createdAt: r.created_at,
  };
}

export function listUpgrades(): UpgradeJob[] {
  return (
    getDb()
      .prepare('SELECT * FROM version_upgrades ORDER BY scheduled_at DESC LIMIT 100')
      .all() as Row[]
  ).map(rowTo);
}

export function scheduleUpgrade(input: {
  scheduledAt: string;
  asteriskImage: string;
  webImage?: string;
  note?: string;
}): UpgradeJob {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(input.scheduledAt)) {
    throw new Error('scheduledAt は ISO 形式');
  }
  if (!input.asteriskImage.trim()) throw new Error('asteriskImage required');
  const info = getDb()
    .prepare(
      `INSERT INTO version_upgrades (scheduled_at, asterisk_image, web_image, note)
       VALUES (?, ?, ?, ?)`,
    )
    .run(input.scheduledAt, input.asteriskImage, input.webImage ?? null, input.note ?? null);
  const row = getDb().prepare('SELECT * FROM version_upgrades WHERE id = ?').get(Number(info.lastInsertRowid)) as Row;
  return rowTo(row);
}

export function deleteUpgrade(id: number): boolean {
  return getDb().prepare('DELETE FROM version_upgrades WHERE id = ?').run(id).changes > 0;
}
