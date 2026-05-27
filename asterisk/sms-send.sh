#!/bin/bash
# sms-send.sh — IVR から呼ばれる SMS 送信スクリプト
# Usage: sms-send.sh <phone_number> <template_slug>
#
# Asterisk dialplan から System() 経由で呼ばれる。
# SMS Host Agent の /sms/compose を呼び出して Android 端末に SMS 作成画面を開く。

PHONE="$1"
TEMPLATE="$2"

SMS_HOST="${SMS_HOST_AGENT_URL:-http://host.docker.internal:7890}"
SMS_TOKEN="${SMS_HOST_AGENT_TOKEN:-}"

if [ -z "$PHONE" ] || [ -z "$TEMPLATE" ]; then
  echo "$(date -Iseconds) sms-send: missing args phone=$PHONE template=$TEMPLATE" >> /var/log/asterisk/sms-send.log
  exit 1
fi

# 携帯番号判定 (070/080/090)
if ! echo "$PHONE" | grep -qE '^0[789]0[0-9]{8}$'; then
  echo "$(date -Iseconds) sms-send: not mobile, skipping phone=$PHONE" >> /var/log/asterisk/sms-send.log
  exit 0
fi

# テンプレートからメッセージ本文を決定
case "$TEMPLATE" in
  same-day-booking)
    BODY="当日予約はこちら: https://example.com/reserve"
    ;;
  callback-confirm)
    BODY="折返しのご連絡をお待ちしております"
    ;;
  *)
    BODY="ご連絡ありがとうございます"
    ;;
esac

HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  --connect-timeout 3 \
  --max-time 5 \
  -X POST "${SMS_HOST}/sms/compose" \
  -H "Authorization: Bearer ${SMS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{\"to\":\"${PHONE}\",\"body\":\"${BODY}\"}")

echo "$(date -Iseconds) sms-send: phone=$PHONE template=$TEMPLATE http=$HTTP_CODE" >> /var/log/asterisk/sms-send.log
