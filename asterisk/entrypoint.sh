#!/bin/bash
# Asterisk を foreground で起動しつつ、/signals/reload が touch されたら
# pjsip reload を発火する小さな watcher を並走させる。
# Web container は Docker socket を持たずに済む。
set -e

SIGNAL_DIR=/signals
SIGNAL_FILE="${SIGNAL_DIR}/reload"

mkdir -p "${SIGNAL_DIR}" 2>/dev/null || true

# AMI secret を env から manager.conf にテンプレートで注入する。
# テンプレートは docker-compose で /etc/asterisk/manager.conf.template に ro mount されている。
# 起動毎に template を読み、__AMI_SECRET__ を AMI_SECRET env で置換した結果を実 manager.conf に書き出す。
if [ -f /etc/asterisk/manager.conf.template ]; then
  if [ -z "${AMI_SECRET:-}" ]; then
    echo "[entrypoint] FATAL: AMI_SECRET env が未設定。manager.conf を生成できません。" >&2
    exit 1
  fi
  sed "s|__AMI_SECRET__|${AMI_SECRET}|g" /etc/asterisk/manager.conf.template > /etc/asterisk/manager.conf
  chmod 600 /etc/asterisk/manager.conf
  chown asterisk:asterisk /etc/asterisk/manager.conf 2>/dev/null || true
fi

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
