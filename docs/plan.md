# 中文头目与群怪推送实施计划

目标：按 docs/design.md 制作可部署到 Linux/NAS 的中文推送程序。

执行方式：本会话直接实施，不创建用户聊天，不修改其他工作目录。

1. 数据规范与中文通知：src/events.mjs、src/i18n.mjs、src/wecom.mjs。先测真实记录、UTC、链接身份、群怪权威状态、消息长度，再实现解析和中文格式化。
2. 持久化与发送：src/store.mjs、src/monitor.mjs。先测重启去重、损坏恢复、发送成功/失败/结果不明、过期处理、状态更正，再实现原子存储、队列及限流。
3. 网站读取：src/source.mjs。以本地 HTTP 服务测试 cookie/token、分页、200 空结构、429、时间窗和非单调 ID。实现按公开页面会话读取历史和群怪状态。
4. 中文管理页与运行入口：src/server.mjs、src/main.mjs、web/。验证登录、非法来源拒绝、Webhook 密钥不返回、保存配置、暂停与手动确认。部署包含 Dockerfile、compose.yaml、.env.example 与中文说明。
5. 交付检查：全部自动测试、真实网站只读检查、前端页面检查、部署文件检查与打包。记录真实环境未完成的验证，明确真实群发送需要在用户配置后执行测试。
