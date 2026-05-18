// SQLite の datetime('now') は "YYYY-MM-DD HH:MM:SS" (UTC、TZ情報なし) を返す。
// データは UTC のまま保持し、UI 表示時にだけ JST に変換する。

export function toIsoUtc(s: string | null | undefined): string | null {
  if (!s) return null;
  if (s.includes('T') && (s.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(s))) return s;
  return s.replace(' ', 'T') + 'Z';
}

export function formatJst(s: string | null | undefined): string {
  if (!s) return '-';
  const iso = toIsoUtc(s);
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}
