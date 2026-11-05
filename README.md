# PokeMMO 中文报点助手

## v1.4.0：完整头目资料与位置图

- 中文通知包含精灵、地区、具体地点、特性、对应地点的招式、所需秘传/通行技能、前往条件及捕捉备注。这里的“通行技能”来自源站 HMs 字段，不猜测具体技能机编号。
- 从源站重新获取310个地点组合，38张位置原图对应其中45个组合。图片随镜像提供，网站和推送中的“查看位置地图”可直接使用本站图片，不要求部署服务器临时访问外部图床。无图地点明确提示，不使用其他地点的图片。
- 首页回调记录新增“招式、通行技能与位置图”按钮，头目资料详情页可查看原尺寸地图。源图保留原作者的箭头和文字，旁边显示中文地点、条件和技能。
- 修复描述内来源链接无法提取地点、大小写字段和中文名称匹配、域名中的alpha导致明雷类型误判、关闭推送类型后未知通知仍入队的问题。
- 升级保持 `pokemmo_data` 卷，原机器人配置、接收地址和默认密码123456保留。无需重新配置官网回调。

升级命令见下方，将下载版本替换为 `v1.4.0` 即可；也可 `git pull` 后重新 `docker build`，再重建容器。

## v1.3.1：改为官网主动回调（当前默认）

为解决服务器访问 Alphapedia 历史页和 ntfy 的403，当前版本默认不再轮询这些接口。改为 Alphapedia → 本网站 → 企业微信。不使用 n8n，也不需要申请额外 API 密钥。

1. 安装或升级后登录 `/admin`，最上方“官网主动推送入口”会显示专用接收地址。
2. 从公网地址访问后台后复制地址（例如 `http://服务器IP:8787/receive/随机路径`），填入 Alphapedia Webhooks 的 **Target URL**。不要继续使用旧的 n8n 地址。
3. Connector 选择可向自定义 HTTP 地址发送的类型（以官网实际选项为准），Post Language 选简体中文，Notification Scope 选 Both。保存并 Test。
4. 在本站后台检查接收记录，点击“查看中文消息 / 原始数据”。填写企业微信机器人地址，测试成功，再开启全局自动推送。

请求先持久化入队后响应200；收到请求不等于已经发群。发送结果在发送记录中显示。相同 JSON 内容24小时内去重；更新后的内容可作为另一条通知转发。不从报点正文猜测是否仍在场；暂停超过15分钟的待转发通知会跳过，避免恢复后突然发送旧消息。接收记录保留最近24小时，最多500条。

支持结构化字段、Discord embeds、纯文本兜底。匹配精灵、地区、地点后补充中文捕捉资料；缺失字段明确标注。未知结构会保留原始通知供查看，不保证所有真实官网格式已能拆出详细字段。只有真实回调到达后才能确认该格式兼容。不会自动核实源站更正/撤回，除非官网另发消息。

接收地址随机生成并保存在原数据卷中，不能公开分享。无需手动设置密钥；它本身就是可用于提交通知的私密地址。首页只展示已提取的名称和位置，不展示地址或原始正文。保持网站从公网可达并放行8787端口；官网是否允许HTTP地址以其保存和测试结果为准。

旧版“已核实在场”卡片不用于展示新的回调记录，请查看首页顶部“官网推送记录”和后台接收记录。下方旧的轮询说明只适用于1.2.x，当前运行不再抓取网站或查询群怪状态。

### 从1.2.x／1.3.x升级（Linux amd64，保留配置）

```sh
curl -fL --retry 3 https://github.com/dll315/pokemmo-wecom/releases/download/v1.4.0/pokemmo-wecom-linux-amd64.tar.gz -o pokemmo-image-v1.4.0.tar.gz
docker load -i pokemmo-image-v1.4.0.tar.gz
docker stop pokemmo-wecom
docker rm pokemmo-wecom
docker run -d --name pokemmo-wecom --restart unless-stopped \
  -p 8787:8787 -v pokemmo_data:/data \
  --log-opt max-size=10m --log-opt max-file=3 pokemmo-wecom:latest
```

不要删除 `pokemmo_data` 卷。原机器人配置保留。若之前使用自定义端口、卷名或 PUBLIC_ORIGIN，重新运行时保留这些原有参数。启动时不设置 ADMIN_PASSWORD，即使用默认后台密码123456。

## Linux：公开 GitHub 下载，docker run 部署

源码公开：https://github.com/dll315/pokemmo-wecom 。无需 GitHub 密钥，也无需登录镜像仓库。GitHub Actions 先执行测试、构建 Linux 镜像并验证容器启动/持久化，成功后才发布 Release。

### 推荐：源码构建（x86_64 / ARM64）

服务器需已安装 Docker 和 Git：

```sh
git clone https://github.com/dll315/pokemmo-wecom.git
cd pokemmo-wecom
docker build -t pokemmo-wecom:latest .
docker run -d --name pokemmo-wecom --restart unless-stopped \
  -p 8787:8787 -v pokemmo_data:/data \
  --log-opt max-size=10m --log-opt max-file=3 \
  pokemmo-wecom:latest
```

打开 `http://服务器IP:8787`；后台为 `/admin`。放行服务器安全组/防火墙的8787端口。在后台“推送链接”添加企业微信机器人地址，发送测试消息，确认后开启自动推送。检查网站连接状态和最近成功检查时间。默认30秒检查一次；无需点击运行，无需设置官网回调或使用 n8n。

首页公开；后台默认密码为 **123456**，部署命令无需填写或设置密码。机器人地址只保存在服务器的数据卷中，不提交 GitHub。这里无需申请任何额外 API 密钥。

### 已发布镜像（仅 Linux x86_64 / amd64）

在 Release 发布成功后，可以省去源码构建：

```sh
curl -fL --retry 3 https://github.com/dll315/pokemmo-wecom/releases/latest/download/pokemmo-wecom-linux-amd64.tar.gz -o pokemmo-image.tar.gz
docker load -i pokemmo-image.tar.gz
docker run -d --name pokemmo-wecom --restart unless-stopped \
  -p 8787:8787 -v pokemmo_data:/data \
  --log-opt max-size=10m --log-opt max-file=3 \
  pokemmo-wecom:latest
```

两种安装方式择一执行，避免容器名称冲突。GitHub Release 下载不可达时可在电脑下载后上传服务器；Docker构建仍需服务器能获取基础镜像。源站连接情况取决于服务器网络，镜像启动通过不代表源站始终可访问。

### 维护

```sh
docker logs --tail 100 pokemmo-wecom
docker inspect --format '{{.State.Health.Status}}' pokemmo-wecom
docker restart pokemmo-wecom
```

升级时先获取新源码并重新 build（或下载并 load 新镜像），再 `docker stop pokemmo-wecom`、`docker rm pokemmo-wecom`，重新执行相同的 docker run 命令。保留 `pokemmo_data` 卷，推送配置和去重记录会保留。不要删除这个数据卷。

下方 Compose / NAS 是可选的其他部署方式；本次首选上面的 docker run。

持续监控 [Alphapedia](https://alpha.pokemmotools.org/) 的**头目（Alpha）**和**群怪／大量出现（Swarm）**，把中文通知推送到企业微信群机器人。适用于 Linux 服务器和 NAS，提供免登录中文报点首页和独立管理后台。

首页地址为 `/`，浏览报点和头目资料无需密码。后台地址为 `/admin`，初始密码按用户要求设为 **123456**；仅配置机器人、查看发送记录和日志时需要登录。设置 `ADMIN_PASSWORD` 可以更改后台密码。

这里的群怪指限时 Swarm 报点，不是甜甜香气召唤的固定群战。程序不能发现网站尚未报出的事件，也不能预测具体刷新时间。

## 部署到 Linux / NAS

需要 Docker Engine 和 Docker Compose v2。支持官方 Node 24 Alpine 镜像提供的 x86_64、ARM64 平台；老款 ARMv7 NAS 不在本次验证范围内。

1. 把整个项目文件夹上传到服务器，例如 `/opt/pokemmo-wecom`。
2. 在该目录执行：

   ```sh
   sh install.sh
   ```

   首次运行会生成 `.env`，初始后台密码为123456。镜像构建时会先执行自动测试，通过后才生成运行镜像。

3. 打开首页即可浏览报点；点击右上角“管理后台”，输入123456进入后台。

   默认端口只允许服务器本机访问。远程服务器可在自己的电脑执行：

   ```sh
   ssh -N -L 8787:127.0.0.1:8787 用户名@服务器地址
   ```

   然后打开 `http://127.0.0.1:8787`。

   **NAS 局域网访问：**编辑 `.env`，把 `BIND_IP=127.0.0.1` 改为 NAS 的局域网 IP，例如 `BIND_IP=192.168.1.10`，运行 `docker compose up -d`，打开 `http://192.168.1.10:8787`。管理页面始终需要密码。

4. 在企业微信群中添加群机器人／消息推送，复制形如以下的地址，粘贴到管理页面：

   ```text
   https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=你的机器人密钥
   ```

5. 点击“保存设置”，再点击“发送测试消息”。确认群里收到明确标识的测试消息后，开启自动推送并保存。

没有登录 Discord 的要求，无需创建 Alphapedia 发布账户。

### NAS 容器界面导入

如果 NAS 支持 Compose 项目：把项目目录上传到 NAS，复制 `.env.example` 为 `.env`，设置 NAS 局域网 IP，再用容器管理器导入同目录的 `compose.yaml`。初始后台密码为123456，可自行更改。首次构建需要下载 Node 基础镜像，网络应能访问 Docker 镜像仓库。

默认使用 Docker 命名卷 `pokemmo_data` 保存进度与机器人地址。重建容器或升级镜像不会清空数据。**不要执行 `docker compose down -v`，它会删除数据卷。** 若改成 NAS 目录映射，该目录需允许容器 UID 1000 写入。

### HTTPS 反向代理

如使用反向代理，设置 `PUBLIC_ORIGIN=https://你的域名`，域名、协议和端口必须与浏览器地址一致，再重新启动容器。该设置用于来源检查和安全 Cookie。普通局域网 HTTP 访问时留空。

## 推送内容与行为

- 宝可梦、地区、地点尽量使用网站公开简体中文名称；未知名称保留原文，不猜译。
- 显示报点时间、预计消失时间、发送时剩余时间、详情链接，时间均为北京时间。
- 默认每30秒检查网站；可调15至3600秒。网络故障或限流会退避，控制台显示异常。
- 首次启动、恢复联网或开启推送时，只发送仍然有效且剩余时间达到设置门槛的事件。历史过期事件不会补发。
- 群怪发送前再次检查网站权威状态；历史链接中的消失时间不能单独证明群怪仍在场。
- 首页持续核对最近24小时记录，展示最新头目、地区群怪、时间窗、可筛选的报点历史与310个头目地点资料组合。网站更正、撤回或提前结束已推送的报点时，会发送相应更正；过旧或无法核实的状态不追溯推送。
- 地区全部不选表示关注所有地区。头目和群怪可以分别开关。
- 网站接口结构改变、会话失效、未知群怪状态都不会被当成正常报点推送；看控制台错误信息。

当前直接读取网站自身前端使用的公开历史接口。实测 ntfy 补收没有返回缓存，因此初版不将 ntfy 作为唯一消息来源。网站并未保证这些内部接口长期稳定。程序不会绕过登录、验证码或封禁。

## 失败、去重与“待确认”

发送成功同时要求 HTTP 成功和企业微信返回数值 `errcode: 0`，不会把 HTTP 200 的业务错误当成成功。发送任务先写入持久化队列，进度保存在数据卷；同一事件版本成功后不会因正常重启再次发送。

已明确的限流或临时业务错误会延迟重试。其他业务失败保留在“发送记录”，修正配置后可以手动重试。

**超时、连接中断、无效响应、发送过程中崩溃，无法判断对端是否已经收到。** 程序将任务标为“送达待确认”，不会自动重发。先查看群聊，再选择“确认后重试”或“忽略”。企业微信没有提供本程序可用的业务幂等键，因此不能保证网络不确定场景下绝对不重复。

若主状态文件损坏且从备份恢复，程序会暂停自动推送，并把可能回滚的待发送任务改成“待确认”。核对群聊与任务后再重新开启。主文件和备份都损坏时，程序停止，禁止悄悄清空去重进度。

## 常用维护

```sh
docker compose logs --tail=100
docker compose restart
docker compose stop
docker compose up -d --build
```

修改管理密码：编辑 `.env` 中的 `ADMIN_PASSWORD`，运行 `docker compose up -d`。已登录的旧会话随进程重启失效。

机器人地址不在网页中回显，不写到公开日志。地址保存在受保护的数据卷中；备份应与机器人凭据一同保管。默认后台密码为123456，无需额外配置；可选的密码覆盖值放在 `.env` 中。

实例锁防止两个进程共用数据目录。Compose 固定容器 hostname。若把数据迁移到另一台主机且遗留 `instance.lock`，必须先确认旧实例已经停止，再移除数据卷中的该锁文件；不要在运行时删除锁。

此程序按单实例部署。不要让两个独立 NAS 容器共享同一个数据卷；不要为第二个实例绕过固定容器名称和端口限制。普通成功、忽略和跳过记录保留7天，失败与待确认任务保留到用户处理，避免长期运行无限累积普通历史。

健康检查表示程序进程正常运行，不保证源网站或企业微信始终可达；实际连接状态和最近成功时间在控制台查看。主机休眠、关机或断网期间不能即时推送。

## 不使用 Docker

安装 Node.js 22 或更新版本（推荐24）。没有第三方运行依赖，不需要 `npm install`。

```sh
export DATA_DIR='/var/lib/pokemmo-wecom'
export HOST='127.0.0.1'
node src/main.mjs
```

该模式需由 systemd 等进程管理器保持运行。服务用户必须能写入 `DATA_DIR`，同一目录只启动一个实例。

## 检查与测试

```sh
npm test
npm run check:live
```

自动测试在本地模拟网站和机器人，覆盖解析、会话、时间、队列、重启、限流、失败、状态更正、并发与后台鉴权。`check:live` 仅只读访问实际网站，显示中文样本，不会向任何群发送消息。

中文词表来源和日期见 [data/SOURCES.md](data/SOURCES.md)。可在数据目录添加 `translations.json` 覆盖已核实的译名：

```json
{
  "pokemon": { "Jynx": "迷唇姐" },
  "region": { "Unova": "合众" },
  "location": { "Route 8": "8号道路" }
}
```

修改词表后重启服务。

## 验证范围

交付检查结果见 `docs/verification.md`。本地没有 Docker 和用户实际机器人地址时，可以完成程序测试、真实网站读取和页面验证，不能宣称已经在用户 NAS 成功启动或真实群成功收到了通知。部署后请务必运行管理页面中的测试消息。
