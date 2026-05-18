// PBX 設定 UI で使う共通型。AI / チケット系は外部リポに退避済み。

export interface ExtensionDTO {
  number: string;
  displayName: string | null;
  secret: string;
  note: string | null;
  updatedAt: string;
}
