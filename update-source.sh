#!/bin/sh
set -eu
# Parse the function before git pull, so updating this file cannot change the running instructions.
main() {
  root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
  case "${1:-}" in
    '')
      command -v git >/dev/null 2>&1 || { printf '%s\n' '需要 Git 才能更新源码。'; return 1; }
      git -C "$root" diff --quiet && git -C "$root" diff --cached --quiet || { printf '%s\n' '源码存在未提交修改，已停止更新，未覆盖你的文件。'; return 1; }
      git -C "$root" pull --ff-only
      ;;
    --local) ;; # Rebuild the already-downloaded source, useful for offline installs and CI.
    *) printf '%s\n' '用法：sh update.sh [--local]'; return 1 ;;
  esac
  exec sh "$root/scripts/manage-docker.sh" update "$root"
}
main "$@"
