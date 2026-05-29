// 駐車中の通話をブラウザから取り出す。
// 取り出し先の内線を呼び出し、応答したら駐車スロット (701-720) に接続する。
// パーキングスロットは extensions.conf の [internal] が include する
// [parkedcalls] に属するため、internal context で <slot> にダイヤルすれば取り出せる。

import { originate } from './originate';

const EXT_RE = /^[0-9]{2,6}$/;
const SLOT_RE = /^[0-9]{3}$/; // 701-720

export class InvalidParkingError extends Error {}

/**
 * 駐車スロット <slot> の通話を内線 <toExtension> の端末に取り出す。
 * originate() で toExtension をまず呼び、応答後に internal,<slot>,1 へ接続する。
 */
export async function retrieveParkedCall(slot: string, toExtension: string): Promise<{ ok: boolean }> {
  if (!SLOT_RE.test(slot)) throw new InvalidParkingError('駐車スロットは 3 桁の数字 (701-720)');
  if (!EXT_RE.test(toExtension)) throw new InvalidParkingError('取り出し先は内線番号 (2〜6 桁)');
  const r = await originate({ from: toExtension, to: slot, callerId: `Park <${slot}>` });
  return { ok: r.ok };
}
