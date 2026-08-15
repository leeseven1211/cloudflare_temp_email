# Cloudflare Temp Email 架构说明

> 更新：2026-08-15（按 docs/engineering-standards/architecture.md 模板补写）

## 1. 概述
临时邮箱系统：Cloudflare Workers 收信 + SMTP 代理发送 + 前端收件箱，部署于 leeseven 体系。

## 2. 技术栈
- Worker：Cloudflare Workers（JS/TS，worker/）
- SMTP 代理：Python（smtp_proxy_server/，IMAP 客户端 + SMTP）
- 前端：frontend/ + pages/
- 邮件解析：mail-parser-wasm（WASM）
- 文档站：vitepress-docs/
- 数据库：db/（PostgreSQL 迁移）

## 3. 模块划分
| 路径 | 职责 |
|---|---|
| worker/ | Cloudflare Worker 收信/API |
| smtp_proxy_server/ | SMTP 代理发送（Python，imap_* 客户端） |
| frontend/ | 前端收件箱 |
| pages/ | Cloudflare Pages 配置 |
| mail-parser-wasm/ | 邮件解析 WASM |
| e2e/ | 端到端测试 |
| db/ | 数据库迁移 |
| scripts/ | 工具脚本 |

## 4. 数据流
外部邮件 → Cloudflare Worker 收信 → 解析（WASM）→ 存储 → 前端展示；用户通过 SMTP 代理发送。

## 5. 部署拓扑
Cloudflare Workers/Pages + SMTP 代理服务（docker-compose，见 smtp_proxy_server/）。

## 6. 已知限制与演进
- Python 部分遵循 .flake8（flake8 配置），如需统一 ruff 可后续迁移；
- CHANGELOG 双语维护（CHANGELOG.md / CHANGELOG_EN.md）。

