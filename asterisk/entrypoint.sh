#!/bin/bash
# Asterisk を foreground で起動しつつ、/signals/reload が touch されたら
# pjsip reload を発火する小さな watcher を並走させる。
# Web container は Docker socket を持たずに済む。
set -e

SIGNAL_DIR=/signals
SIGNAL_FILE="${SIGNAL_DIR}/reload"

mkdir -p "${SIGNAL_DIR}" 2>/dev/null || true

# bash の while+sleep でファイル監視するだけの簡易 watcher。
# Asterisk が起動するまでは reload 失敗しても無視。
(
  while sleep 2; do
    if [ -f "${SIGNAL_FILE}" ]; then
      rm -f "${SIGNAL_FILE}"
      echo "[reload-watcher] $(date) detected signal, reloading pjsip"
      asterisk -rx "pjsip reload" 2>/dev/null || true
      asterisk -rx "dialplan reload" 2>/dev/null || true
    fi
  done
) &

exec asterisk -f -vvv -T -W -U asterisk
