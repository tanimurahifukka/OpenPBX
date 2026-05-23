# Asterisk TLS 証明書

WebRTC (wss + DTLS-SRTP) を有効にするには、このディレクトリに以下の2ファイルが必要です:

- `asterisk.pem` (証明書 + チェーン、PEM 形式)
- `asterisk.key` (秘密鍵、PEM 形式)

## ホスト Mac で自己署名証明書を作る (mkcert 推奨)

```bash
brew install mkcert nss
mkcert -install
mkcert -cert-file asterisk/certs/asterisk.pem -key-file asterisk/certs/asterisk.key \
  localhost 127.0.0.1 host.docker.internal $(hostname -s) \
  $(tailscale ip -4 2>/dev/null || true) \
  $(ipconfig getifaddr en0 2>/dev/null || true)
docker compose restart asterisk
```

ブラウザ電話を `http://localhost:3000/softphone` 以外のホスト名 / IP で開く場合、そのホスト名 / IP も
証明書の SAN に含めてください。ブラウザで一度 `https://<host>:8089/` にアクセスして自己署名を
承認しておく必要があります。
