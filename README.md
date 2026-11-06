# PokeMMO 中文报点助手

v1.6.3修正：开始时间对所有接收记录无条件使用接收时刻；仅类型明确时计算头目75/群集15分钟。支持中文群怪、嵌套事件和消息正文。类型未识别留在后台不转发；官网首页不再作为伪报点来源链接。

以 **docker run 部署＋独立镜像更新命令** 为主。无需 Git、源码目录或在服务器构建镜像；不使用 Compose。源码公开，Linux amd64 已验证。

本版修正中文“群集”识别，精简推送尾注，群集支持来源位置说明及明确给出的捕获概率（本次源站403，未确认存在概率数据）。

## v1.6.3：固定计时、订阅管理与QQ推送

- 开始时间统一为本站收到推送的时刻；头目持续75分钟，群集持续15分钟，明确显示北京时间的开始、结束与剩余分钟。
- 重复回调不会重置计时；重启与升级按原接收时间计算，不给旧报点续时。当前栏目隐藏到期、撤回或提前结束记录，记录栏目保留查阅。
- 后台新增独立导航、计时规则卡片、接收记录预览，以及最多20个订阅地址的新增、命名、复制、类型筛选、启停、换地址和删除。换地址/删除立即停用旧地址，需要同步修改Alphapedia。
- 推送支持企业微信与QQ（第三方Qmsg酱）；分别配置个人QQ或已绑定QQ群，按服务回执确认成功，可查询待确认回执而不重复发送。
- 页面和消息第一行为“地区＋头目/群集＋中文精灵名称”，其后提供时间、位置、特性、招式、通行技能/HM和地图。资料按精灵、地区、地点精确匹配，未提供的内容不猜填。
- 升级保留原数据卷、接收地址、机器人配置、端口与默认后台密码123456；依旧以docker run部署和单独更新命令为主。

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

若容器使用其他名称：先下载上述脚本，然后执行 `CONTAINER_NAME=你的容器名 sh pokemmo-update.sh`。指定版本可用 `POKEMMO_VERSION=v1.6.3 sh pokemmo-update.sh`。

## 可选：源码维护方式

只有希望自己修改源码时才需要Git。原源码构建命令 `sh deploy.sh` 保留；源码更新构建改为 `sh update-source.sh`，支持 `--local`。普通部署与更新请使用上面的docker run和镜像更新命令。

## 配置官网回调和企业微信

1. 登录 `/admin`，密码123456。
2. 从公网地址访问后台，复制顶部“专用接收地址”。
3. 在 Alphapedia Webhooks 的 Target URL 填写该地址，语言选简体中文，范围选 Both，保存后 Test。无需 n8n，也不轮询返回403的历史/ntfy接口。
4. 后台添加企业微信机器人地址，发送测试消息，确认后开启全局自动推送。收到回调只代表已接收和入队，企业微信结果看发送记录。

升级保留原数据卷时，无需重新设置官网接收地址或机器人。未知回调格式保留原文和原始JSON供检查。未知类型不套用固定时长；头目/群集按本站接收时间加75/15分钟显示提醒区间。

## QQ机器人（无需自行部署QQ客户端）

使用第三方 [Qmsg酱](https://qmsg.zendee.cn/)，方式接近企业微信Webhook；无需在Linux安装NapCat或OneBot。

1. 使用QQ登录Qmsg控制台，按提示添加机器人好友并完成绑定。
2. 若发QQ群，先在Qmsg控制台添加群并完成群绑定；留空群号则发绑定的个人QQ。
3. 本站后台“推送渠道”选择“QQ机器人 · Qmsg酱”，填写完整地址 https://qmsg.zendee.cn/v3/send/你的Key（也支持jsend），并填写需要的群号。
4. 保存后点“发送测试”。只有Qmsg成功回执才显示发送成功；已受理但未回执会显示待确认，可在发送记录点“查询QQ回执”。查询不会重发。最后开启全局推送。

Qmsg普通服务禁止网址、IP及连续长数字等内容，本站QQ通道发送文字资料，移除网址/IP与附带的原始报点；地图与来源链接请在网站或企业微信查看。最长1800字符，过长会标注省略。每个Key至少间隔3秒、每日最多500次；本站按同Key多群共用间隔限流，服务额度不足/绑定失败会记为失败或待确认。平台能力与规则可能变化，详见[接口说明](https://qmsg.zendee.cn/docs)。

Qmsg地址含个人推送凭证，仅填写到后台并保存在数据卷，不提交GitHub。公开项目源码不需要你的机器人Key。本次采用模拟接口验证，真实QQ送达需绑定后现场测试。

## 订阅地址管理

“订阅地址”是接收Alphapedia消息的入口，“推送链接”是发往企业微信/QQ的目标，分别管理。升级保留默认入口，新增订阅可以单独命名、选择接收头目/群集或暂停；同消息跨地址重复收到也只入队一次。删除所有订阅后不会自动重新启用旧地址。只有登录后台可看到完整地址，首页不会展示接收凭证。

## 中文资料和位置图

- 头目消息：中文名称、地区、具体地点、特性、准确地点的招式、通行技能/HM、前往条件、捕捉备注。这里的HM是源站提供的通行技能，不猜测技能机编号。
- 本地资料包含310个头目地点组合；38张原始位置图对应45个组合。图片随源码/镜像提供，推送中的地图链接可访问本站图片；源站没有图片的地点明确标注。
- 首页回调记录可打开“招式、通行技能与位置图”；原图保留原作者路线箭头和标注。来源、日期及校验见 [data/SOURCES.md](data/SOURCES.md)。

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
