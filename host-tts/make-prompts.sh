#!/bin/bash
# VOICEVOX 四国めたん（ノーマル）を VoiceBox 経由で呼び出し、
# IVR 用の標準ガイダンス wav を生成する。
#
# 旧版は macOS の say + Kyoko を使用していたが、VOICEVOX に統一して
# キャラクターのライセンス (要クレジット表記: 「VOICEVOX:四国めたん」) と
# 電話向け 8kHz mono PCM_S16 形式を VoiceBox 側で保証させる。
#
# Env (host-tts/.env または シェル環境に export しておく):
#   VOICEBOX_URL    例) http://localhost:3921
#   VOICEBOX_TOKEN  VoiceBox サーバーの Bearer トークン
#   TTS_SPEAKER_ID  上書きしたい場合のみ指定 (default: 2 = 四国めたん ノーマル)
#
# 生成された wav は asterisk/sounds/custom/ に保存される
# (docker-compose で /var/lib/asterisk/sounds/custom にマウント済み)。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${ROOT}/asterisk/sounds/custom"

VOICEBOX_URL="${VOICEBOX_URL:-http://localhost:3921}"
SPEAKER_ID="${TTS_SPEAKER_ID:-2}"

if [[ -z "${VOICEBOX_TOKEN:-}" ]]; then
  echo "error: VOICEBOX_TOKEN が設定されていません。" >&2
  echo "  例) export VOICEBOX_TOKEN=\$(docker exec voicebox-server printenv VOICEBOX_TOKEN)" >&2
  exit 1
fi

mkdir -p "${OUT_DIR}"

declare -a items=(
  "ivr-welcome|お電話ありがとうございます。クリニックの電話受付です。"
  "ivr-menu|ご用件の番号を押してください。当日のご予約は1、折り返しのご依頼は2、スタッフへお繋ぎする場合は0を押してください。"
  "ivr-record-intro|ピーッという音の後にメッセージをお話しください。録音を終わるときはシャープを押すか、そのままお電話を切ってください。"
  "ivr-callback-intro|ピーッという音の後に、お名前と折り返し希望のお時間をお話しください。"
  "ivr-reservation-intro|当日のご予約を承ります。ピーッという音の後に、お名前、ご希望の時間、診療内容をお話しください。"
  "ivr-thank-you|お電話ありがとうございました。"
  "ivr-transferring|担当者におつなぎします。少々お待ちください。"
  "ivr-invalid|入力が正しくありません。もう一度お試しください。"
  "ivr-goodbye|さようなら。"
  "ivr-after-hours|本日の受付は終了いたしました。診療時間内にあらためてお電話ください。緊急の場合は救急医療機関へご連絡ください。"
)

for entry in "${items[@]}"; do
  name="${entry%%|*}"
  text="${entry#*|}"
  out_path="${OUT_DIR}/${name}.wav"
  echo "[voicevox:${SPEAKER_ID}] -> ${name}.wav : ${text}"

  payload=$(python3 -c "
import json, sys
print(json.dumps({
    'name': sys.argv[1],
    'text': sys.argv[2],
    'speakerId': int(sys.argv[3]),
    'speedScale': 1.0,
}, ensure_ascii=False))
" "${name}" "${text}" "${SPEAKER_ID}")

  http_status=$(curl -s -o "${out_path}.raw" -w "%{http_code}" \
    -X POST "${VOICEBOX_URL}/synthesize-phone-wav" \
    -H "Authorization: Bearer ${VOICEBOX_TOKEN}" \
    -H "Content-Type: application/json" \
    -H "Accept: audio/wav" \
    --data-raw "${payload}")

  if [[ "${http_status}" != "200" ]]; then
    echo "  error: HTTP ${http_status}" >&2
    if [[ -f "${out_path}.raw" ]]; then
      head -c 500 "${out_path}.raw" >&2
      echo "" >&2
      rm -f "${out_path}.raw"
    fi
    exit 1
  fi

  # VoiceBox (内部 ffmpeg lavf) は RIFF/data チャンクサイズを 0xFFFFFFFF (未確定)
  # で出力する。Asterisk の format_wav は確定したサイズと、シンプルな
  # RIFF/fmt/data のみのチャンク構成を要求するため、ffmpeg で再エンコードして
  # クリーンな wav (FLLR/LIST チャンクなし) に書き直す。
  ffmpeg -loglevel error -y -i "${out_path}.raw" \
    -ar 8000 -ac 1 -acodec pcm_s16le -fflags +bitexact -flags +bitexact \
    -map_metadata -1 "${out_path}"
  rm -f "${out_path}.raw"
done

echo ""
echo "--- generated files (credit: VOICEVOX:四国めたん) ---"
ls -lh "${OUT_DIR}"
