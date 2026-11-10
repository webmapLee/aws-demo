# 工作流状态

- 项目：aws-go
- 更新时间：2026-11-09
- 流程位置：第一阶段，Phase 4 规格草案待确认
- 会话状态：PAUSED
- 并发上限：3
- 暂停原因：Phase 4 规格草案已写出，等用户确认后才做执行计划和创建资源

## 完成情况摘要

Phase 1 和 Phase 2 都已验收。Phase 2 用 AWS CLI 部署在 `ap-southeast-2`：ECR `go-api:v1`、私有 RDS `go-api-db`、ECS Fargate 服务 `go-api`（期望数量 1）、公网 ALB。CDK 仍属于 Phase 4。

恢复现场时不要重做 `DONE`。用户修改 Phase 3 范围时回到第一阶段。用户同意开始后，只把依赖已满足的任务改为 `READY` 再进入轮询。用户暂不继续时保持本暂停。

## 阶段规格

| 阶段 | 规格状态 | 范围与验收 |
| --- | --- | --- |
| Phase 1 | 已确认并通过 | 本地 Go CRUD、PostgreSQL、Dockerfile、Compose。验收见需求文档第九节 |
| Phase 2 | 已确认并通过 | AWS CLI 部署 ECR、ECS Fargate、ALB、私有 RDS。2026-11-09 经 ALB 完成用户 CRUD |
| Phase 3 | 已确认并通过 | 一个 CloudFront 入口：页面走 S3，`/users` 与 `/health` 走现有 ALB，`/report` 走 API Gateway 和 Lambda。WAF 只挂 CloudFront，建在 `us-east-1`。2026-11-09 验收通过 |
| Phase 4 | 草案待确认 | 见下方「Phase 4 规格」。确认前不创建 CDK、OIDC 或 CodeBuild |
| Phase 5 | 未确认 | 一个 PR 一个环境，共用 RDS，独立 schema |
| Phase 6 | 未确认 | Lambda Canary、ECS Blue/Green、告警回滚 |

## 检查点

- 正在跑的任务：无
- 运行中的子代理：无
- 最后验证：2026-11-09 在 `https://d1zalq3ci35v3c.cloudfront.net/` 登记 Phase3 Check，改成 Phase3 Updated，再删除。名册回到 1 人。`/health` 为 ok，`/report` 为 `go_health=ok`、`user_count=1`。ALB 直连仍为 ok。
- 续跑入口：用户确认或修正 Phase 4 规格。确认后才写执行计划和依赖，并把任务改为 `READY`。
- 待决策：规格里的四项，尤其是 GitHub 仓库所有者和「CDK 接管现有资源」还是「只建流水线」。

## 任务

| id | title | status | depends | owner | retries | acceptance | evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| P1 | Phase 1 本地 Go 用户服务 | DONE | - | 主控 | 0 | 服务可在本地 Docker 中完成用户 CRUD | `services/go-api/`、`frontend/src/App.tsx`、README |
| P1.1 | Go HTTP CRUD 与 PostgreSQL | DONE | - | 开发 | 0 | 能插入、查询、更新、删除 | `cmd/server`、`internal/handler`、`internal/repository` |
| P1.2 | Dockerfile 与本地 Compose | DONE | P1.1 | 开发 | 0 | 容器可独立运行并连接 Postgres | `Dockerfile`、`docker-compose.yml` |
| P1.3 | Go 测试 | DONE | P1.1 | 测试 | 0 | 路由测试可运行；集成测试在有 `DATABASE_URL` 时运行 | `router_test.go`、`user_integration_test.go` |
| P1.4 | 本地前端用户页 | DONE | P1.1 | 开发 | 0 | 页面可登记、修改、删除用户 | `frontend/src/App.tsx`、`api.ts` |
| P2 | Phase 2 部署到 ECS Fargate | DONE | P1 | 主控 | 0 | 经 ALB 访问 Go API，并连接私有 RDS | ALB `go-api-1526541297.ap-southeast-2.elb.amazonaws.com` |
| P2.1 | ECR 仓库与镜像推送 | DONE | P2 | 开发 | 0 | 镜像进入 ECR，且不重复创建仓库 | `go-api:v1`，digest `sha256:94e14da52dbb84dc` |
| P2.2 | 私有 RDS PostgreSQL | DONE | P2 | 开发 | 0 | 数据库只在私有网络可达 | `go-api-db`，PubliclyAccessible=false，状态 available |
| P2.3 | ECS Task Definition、Service、ALB | DONE | P2.1 | 开发 | 0 | desired count 为 1，ALB 转发到任务 | 任务定义 `go-api:1`，运行 1/1，目标 healthy |
| P2.4 | Go 服务连接私有 RDS | DONE | P2.2, P2.3 | 开发 | 0 | 使用云上凭证，不使用本地 `app/app` | `DATABASE_URL` 来自密钥 `go-api/database-url`，`/health` 为 ok |
| P2.5 | 经 ALB 验收 Go API | DONE | P2.4 | 验证 | 0 | Phase 2 验收标准全部满足 | 2026-11-09 创建 id 2 后删除，列表恢复为空 |
| P3 | Phase 3 前端链路与 Lambda | DONE | P3.7 | 主控 | 0 | 阶段验收见下方规格，全部子任务通过后才标 DONE | 2026-11-09 页面增删改查、`/health`、`/report`、WAF、ALB 直连都通过 |
| P3.1 | 前端生产构建 | DONE | P2 | 开发 | 0 | `npm run build` 产出 `dist`；页面仍请求相对路径 `/users` 和 `/health` | `frontend/dist/index.html`，构建产物含 `/users` 与 `/health`，无 localhost |
| P3.2 | report Lambda 代码与单测 | DONE | P2 | 开发 | 0 | `lambda/report` 用 `provided.al2023`；单测证明报告含 Go 健康状态和用户数量；不连 RDS | `go test` 通过；假 HTTP 返回 ok 和 2 个用户 |
| P3.3 | 私有 S3 与前端上传 | DONE | P3.1 | 开发 | 0 | 桶 `go-api-frontend-357278306946` 禁止公网访问，`dist` 已上传；创建前先查询 | 四项公共访问全关。对象 `index.html` 1141、`assets/index-BSZtelyw.css` 4508、`assets/index-DkTiscLR.js` 231610。临时 `function.zip` 已删除 |
| P3.4 | Lambda 与 HTTP API | DONE | P3.2 | 开发 | 0 | 函数 `go-api-report` 不进 VPC；`GET /report` 经 API 地址返回含 Go 健康状态的 JSON | 函数 Active，无 VPC。API `v9bgdsed66`，`GET /report` 返回 `go_health=ok`，`/users` 为 404 |
| P3.5 | CloudFront 分配 | DONE | P3.3, P3.4 | 开发 | 0 | 默认源是 S3；`/users*` 与 `/health` 到现有 ALB 且不缓存；`/report*` 到 API；浏览器用 HTTPS | `E357T1GJ1G381I` 已 Deployed。页面 200，`/health` 不缓存，`/report` 含 `go_health` |
| P3.6 | CloudFront 上的 WAF | DONE | P3.5 | 开发 | 0 | `us-east-1` 的 Web ACL `go-api-cloudfront` 只关联该分配；通用规则、SQLi 规则、按 IP 限速；Lambda 上没有 WAF | ACL `6a475e95-8c0a-4e28-b856-54b5b3c336d6` 写在分配 `WebACLId`。脚本查询 403，普通请求 200。Lambda 无此字段 |
| P3.7 | 经 CloudFront 验收 | DONE | P3.6 | 验证 | 0 | 页面完成一次用户增删改查；`/health` 为 ok；`/report` 含 Go 健康状态；ALB 直连仍可用 | 登记 Phase3 Check，改为 Phase3 Updated 后删除。`/report` 回到 `user_count=1`。原有用户 Yanbin Li 仍在 |
| P4 | Phase 4 CI/CD | PENDING | P3 | 主控 | 0 | 提交触发构建和 CDK 部署，使用 OIDC | 无 `.github/`、无 `cdk.json` |
| P5 | Phase 5 PR 预览环境 | PENDING | P4 | 主控 | 0 | PR 独立环境，关闭后清理 | - |
| P6 | Phase 6 灰度与回滚 | PENDING | P5 | 主控 | 0 | Lambda 10% Canary，ECS 蓝绿，告警可回滚 | - |

## Phase 3 规格

已于 2026-11-09 确认。部署方式继续用 AWS CLI，不用 CDK，也不用 SAM。

目标：浏览器打开 CloudFront 默认域名，能看到现有用户页，并完成用户增删改查；同一域名上的 `/report` 由 Lambda 读取现有 Go 服务后返回摘要；WAF 检查进入 CloudFront 的请求。

入口与路径：

- 不申请自定义域名。页面和接口都用 `https://<分配>.cloudfront.net`。
- 默认行为 `/*` 指向私有 S3，使用 Origin Access Control。前端继续请求相对路径 `/users` 和 `/health`，因此生产环境与页面同源，不改 Go 路由。
- `/users*` 和 `/health` 转发到现有公网 ALB，关闭缓存。CloudFront 对浏览器用 HTTPS，回源 ALB 用 HTTP。
- `/report*` 转发到 API Gateway HTTP API。Lambda 不进 VPC、不连 RDS。`GET /report` 再请求 ALB 的 `/health` 和 `/users`，返回 Go 健康状态和用户数量。
- 需求文档里的 `/api/go/*`、`/api/lambda/*` 不采用，避免改动已验收的 Go 接口和前端。

WAF：

- 一个 Web ACL，范围 `CLOUDFRONT`，必须创建在 `us-east-1`，只关联这个分配。
- 规则：通用托管规则、SQL 注入托管规则、按 IP 的速率限制。不挂 Lambda，也不再给 ALB 或 API Gateway 单独加 WAF。
- 直接访问现有 ALB 或 API Gateway 地址会绕过这层 WAF。Phase 3 保留这两条直连，方便对照 Phase 2。

不包含：CDK、流水线、PR 环境、灰度、自定义域名、NAT、第二套数据库、把用户 CRUD 搬进 Lambda。

## Phase 3 执行计划

创建资源前按名称查询，已存在则不重复创建。S3 桶策略和 Origin Access Control 放到 P3.5，因为策略要引用 CloudFront 分配。Lambda 只配 CloudWatch 日志权限，用环境变量指向现有 ALB。

依赖与并行：

```text
P2（已完成）
├─ P3.1 前端构建 ── P3.3 私有 S3
└─ P3.2 Lambda 代码 ── P3.4 Lambda 与 API
                              \        /
                               P3.5 CloudFront
                                    |
                               P3.6 WAF
                                    |
                               P3.7 验收
                                    |
                               P3 阶段任务
```

| 分组 | 任务 | 说明 |
| --- | --- | --- |
| A | P3.1、P3.2 | 只改本地代码，可同时做 |
| B | P3.3、P3.4 | 各自的前序通过后可同时做，开始创建云资源 |
| C | P3.5 | 等 S3 和 API 都完成 |
| D | P3.6 | 等分配存在后再关联 |
| E | P3.7 | 对照验收标准，不改业务代码 |

验收：

- 打开 CloudFront 域名能看到用户页，并完成一次创建、查询、更新、删除。
- `GET /health` 经 CloudFront 返回 ok，数据仍进现有私有 RDS。
- `GET /report` 经 CloudFront 返回 Lambda JSON，其中包含 Go 健康状态。
- Web ACL 关联在 CloudFront 上，不关联 Lambda。
- 现有 ALB 地址仍可直接访问。

主要新增费用是 WAF：一个 Web ACL 加三条规则，大约每月 8 美元，另加请求费。CloudFront、S3、HTTP API 和 Lambda 在学习流量下费用很低。

## Phase 4 规格

2026-11-09 草案，尚未确认。确认前不初始化 Git、不创建 AWS 资源、不把 P4 改为 `READY`。

目标：默认分支收到一次提交后，自动跑 Go 测试和前端类型检查，构建并推送不可变镜像，再用 CDK 更新当前学习环境。身份用 GitHub OIDC 临时凭证，仓库和 GitHub Secrets 里不放长期访问密钥。

入口与范围：

- 区域仍是 `ap-southeast-2`。CloudFront 的 WAF 仍在 `us-east-1`，CDK 若描述这层，单独一个栈，不把 WAF 挂到 Lambda。
- 学习环境继续 1 个 Fargate 任务，继续用现有私有 RDS、ALB、S3、Lambda、API Gateway 和 CloudFront。不新建第二套环境。
- GitHub Actions 只负责触发和编排。CodeBuild 负责 Go 测试、前端 `npm run build`、Docker 构建。部署只由这一条流水线触发，避免 Actions 和 CodeBuild 各部署一次。
- 镜像标签用 Git 提交号，部署时记录 Digest。推送到已有 ECR `go-api`，不另建仓库。
- CDK 用 TypeScript。第一次部署前先 `cdk diff`。出现替换 RDS、删除 S3 桶、断开 CloudFront 或 WAF 的变更就停，不自动执行。
- 数据库连接继续读 Secrets Manager `go-api/database-url`。本地 `app/app` 不进云上配置，也不进流水线变量。

验收：

- 向默认分支推送一次提交，流水线自动开始。
- Go 测试覆盖 `services/go-api` 和 `lambda/report`。前端目前没有测试脚本，本阶段用 `npm run build`（含 `tsc --noEmit`）作为前端检查。
- 新镜像进入现有 ECR，标签为提交号。
- CDK 部署成功后，现有 CloudFront 地址仍能完成用户增删改查，`/health` 为 ok，`/report` 含 Go 健康状态。
- 流水线角色来自 OIDC，仓库中搜不到 `AKIA` 长期密钥。

不包含：PR 预览环境、Lambda Canary、ECS 蓝绿、自定义域名、NAT、第二套数据库、把用户 CRUD 搬进 Lambda。这些分别留在 Phase 5 和 Phase 6。

待确认：

1. GitHub 所有者和仓库名。当前目录还不是 Git 仓库，也没有远程。
2. CDK 接管方式：导入并管理现有学习环境，或本阶段只创建 OIDC、部署角色和 CodeBuild，应用资源仍由现有 CLI 资源承担。
3. 前端检查是否接受 `npm run build`，不在本阶段新加测试框架。
4. 默认分支名用 `main`。

## 调度记录

- 2026-11-09 写出 Phase 4 规格草案。会话保持暂停，任务仍是 `PENDING`。
- 2026-11-09 P3.7 和阶段验收通过。页面完成增删改查，`/report` 用户数回到 1。会话暂停在 Phase 4 规格确认前。
- 2026-11-09 P3.6 通过。Web ACL 只写在分配上。带脚本的查询返回 403，普通页面返回 200。开始 P3.7。
- 2026-11-09 P3.5 通过。分配已 Deployed，页面、`/health`、`/report` 都返回预期内容。开始 P3.6。
- 2026-11-09 P3.3、P3.4 通过。开始 P3.5。分配 `E357T1GJ1G381I`（`d1zalq3ci35v3c.cloudfront.net`）正在部署，桶策略已限制为该分配。
- 2026-11-09 P3.1、P3.2 通过。前端 `npm run build` 成功；`go test ./...` 在 `lambda/report` 通过。开始 P3.3、P3.4。
- 2026-11-09 用户同意开始 Phase 3。P3.1、P3.2 改为 `RUNNING`。
- 2026-11-09 写好 `docs/phase3-实现过程.md`。资源仍未创建，任务保持 `PENDING`。
- 2026-11-09 用户确认 Phase 3 规格。执行计划已写入，P3.1–P3.7 为 `PENDING`，会话保持暂停。
- 2026-11-09 完成 Phase 3 需求分析。规格草案待确认，会话保持暂停。
- 2026-11-09 Phase 2 验收通过。部署方式确认为 AWS CLI。暂停在 Phase 3 规格确认前。
- 2026-11-09 工作流改为五阶段流程图。现场仍暂停在 Phase 2 确认前。
- 2026-11-08 初始化：Phase 1 标为 DONE，之后的阶段未执行。
