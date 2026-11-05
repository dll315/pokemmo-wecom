#!/bin/sh
set -eu
mode=${1:-}
root=${2:-}
case "$mode" in deploy|update) ;; *) printf '%s\n' '请运行 sh deploy.sh 或 sh update.sh'; exit 1;; esac
[ -n "$root" ] && [ -d "$root" ] || { printf '%s\n' '项目目录无效。'; exit 1; }
cd "$root"
command -v docker >/dev/null 2>&1 || { printf '%s\n' '请先安装 Docker Engine，并确保当前用户可运行 docker。'; exit 1; }
command -v flock >/dev/null 2>&1 || { printf '%s\n' '缺少 flock，请安装 util-linux 后重试。'; exit 1; }
docker info >/dev/null 2>&1 || { printf '%s\n' 'Docker 未启动或当前用户无 Docker 权限。'; exit 1; }
name=${CONTAINER_NAME:-pokemmo-wecom}
case "$name" in ''|-*|*[!a-zA-Z0-9_.-]*) printf '%s\n' 'CONTAINER_NAME 无效'; exit 1;; esac
lock_root=${XDG_CACHE_HOME:-${HOME:-/tmp}/.cache}/pokemmo-wecom/locks
mkdir -p "$lock_root"
exec 9>"$lock_root/$name.lock"
flock -n 9 || { printf '%s\n' '此容器已有部署或更新任务运行。'; exit 1; }
backup="$name-backup-$(date +%s)-$$"
probe="$name-preflight-$$"
old_stopped=0
old_renamed=0
committed=0
exists=0
production_started=0
cleanup() {
  result=$?
  trap - 0 INT TERM
  if [ "$result" -ne 0 ] && [ "$committed" -eq 0 ] && [ "$old_stopped" -eq 1 ]; then
    printf '%s\n' '新版启动失败，正在恢复旧容器……' >&2
    if [ "$old_renamed" -eq 1 ]; then
      docker rm -f "$name" >/dev/null 2>&1 || :
      docker rename "$backup" "$name" || { printf '旧容器保留在 %s，请手动恢复。\n' "$backup" >&2; exit "$result"; }
    fi
    docker start "$name" >/dev/null || printf '%s\n' '旧容器自动启动失败，请检查 docker logs。' >&2
  fi
  if [ "$result" -ne 0 ] && [ "$exists" -eq 0 ] && [ "$production_started" -eq 1 ]; then docker rm -f "$name" >/dev/null 2>&1 || :; fi
  docker rm -f "$probe" >/dev/null 2>&1 || :
  exit "$result"
}
trap cleanup 0
trap 'exit 130' INT
trap 'exit 143' TERM
exists=0
docker container inspect "$name" >/dev/null 2>&1 && exists=1
if [ "$mode" = deploy ] && [ "$exists" -eq 1 ]; then printf '%s\n' '容器已存在；请运行 sh update.sh，部署命令不会覆盖已有服务。'; exit 1; fi
if [ "$mode" = update ] && [ "$exists" -eq 0 ]; then printf '%s\n' '未找到现有容器；首次安装请运行 sh deploy.sh。'; exit 1; fi
port=${PORT:-8787}
bind_ip=${BIND_IP:-0.0.0.0}
origin=${PUBLIC_ORIGIN:-}
mount_type=volume
mount_source=${DATA_VOLUME:-pokemmo_data}
if [ "$mode" = update ]; then
  binding=$(docker inspect --format '{{range (index .HostConfig.PortBindings "8787/tcp")}}{{.HostIp}}|{{.HostPort}}{{println}}{{end}}' "$name")
  lines=$(printf '%s\n' "$binding" | wc -l | tr -d ' ')
  [ "$lines" -eq 1 ] && [ -n "$binding" ] || { printf '%s\n' '只自动更新单个8787端口映射的容器；当前配置需要手动检查。'; exit 1; }
  IFS='|' read -r bind_ip port <<EOF
$binding
EOF
  mount=$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Type}}|{{.Name}}|{{.Source}}|{{.RW}}{{end}}{{end}}' "$name")
  IFS='|' read -r mount_type mount_name mount_source mount_rw <<EOF
$mount
EOF
  [ "$mount_rw" = true ] || { printf '%s\n' '旧容器缺少可写的/data挂载，已停止更新以避免配置丢失。'; exit 1; }
  case "$mount_type" in volume) mount_source=$mount_name;; bind) ;; *) printf '%s\n' '不支持自动迁移当前/data挂载类型。'; exit 1;; esac
  origin=$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$name" | sed -n 's/^PUBLIC_ORIGIN=//p')
fi
case "$port" in ''|*[!0-9]*) printf '%s\n' '端口无效'; exit 1;; esac
[ "$port" -ge 1 ] && [ "$port" -le 65535 ] || { printf '%s\n' '端口须为1到65535。'; exit 1; }
case "$mount_source" in ''|*,*) printf '%s\n' '数据挂载路径为空或包含不支持的逗号。'; exit 1;; esac
case "$bind_ip" in *:*) binding="[$bind_ip]:$port:8787";; '') binding="$port:8787";; *) binding="$bind_ip:$port:8787";; esac
image=${POKEMMO_IMAGE:-}
if [ -z "$image" ]; then
  [ -f Dockerfile ] || { printf '%s\n' '源码构建需要Dockerfile；镜像更新请使用新版update.sh。'; exit 1; }
  image="pokemmo-wecom:build-$(date +%s)-$$"
  printf '%s\n' '正在构建源码和运行应用测试，旧服务保持运行……'
  docker build -t "$image" .
else
  docker image inspect "$image" >/dev/null || { printf '%s\n' '指定镜像不存在，旧服务未停止。'; exit 1; }
fi
ready() {
  attempts=0
  while [ "$attempts" -lt 25 ]; do
    if docker exec "$1" node -e 'fetch("http://127.0.0.1:8787/healthz",{signal:AbortSignal.timeout(1500)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))' >/dev/null 2>&1; then return 0; fi
    [ "$(docker inspect --format '{{.State.Running}}' "$1" 2>/dev/null || :)" = true ] || break
    attempts=$((attempts+1))
    sleep 1
  done
  docker logs --tail 30 "$1" >&2 || :
  return 1
}
printf '%s\n' '正在使用隔离的临时数据预检查新版……'
docker run -d --name "$probe" --network none --tmpfs /data:rw,mode=1777 "$image" >/dev/null
ready "$probe" || { printf '%s\n' '新版预检查失败，旧服务未停止。'; exit 1; }
docker exec "$probe" node -e 'fetch("http://127.0.0.1:8787/api/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({password:"123456"})}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))' || { printf '%s\n' '默认密码预检查失败，旧服务未停止。'; exit 1; }
docker rm -f "$probe" >/dev/null
if [ "$exists" -eq 1 ]; then
  docker stop --time 30 "$name" >/dev/null
  old_stopped=1
  docker rename "$name" "$backup"
  old_renamed=1
fi
set -- docker run -d --name "$name" --restart unless-stopped -p "$binding" --mount "type=$mount_type,src=$mount_source,dst=/data" --log-opt max-size=10m --log-opt max-file=3
if [ -n "$origin" ]; then set -- "$@" -e "PUBLIC_ORIGIN=$origin"; fi
# ADMIN_PASSWORD is intentionally omitted: the application default is 123456.
production_started=1
"$@" "$image" >/dev/null
ready "$name" || { printf '%s\n' '新容器未能正常启动。' >&2; exit 1; }
committed=1
if [ "$old_renamed" -eq 1 ]; then docker rm "$backup" >/dev/null || printf '旧备份容器 %s 可稍后手动删除。\n' "$backup"; fi
docker tag "$image" pokemmo-wecom:latest
version=$(docker exec "$name" node -p 'require("/app/package.json").version')
printf '完成：v%s。首页 http://服务器IP:%s；后台 /admin；默认密码123456。\n' "$version" "$port"
printf '%s\n' '原数据卷与机器人配置保留；后续更新运行 sh update.sh。'
