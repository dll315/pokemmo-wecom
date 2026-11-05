#!/bin/sh
set -eu
# Standalone updater: no Git, Node, source checkout or server-side Docker build required.
for tool in docker curl sha256sum flock mktemp; do
  command -v "$tool" >/dev/null 2>&1 || { printf '缺少命令：%s\n' "$tool" >&2; exit 1; }
done
case "$(uname -m)" in x86_64|amd64) ;; *) printf '%s\n' '发布镜像仅支持Linux amd64，请勿在其他架构使用此更新命令。'; exit 1;; esac
docker info >/dev/null 2>&1 || { printf '%s\n' 'Docker未启动或无权限。'; exit 1; }
name=${CONTAINER_NAME:-pokemmo-wecom}
docker inspect "$name" >/dev/null 2>&1 || { printf '%s\n' '未找到现有容器，请先按README的docker run命令部署。'; exit 1; }
repo=https://github.com/dll315/pokemmo-wecom
base=${POKEMMO_RELEASE_BASE_URL:-}
if [ -z "$base" ]; then
  tag=${POKEMMO_VERSION:-}
  if [ -z "$tag" ]; then
    redirect=$(curl -fsS --connect-timeout 10 --max-time 30 -o /dev/null -w '%{redirect_url}' "$repo/releases/latest")
    case "$redirect" in "$repo/releases/tag/"*) tag=${redirect##*/};; *) printf '%s\n' '未能解析最新Release版本，旧服务未停止。'; exit 1;; esac
  fi
  case "$tag" in ''|*[!a-zA-Z0-9._-]*) printf '%s\n' 'Release版本号无效。'; exit 1;; esac
  base="$repo/releases/download/$tag"
fi
umask 077
tmp=$(mktemp -d "${TMPDIR:-/tmp}/pokemmo-update.XXXXXX")
cleanup(){ result=$?; trap - 0; rm -f "$tmp/SHA256SUMS" "$tmp/selected.sha" "$tmp/pokemmo-wecom-linux-amd64.tar.gz" "$tmp/manage-docker.sh"; rmdir "$tmp" 2>/dev/null || :; exit "$result"; }
trap cleanup 0
trap 'exit 130' INT
trap 'exit 143' TERM
printf '%s\n' '正在下载已发布镜像和更新程序，旧服务保持运行……'
for asset in SHA256SUMS pokemmo-wecom-linux-amd64.tar.gz manage-docker.sh; do
  curl -fLsS --retry 3 --connect-timeout 10 --max-time 600 "$base/$asset" -o "$tmp/$asset"
done
cd "$tmp"
{ grep -E '^[a-fA-F0-9]{64}  pokemmo-wecom-linux-amd64\.tar\.gz$' SHA256SUMS > selected.sha && grep -E '^[a-fA-F0-9]{64}  manage-docker\.sh$' SHA256SUMS >> selected.sha; } || { printf '%s\n' '发布校验清单不完整，旧服务未停止。'; exit 1; }
[ "$(wc -l < selected.sha | tr -d ' ')" -eq 2 ] || { printf '%s\n' '发布校验清单不完整，旧服务未停止。'; exit 1; }
sha256sum -c selected.sha || { printf '%s\n' '下载校验失败，旧服务未停止。'; exit 1; }
docker load -i pokemmo-wecom-linux-amd64.tar.gz
POKEMMO_IMAGE=$(docker image inspect --format '{{.Id}}' pokemmo-wecom:latest)
export POKEMMO_IMAGE
sh "$tmp/manage-docker.sh" update "$tmp"
