// Music on Hold (保留音) の単一ソース。
//
// 保留 / 転送中の発信者に無音ではなく音楽を流すため、生成 dialplan で
// チャネルの musicclass をこのクラスに設定する。音源は Docker イメージの
// asterisk-moh-opsound-wav パッケージ (asterisk/Dockerfile + musiconhold.conf)。

export const MOH_CLASS = 'default';

export function mohClass(): string {
  return MOH_CLASS;
}

/**
 * 現在のチャネルに MOH クラスを割り当てる dialplan の Set 行。
 * 保留 / 転送 / Dial(...,m) のリングバックで MOH が再生される。
 */
export function renderMohSetLine(): string {
  return `Set(CHANNEL(musicclass)=${MOH_CLASS})`;
}
