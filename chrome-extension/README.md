# Command Room Click-to-call Chrome Extension

## インストール

1. Chrome で `chrome://extensions` を開く
2. 右上「デベロッパーモード」を ON
3. 「パッケージ化されていない拡張機能を読み込む」で本フォルダ (`chrome-extension/`) を選択
4. ツールバーの拡張アイコンを右クリック → オプションを開き、PBX ベース URL (例 `http://localhost:3000`) と自分の内線番号を設定

## 使い方

- 任意ページの `<a href="tel:...">` リンクをクリック → 自動で内線→相手に発信
- 平文の電話番号は自動で点線下線が付いて click 対応
- 番号を選択 → 右クリック → 「Command Room で発信」でも可

## 認証

PBX 側に Cookie ベースのログイン (`/login`) を済ませた Chrome から拡張機能を使う前提です。
`/api/originate` は `requireAccount()` でガードされているため、未ログインだと 401。
