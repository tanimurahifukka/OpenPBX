// RFC 6238 TOTP / RFC 4648 base32 (HOTP w/ SHA-1, 30s, 6 digits) — 依存追加なし。
import crypto from 'node:crypto';

const STEP = 30;
const DIGITS = 6;

// base32 (RFC 4648, no padding)
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    out += ALPHABET[(value << (5 - bits)) & 31];
  }
  return out;
}

export function base32Decode(input: string): Buffer {
  const cleaned = input.toUpperCase().replace(/=+$/, '').replace(/\s+/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of cleaned) {
    const idx = ALPHABET.indexOf(ch);
    if (idx < 0) throw new Error(`invalid base32 char: ${ch}`);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function generateSecret(bytes = 20): string {
  return base32Encode(crypto.randomBytes(bytes));
}

function hotp(secret: Buffer, counter: number): string {
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buf.writeUInt32BE(counter & 0xffffffff, 4);
  const h = crypto.createHmac('sha1', secret).update(buf).digest();
  const offset = h[h.length - 1] & 0xf;
  const code =
    ((h[offset] & 0x7f) << 24) |
    ((h[offset + 1] & 0xff) << 16) |
    ((h[offset + 2] & 0xff) << 8) |
    (h[offset + 3] & 0xff);
  return String(code % 10 ** DIGITS).padStart(DIGITS, '0');
}

export function generateTotp(secretBase32: string, time = Date.now()): string {
  return hotp(base32Decode(secretBase32), Math.floor(time / 1000 / STEP));
}

export function verifyTotp(secretBase32: string, code: string, time = Date.now()): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  const counter = Math.floor(time / 1000 / STEP);
  const secret = base32Decode(secretBase32);
  // ±1 ステップ (前後 30秒) を許容
  for (const delta of [-1, 0, 1]) {
    if (hotp(secret, counter + delta) === code) return true;
  }
  return false;
}

export function buildOtpauthUri(account: string, secret: string, issuer = 'OpenPBX'): string {
  const enc = encodeURIComponent;
  return `otpauth://totp/${enc(issuer)}:${enc(account)}?secret=${secret}&issuer=${enc(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP}`;
}
