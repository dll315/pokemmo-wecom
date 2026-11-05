# PokeMMO 中文报点助手

以 **docker run 部署＋独立镜像更新命令** 为主。无需 Git、源码目录或在服务器构建镜像；不使用 Compose。源码公开，Linux amd64 已验证。

## v1.5.0：独立栏目与统一报点格式

- 顶部导航改为当前报点、头目、明雷、报点记录、头目资料、使用说明六个栏目；支持重复点击、浏览器返回和栏目直达链接。手机端六个栏目全部可见。
- 当前报点将头目和明雷分栏；头目/明雷栏目及记录页支持搜索、地区筛选和时间范围筛选。历史记录保留已结束和时间待确认记录，未知类型通知不会混入头目/明雷。
- 页面与企业微信第一行统一为“地区＋头目/明雷＋精灵名称”，例如“丰缘 头目 可多拉”。之后提供开始时间、结束时间、时间依据、位置、招式、特性、通行技能与位置图。
- 开始时间优先用源站明确字段；只有源站报点时间时注明实际刷新可能更早。结束时间使用明确字段，或同精灵/地区/地点报点链接的预计结束时间。支持ISO时区、Unix秒/毫秒、Discord时间标记；无时区文本保留原值并标注，不用接收时间或固定时长推算起止。
- 没有起止字段时明确显示“源站未提供”。结束早于开始会警示，过期/撤回记录不会列为当前报点。时间范围内也不代表已核实游戏内仍在场。
- 旧回调记录升级时从原始消息补齐标题和时间，保留原接收时间；未发送任务同步新格式，不重复入队。机器人配置、数据卷、接收地址及默认密码123456保留。

## 首次部署：docker run

先安装并启动 Docker。下载已发布镜像后直接运行，不设置密码，后台默认 **123456**：

```sh
(
set -e
curl -fL --retry 3 https://github.com/dll315/pokemmo-wecom/releases/latest/download/pokemmo-wecom-linux-amd64.tar.gz -o pokemmo-image.tar.gz
docker load -i pokemmo-image.tar.gz
docker run -d --name pokemmo-wecom --restart unless-stopped \
  -p 8787:8787 -v pokemmo_data:/data \
  --log-opt max-size=10m --log-opt max-file=3 pokemmo-wecom:latest
)
```

访问 `http://服务器IP:8787`；后台为 `/admin`，默认密码123456。放行8787端口。已有同名容器时不要重复部署，直接使用下面的更新命令。

## 后续更新：下载镜像，不拉源码

在服务器任意目录执行：

```sh
curl -fL --retry 3 https://github.com/dll315/pokemmo-wecom/releases/latest/download/update.sh -o pokemmo-update.sh && sh pokemmo-update.sh
```

需要 Docker、curl、sha256sum、flock（通常由util-linux提供）；不需要 Git、Node、npm 或 Dockerfile，也不要求填写密码。

更新流程：确定最新已发布版本 → 下载镜像和更新程序 → SHA256校验 → docker load → 隔离预检查 → docker run替换容器 → 健康检查。下载、校验或预检查失败时旧服务保持运行；替换后启动失败会尝试恢复旧容器。

自动保留旧容器的单个8787端口映射、/data数据卷或目录挂载、PUBLIC_ORIGIN，以及机器人配置、接收地址和历史记录。默认密码123456。不要删除数据卷。无需重新配置官网回调。

更新会有短暂重启；回滚恢复旧容器，不回滚数据卷。复杂自定义容器或缺少可写/data挂载会在停止旧服务前拒绝自动迁移。发布镜像仅适用于Linux amd64。

若容器使用其他名称：先下载上述脚本，然后执行 `CONTAINER_NAME=你的容器名 sh pokemmo-update.sh`。指定版本可用 `POKEMMO_VERSION=v1.5.0 sh pokemmo-update.sh`。

## 可选：源码维护方式

只有希望自己修改源码时才需要Git。原源码构建命令 `sh deploy.sh` 保留；源码更新构建改为 `sh update-source.sh`，支持 `--local`。普通部署与更新请使用上面的docker run和镜像更新命令。

## 配置官网回调和企业微信

1. 登录 `/admin`，密码123456。
2. 从公网地址访问后台，复制顶部“专用接收地址”。
3. 在 Alphapedia Webhooks 的 Target URL 填写该地址，语言选简体中文，范围选 Both，保存后 Test。无需 n8n，也不轮询返回403的历史/ntfy接口。
4. 后台添加企业微信机器人地址，发送测试消息，确认后开启全局自动推送。收到回调只代表已接收和入队，企业微信结果看发送记录。

升级保留原数据卷时，无需重新设置官网接收地址或机器人。未知回调格式保留原文和原始JSON供检查，不伪造缺失的时间或当前在场状态。

## 中文资料和位置图

- 头目消息：中文名称、地区、具体地点、特性、准确地点的招式、通行技能/HM、前往条件、捕捉备注。这里的HM是源站提供的通行技能，不猜测技能机编号。
- 本地资料包含310个头目地点组合；38张原始位置图对应45个组合。图片随源码/镜像提供，推送中的地图链接可访问本站图片；源站没有图片的地点明确标注。
- 首页回调记录可打开“招式、通行技能与位置图”；原图保留原作者路线箭头和标注。来源、日期及校验见 [data/SOURCES.md](data/SOURCES.md)。
- 社区报点可能延迟或更正。程序不会自动核实游戏内状态，也不会从接收时间推算仍可捕捉。缺少匹配资料时明确提示。

## 常用命令

```sh
docker logs --tail 100 pokemmo-wecom
docker restart pokemmo-wecom
docker exec pokemmo-wecom node -p "require('/app/package.json').version"
```

需要其他端口时，将docker run中的 `-p 8787:8787` 改为 `-p 8888:8787`；需要其他数据卷时修改 `-v` 左侧名称。更新命令会从原容器读取并保留这些配置。

使用HTTPS反向代理时，可在docker run中额外传入 `-e PUBLIC_ORIGIN=https://你的域名`，并让代理保留实际Host。后续更新会保留该配置；密码参数仍无需设置。

## 验证与限制

应用测试：`npm test`。Linux容器测试：`node scripts/smoke-container.mjs pokemmo-wecom:latest`。部署/更新/失败回滚测试：`node scripts/test-deployment.mjs`；独立镜像更新与校验失败测试：`node scripts/test-release-update.mjs`（仅用于可丢弃的Linux测试环境，会创建及清理带测试前缀的Docker资源）。

镜像发布前必须通过应用测试、实际容器验证、部署/更新/回滚测试。详细记录见 [docs/verification.md](docs/verification.md)。服务器部署仍需能从公网接收官网请求并能连接企业微信；真实官网回调格式及真实群送达需部署后测试。

管理页面需要登录；专用接收地址只在登录后台显示，不要公开分享。机器人地址保存在服务器数据卷，不提交GitHub。源码MIT授权，第三方资料和位置图保留原权利，详见LICENSE。
