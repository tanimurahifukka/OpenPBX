#!/bin/bash
# Asterisk dialplan の System() から呼ばれて、PBX → 外部統合層 (AI など) への
# 受け渡し inbox に wav + meta.json を投下する。
# 旧バージョンは HTTP POST だったが、PBX を入力チャネルの 1 つに位置づける設計に変更。
set -euo pipefail

KIND="${1:-}"
EXTNUM="${2:-}"
CALLER_ID="${3:-}"
CALLER_NAME="${4:-}"
UNIQUE_ID="${5:-}"
RECORDING="${6:-}"        # e.g. /var/spool/asterisk/monitor/<uniqueid>-9001-1001.wav

INBOX_DIR="${INBOX_DIR:-/inbox}"
mkdir -p "${INBOX_DIR}" 2>/dev/null || true

if [ -z "${RECORDING}" ] || [ ! -f "${RECORDING}" ]; then
  # 録音が無くてもイベント自体は記録する (例: 0キーでオペ転送)。
  RECORDING=""
fi

# wav のコピー (asterisk container 内なので速い、容量も MVP 用途では問題なし)。
WAV_BASE=""
if [ -n "${RECORDING}" ]; then
  WAV_BASE="$(basename "${RECORDING}")"
  cp "${RECORDING}" "${INBOX_DIR}/${WAV_BASE}.tmp"
  mv "${INBOX_DIR}/${WAV_BASE}.tmp" "${INBOX_DIR}/${WAV_BASE}"
fi

# JSON 値のエスケープ ("\\" と "\"" を最低限。電話番号や日本名で出現しうる)
esc() {
  local s="${1:-}"
  s="${s//\\/\\\\}"
  s="${s//\"/\\\"}"
  printf '"%s"' "${s}"
}

# meta JSON 名 = wav と同じ basename + .meta.json。wav が無いときは uniqueId.meta.json。
if [ -n "${WAV_BASE}" ]; then
  META_NAME="${WAV_BASE%.wav}.meta.json"
else
  META_NAME="${UNIQUE_ID:-event-$(date +%s)}.meta.json"
fi
META_PATH="${INBOX_DIR}/${META_NAME}"
TMP_PATH="${META_PATH}.tmp"

RECEIVED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# wav のフィールドは absolute path ではなく basename だけ渡す。
# 受け側は INBOX_DIR/<basename> を自分で組み立てる。
{
  printf '{'
  printf '"schema":"command-room-pbx/v1",'
  printf '"source":"asterisk",'
  printf '"kind":%s,'        "$(esc "${KIND}")"
  printf '"extension":%s,'   "$(esc "${EXTNUM}")"
  printf '"callerId":%s,'    "$(esc "${CALLER_ID}")"
  printf '"callerName":%s,'  "$(esc "${CALLER_NAME}")"
  printf '"uniqueId":%s,'    "$(esc "${UNIQUE_ID}")"
  printf '"recordingFile":%s,' "$(esc "${WAV_BASE}")"
  printf '"receivedAt":%s'   "$(esc "${RECEIVED_AT}")"
  printf '}'
} > "${TMP_PATH}"

# atomic rename。watcher は meta.json の create を見て処理を開始する想定。
mv "${TMP_PATH}" "${META_PATH}"
