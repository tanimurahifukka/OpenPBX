#!/bin/bash
# macOS の say + afconvert で IVR 用日本語プロンプトを生成する。
# 生成された wav は Asterisk の 8kHz mono PCM_S16 形式に揃え、
# asterisk/sounds/custom/ に置く (docker-compose で /var/lib/asterisk/sounds/custom にマウント)。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${ROOT}/asterisk/sounds/custom"
VOICE="${TTS_VOICE:-Kyoko}"

mkdir -p "${OUT_DIR}"

declare -a items=(
  "ivr-welcome|お電話ありがとうございます。クリニックの電話受付です。"
  "ivr-menu|ご用件の番号を押してください。当日のご予約は1、折り返しのご依頼は2、スタッフへお繋ぎする場合は0を押してください。"
  "ivr-record-intro|ピーッという音の後にメッセージをお話しください。録音を終わるときはシャープを押すか、そのままお電話を切ってください。"
  "ivr-callback-intro|ピーッという音の後に、お名前と折り返し希望のお時間をお話しください。"
  "ivr-thank-you|お電話ありがとうございました。"
  "ivr-transferring|担当者におつなぎします。少々お待ちください。"
  "ivr-invalid|入力が正しくありません。もう一度お試しください。"
  "ivr-goodbye|さようなら。"
)

for entry in "${items[@]}"; do
  name="${entry%%|*}"
  text="${entry#*|}"
  tmp=$(mktemp -t "${name}").aiff
  echo "[tts] ${VOICE} -> ${name}.wav : ${text}"
  say -v "${VOICE}" -o "${tmp}" "${text}"
  afconvert -f WAVE -d LEI16@8000 -c 1 "${tmp}" "${OUT_DIR}/${name}.wav"
  rm -f "${tmp}"
done

echo "--- generated files ---"
ls -lh "${OUT_DIR}"
