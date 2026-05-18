// dialplan.d/*.conf を書き出して Asterisk に reload signal を送る共通ヘルパ。
import path from 'node:path';
import fs from 'node:fs/promises';

const DIALPLAN_OUT_DIR = process.env.DIALPLAN_OUT_DIR ?? '/asterisk/dialplan.d';
const ASTERISK_SIGNAL_DIR = process.env.ASTERISK_SIGNAL_DIR ?? '/asterisk/signals';

export async function writeDialplanFile(name: string, content: string): Promise<string> {
  if (!/^[a-zA-Z0-9._-]+\.conf$/.test(name)) {
    throw new Error(`invalid dialplan filename: ${name}`);
  }
  await fs.mkdir(DIALPLAN_OUT_DIR, { recursive: true });
  const outPath = path.join(DIALPLAN_OUT_DIR, name);
  await fs.writeFile(outPath, content, 'utf-8');
  return outPath;
}

export async function signalAsteriskReload(): Promise<void> {
  await fs.mkdir(ASTERISK_SIGNAL_DIR, { recursive: true });
  await fs.writeFile(path.join(ASTERISK_SIGNAL_DIR, 'reload'), String(Date.now()), 'utf-8');
}
