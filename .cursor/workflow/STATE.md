# 工作流状态

- 项目：aws-go
- 更新时间：2026-11-11
- 流程位置：任务代办本地验收通过。Phase 4 仍停在 P4.6，等推送到 main
- 会话状态：PAUSED
- 并发上限：3
- 暂停原因：任务代办只在本地验收，没有部署。P4.6 仍等用户要求提交并推送到 main。

## 完成情况摘要

Phase 1 和 Phase 2 都已验收。Phase 2 用 AWS CLI 部署在 `ap-southeast-2`：ECR `go-api:v1`、私有 RDS `go-api-db`、ECS Fargate 服务 `go-api`（期望数量 1）、公网 ALB。CDK 仍属于 Phase 4。

恢复现场时不要重做 `DONE`。用户修改 Phase 3 范围时回到第一阶段。用户同意开始后，只把依赖已满足的任务改为 `READY` 再进入轮询。用户暂不继续时保持本暂停。

## 阶段规格

| 阶段 | 规格状态 | 范围与验收 |
| --- | --- | --- |
| Phase 1 | 已确认并通过 | 本地 Go CRUD、PostgreSQL、Dockerfile、Compose。验收见需求文档第九节 |
| Phase 2 | 已确认并通过 | AWS CLI 部署 ECR、ECS Fargate、ALB、私有 RDS。2026-11-09 经 ALB 完成用户 CRUD |
| Phase 3 | 已确认并通过 | 一个 CloudFront 入口：页面走 S3，`/users` 与 `/health` 走现有 ALB，`/report` 走 API Gateway 和 Lambda。WAF 只挂 CloudFront，建在 `us-east-1`。2026-11-09 验收通过 |
| Phase 4 | 执行中 | OIDC 和 CodeBuild 在 `235494787236`。部署角色和现有服务在 `357278306946` |
| Phase 5 | 未确认 | 一个 PR 一个环境，共用 RDS，独立 schema |
| Phase 6 | 未确认 | Lambda Canary、ECS Blue/Green、告警回滚 |

## 检查点

- 正在跑的任务：无
- 运行中的子代理：无
- 最后验证：2026-11-11 任务代办本地通过。`go test -count=1` 覆盖路由；`DATABASE_URL` 指向本机 `localhost:15432` 时 `TestTaskRepositoryCRUD` 通过。前端 `npm run build` 通过。页面完成指定用户、筛选、完成、改派，有待办时删除用户被拒绝。
- 续跑入口：用户要求提交并推到 `main` 后做 P4.6。待办要上线时，还要给 CloudFront 增加 `/tasks*`，并单独确认。不要在本机执行 `cdk deploy`。
- 已锁定：仓库 `https://github.com/webmapLee/aws-demo`，默认分支 `main`。GitHub 先代入 `235494787236` 的 `go-api-github-oidc`，CodeBuild 再代入 `357278306946` 的 `go-api-github-deploy`。前端检查用 `npm run build`。CDK 不接管现有数据库、负载均衡、CloudFront 和 WAF。

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
| P4 | Phase 4 CI/CD | PENDING | P4.6 | 主控 | 0 | 提交触发构建和 CDK 部署，使用 OIDC | 仓库 `webmapLee/aws-demo`，分支 `main`，提交 `9343a12` |
| P4.1 | CDK 流水线栈代码 | DONE | P3 | 开发 | 0 | `infrastructure/` 能 `cdk synth` 出 OIDC、部署角色和 CodeBuild，且不部署 | `npm test` 2 通过，`tsc --noEmit` 与 `cdk synth` 成功。模板含 OIDC、`go-api-github-deploy`、`go-api-ci`。未部署 |
| P4.2 | CDK 应用发布栈代码 | DONE | P4.1 | 开发 | 0 | synth 引用现有 ECR、ECS、S3、Lambda；模板不包含 RDS、ALB、CloudFront、WAF | `npm test` 4 通过。`GoApiRelease` 引用 `go-api:v1`、前端桶、`go-api-report`，不创建 RDS、ALB、CloudFront、WAF、ECS Service |
| P4.3 | GitHub Actions 编排 | DONE | P3 | 开发 | 0 | 仅 `main` 推送触发；用 OIDC；只启动 CodeBuild，不另建一条部署 | `.github/workflows/main.yml` 只在 `main` 推送时用 OIDC 启动 `go-api-ci` |
| P4.4 | 在 357278306946 创建 OIDC | BLOCKED | P4.1 | 开发 | 0 | 原计划在该账号创建 OIDC | 已替代。SCP 拒绝 OIDC 提供方。改由 P4.7、P4.8 承担 |
| P4.7 | 跨账号流水线代码 | DONE | P4.1, P4.3 | 开发 | 0 | OIDC 与 CodeBuild 模板属于 235494787236；357278306946 只有部署角色，且信任 `go-api-codebuild` | `npm test` 4 通过，`tsc --noEmit` 与 `cdk synth` 成功 |
| P4.8 | 部署 OIDC 栈到 235494787236 | DONE | P4.7 | 开发 | 0 | `GoApiOidc` 创建 OIDC、`go-api-github-oidc`、`go-api-ci`；重复执行不新建第二套 | 2026-11-11 CLI 创建。OIDC 提供方和 `go-api-github-oidc` 已存在。新建桶 `go-api-ci-source-235494787236`、角色 `go-api-codebuild`、项目 `go-api-ci`。`go-api-github-deploy` 已在 `357278306946` 创建。未进 CloudFormation |
| P4.5 | 构建、推送镜像并发布版本 | DONE | P4.2, P4.3, P4.8 | 开发 | 0 | CodeBuild 跑 Go 测试和 `npm run build`，镜像标签为提交号，再由 CDK 更新现有服务和前端 | `buildspec.yml` 按 `IMAGE_TAG` 推送 `linux/amd64` 并只部署 `GoApiRelease`。工作流把 `GITHUB_SHA` 传给 `IMAGE_TAG`。`npm test` 5 通过。线上角色策略已写入，本次没有部署网站 |
| P4.6 | Phase 4 验收 | PENDING | P4.5 | 验证 | 0 | 一次 `main` 推送跑通流水线；CloudFront 增删改查、`/health`、`/report` 仍通过；仓库无长期密钥 | - |
| P5 | Phase 5 PR 预览环境 | PENDING | P4 | 主控 | 0 | PR 独立环境，关闭后清理 | - |
| P6 | Phase 6 灰度与回滚 | PENDING | P5 | 主控 | 0 | Lambda 10% Canary，ECS 蓝绿，告警可回滚 | - |
| T1 | 任务代办 | DONE | T1.3 | 主控 | 0 | 本地可把待办交给指定用户，并完成筛选、改派、完成和删除 | 2026-11-11 本地页面走通。未部署 |
| T1.1 | Go 待办接口与迁移 | DONE | - | 开发 | 0 | 迁移创建 `tasks`；指定用户可增删改查；用户不存在为 404；有待办时删除用户为 409 | `002_create_tasks.sql`、`003_index_tasks_assignee.sql`。路由测试与 `TestTaskRepositoryCRUD` 通过 |
| T1.2 | 前端待办区 | DONE | - | 开发 | 0 | 页面可指定用户添加、筛选、改派、完成和删除；`/tasks` 走本地代理 | `frontend/src/Tasks.tsx`，Vite 代理 `/tasks` |
| T1.3 | 任务代办本地验收 | DONE | T1.1, T1.2 | 验证 | 0 | `go test ./...` 通过；`npm run build` 通过；不部署 | 2026-11-11 路由测试、数据库测试和 `npm run build` 通过。页面验收后删掉了临时用户和待办 |

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

2026-11-10 确认。用户要求继续 Phase 4，远程已是 `https://github.com/webmapLee/aws-demo`，分支 `main`，最新提交 `9343a12`。

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

已锁定的四项：

1. 仓库 `webmapLee/aws-demo`。
2. CDK 新建 OIDC、部署角色、CodeBuild，并发布新镜像、前端和 Lambda 代码。现有 RDS、ALB、CloudFront、WAF 继续留在原 CLI 资源上，不导入 CloudFormation，避免替换数据库或断开入口。
3. 前端检查使用现有 `npm run build`。
4. 默认分支是 `main`。OIDC 信任条件只允许 `repo:webmapLee/aws-demo:ref:refs/heads/main`。PR 信任留到 Phase 5。

2026-11-11 补充：GitHub OIDC 和 CodeBuild 建在 `235494787236`。`357278306946` 不创建 OIDC 提供方，只保留部署角色 `go-api-github-deploy`，信任 `arn:aws:iam::235494787236:role/go-api-codebuild`。现有网站、数据库和 CloudFront 仍留在 `357278306946`。

## Phase 4 执行计划

创建前按名称查询。OIDC 提供方、角色 `go-api-github-deploy`、CodeBuild 项目 `go-api-ci`、CDK 栈已存在则更新，不重复创建。镜像继续推到 ECR `go-api`，架构 `linux/amd64`。期望任务数保持 1。

依赖与并行：

```text
P3（已完成）
├─ P4.1 CDK 流水线栈代码 ── P4.2 应用发布栈代码
│                      └─ P4.4 部署流水线栈
└─ P4.3 GitHub Actions
                              \        /
                               P4.5 构建并发布
                                    |
                               P4.6 验收
                                    |
                               P4 阶段任务
```

| 分组 | 任务 | 说明 |
| --- | --- | --- |
| A | P4.1、P4.3 | 只改本地代码，可同时做 |
| B | P4.2 | 等 CDK 工程存在后再加发布栈 |
| C | P4.4 | 等用户确认计划后部署，先看 diff |
| D | P4.5 | 等角色、CodeBuild 和工作流都就绪 |
| E | P4.6 | 对照验收标准，不改业务代码 |

P4.4 的 diff 若出现替换 RDS、删除 S3 桶、更换 CloudFront 或 WAF，立即停止。新增费用主要是 CodeBuild 构建分钟数；OIDC 和 IAM 角色本身不收费。

## 任务代办规格

2026-11-11 确认。Phase 4 的 P4.6 保持 `PENDING`，不因本功能推送或部署。

目标：在现有用户名册上增加待办。创建待办时必须指定一名已经存在的用户，页面可以按这个用户查看、改派、完成和删除。

数据：新增迁移 `002_create_tasks.sql`。`tasks` 含 `id`、`title`（1 到 200 字）、`assignee_id`（必填，外键指向 `users.id`）、`done`（默认 false）、`created_at`。服务启动时沿用现有迁移表自动执行。不改 `users` 表，也不改 `/report`。

接口，与用户接口同一套 Go 服务：

- `POST /tasks`：正文 `{ "title", "assignee_id" }`，用户不存在返回 404。
- `GET /tasks`：列表，可用 `assignee_id` 筛选，`limit` 最大 100。响应带负责人的 `id`、`name`、`email`。
- `GET /tasks/:id`、`PUT /tasks/:id`、`DELETE /tasks/:id`：更新可改标题、负责人和完成状态。
- 删除仍有待办的用户返回 409，待办保留。不级联删除。

页面：现有用户页增加待办区。可填写标题并从名册选择负责人，列表显示负责人姓名，可按用户筛选、标记完成、改派和删除。本地 Vite 把 `/tasks` 转发到 Go。用户增删改查保持可用。

验收：本地能创建一条指定用户的待办，按该用户筛出，改完成状态和负责人，再删除。指定不存在的用户被拒绝。该用户仍有待办时，删除用户被拒绝。`go test` 覆盖路由；有 `DATABASE_URL` 时跑迁移和查询。前端 `npm run build` 通过。

本次不做：登录和「当前用户」、截止日期、优先级、评论、改 CloudFront、推送 `main`、部署。线上分配目前只把 `/users*` 和 `/health` 转到 ALB，`/tasks` 在生产会落到 S3。上线留到本功能本地验收之后，单独确认。

## 任务代办执行计划

用户已确认规格并要求开始本地开发。不创建或修改 AWS 资源。

```text
T1.1 Go 待办接口与迁移
T1.2 前端待办区
        \        /
         T1.3 验收
              |
         T1 任务代办
```

| 分组 | 任务 | 说明 |
| --- | --- | --- |
| A | T1.1、T1.2 | 接口形状已在规格里定死，后端和页面可以同时做 |
| B | T1.3 | 对照验收标准，不改业务代码 |

## 调度记录

- 2026-11-11 任务代办本地验收通过。未改 CloudFront，未推送，未部署。P4.6 仍是 `PENDING`。
- 2026-11-11 用户确认任务代办规格。T1.1、T1.2 开始。不推送，不部署。
- 2026-11-11 收到任务代办需求。规格已写入，等待确认。未改代码，P4.6 仍是 `PENDING`。
- 2026-11-11 P4.5 通过。构建脚本和角色权限已就绪，会话停在推送前。P4.6 仍是 `PENDING`。
- 2026-11-11 P4.8 通过。本机 `s3 cp` 到引导桶建连超时，控制面可用，所以用 CLI 创建源码桶、CodeBuild 和两个角色。凭证配置名是 `oidc`，身份是 `235494787236` 的 root。下一任务 P4.5。
- 2026-11-11 用户确认 OIDC 放在 `235494787236`。P4.7 通过。P4.8 等待该账号的凭证。
- 2026-11-10 P4.1、P4.2、P4.3 通过。P4.4 在部署前被 SCP 挡住，会话暂停。
- 2026-11-10 确认 Phase 4 规格并写入执行计划。任务保持 `PENDING`，等用户说「开始」。
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
