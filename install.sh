#!/bin/sh
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
if ! command -v docker >/dev/null 2>&1; then
  printf '%s\n' '未找到 Docker。请先安装 Docker Engine 与 Compose，或在 NAS 容器管理中导入 compose.yaml。'
  exit 1
fi
docker compose version >/dev/null
if [ ! -f .env ]; then
  umask 077
  printf 'ADMIN_PASSWORD=123456\nBIND_IP=127.0.0.1\nPORT=8787\nPUBLIC_ORIGIN=\n' > .env
  printf '%s\n' '已生成 .env。首页无需登录；初始后台密码：123456。'
  printf '%s\n' 'NAS 内网访问：把 .env 中 BIND_IP 改为 NAS 的局域网 IP 后再启动。'
fi
docker compose up -d --build
printf '%s\n' '服务已启动。首页 http://127.0.0.1:8787；后台 http://127.0.0.1:8787/admin。' '后台初始密码123456。登录后保存机器人地址，发送测试消息，再开启推送。'
