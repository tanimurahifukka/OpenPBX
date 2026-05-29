FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

# Ubuntu 22.04 main universe には asterisk (18.x) が含まれる。
# bookworm-slim は arm64 で asterisk が取得できなかったので Ubuntu に切替。
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      asterisk \
      asterisk-core-sounds-en \
      asterisk-moh-opsound-wav \
      ca-certificates \
      curl \
      tzdata \
 && rm -rf /var/lib/apt/lists/*

# 録音ディレクトリ
RUN mkdir -p /var/spool/asterisk/monitor \
 && chown -R asterisk:asterisk /var/spool/asterisk

# foreground 実行。冗長ログを CLI に出す。
CMD ["asterisk", "-f", "-vvv", "-T", "-W", "-U", "asterisk"]
