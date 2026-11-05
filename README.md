# PokeMMO 中文报点助手

Linux 独立网站：接收 Alphapedia 的头目、明雷回调，整理中文资料，再推送到企业微信群。源码公开，无需 GitHub 密钥。

## 首次部署

服务器需安装 Git、Docker Engine 和 flock（一般由 util-linux 提供），当前用户需有 Docker 权限。部署过程不询问或设置密码，后台默认密码固定使用程序默认值 **123456**。

```sh
git clone https://github.com/dll315/pokemmo-wecom.git ~/pokemmo-wecom
cd ~/pokemmo-wecom
sh deploy.sh
```

完成后访问 `http://服务器IP:8787`；后台为 `/admin`。放行服务器8787端口。首次部署构建源码并运行应用测试，确认隔离容器可启动和默认密码有效后，才启动正式服务。无需安装 Node 或 npm 到服务器。

默认容器名 `pokemmo-wecom`、命名卷 `pokemmo_data`、端口8787。若同名容器已存在，部署命令会停止并提示改用更新命令，不覆盖已有服务。

## 后续更新（一条命令）

```sh
cd ~/pokemmo-wecom && sh update.sh
```

该命令执行：检查源码是否有未提交修改 → git pull --ff-only → 构建新版并运行测试 → 隔离数据预检查 → 替换容器 → 检查健康状态。构建或预检查失败时旧服务继续运行；替换后启动失败时尝试自动恢复原容器。

更新会读取并保留旧容器的单个8787端口映射、`/data` 数据卷或目录挂载及 PUBLIC_ORIGIN。默认后台密码123456，无需密码参数。机器人配置、接收路径、记录保存在原数据卷中。不要删除数据卷。

首次使用更新脚本时，旧容器可以是之前通过 docker run 创建的版本。如果服务器还没有源码目录：

```sh
git clone https://github.com/dll315/pokemmo-wecom.git ~/pokemmo-wecom
cd ~/pokemmo-wecom
sh update.sh
```

若已有源码目录，直接进入它执行更新，不要重复克隆。源码有未提交修改时脚本会停止，不会强制覆盖。`sh update.sh --local` 只重建当前源码，不执行 git pull，适合已经手动同步源码的情况。

更新期间会有短暂重启。自动回滚指恢复旧容器和镜像，数据卷不会删除或回滚；跨版本数据格式不兼容时仍需使用自己的数据备份。自动脚本仅支持一个8787端口映射及可写的/data卷或目录；复杂自定义容器会在停止旧服务前拒绝自动迁移。

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

初次部署可选择其他端口，例如 `PORT=8888 sh deploy.sh`；选择其他数据卷可使用 `DATA_VOLUME=其他卷名 sh deploy.sh`。更新时从旧容器读取这些配置，无需重复填写。使用其他容器名时，两条命令均指定同一个 CONTAINER_NAME。

使用HTTPS反向代理时，首次部署可设置 `PUBLIC_ORIGIN=https://你的域名 sh deploy.sh`，并让代理保留实际Host。后续更新会保留该配置。

## 仅使用 docker run

仍可公开下载 [Release](https://github.com/dll315/pokemmo-wecom/releases/latest) 的 amd64 镜像包，docker load 后运行；部署无需填写密码：

```sh
curl -fL --retry 3 https://github.com/dll315/pokemmo-wecom/releases/latest/download/pokemmo-wecom-linux-amd64.tar.gz -o pokemmo-image.tar.gz
docker load -i pokemmo-image.tar.gz
docker run -d --name pokemmo-wecom --restart unless-stopped \
  -p 8787:8787 -v pokemmo_data:/data \
  --log-opt max-size=10m --log-opt max-file=3 pokemmo-wecom:latest
```

源码构建可按宿主机架构使用Node官方基础镜像；当前实际CI验证为Linux amd64，不能据此宣称所有ARM设备均已验证。镜像包仅amd64。

## 验证与限制

应用测试：`npm test`。Linux容器测试：`node scripts/smoke-container.mjs pokemmo-wecom:latest`。部署/更新/失败回滚测试：`node scripts/test-deployment.mjs`（仅用于可丢弃的Linux测试环境，会创建及清理带测试前缀的Docker资源）。

镜像发布前必须通过应用测试、实际容器验证、部署/更新/回滚测试。详细记录见 [docs/verification.md](docs/verification.md)。服务器部署仍需能从公网接收官网请求并能连接企业微信；真实官网回调格式及真实群送达需部署后测试。

管理页面需要登录；专用接收地址只在登录后台显示，不要公开分享。机器人地址保存在服务器数据卷，不提交GitHub。源码MIT授权，第三方资料和位置图保留原权利，详见LICENSE。
