# 经验与技术决策

需求分析和任务规划前先读本文件。新决策追加在最上面。不要删除已经生效的约束；过时决策标成「已替代」并指向新条目。

## 2026-11-09 Phase 2 已落地

- Phase 2 用 AWS CLI 创建资源，不用 CDK。CDK 仍然留在 Phase 4。
- 区域 `ap-southeast-2`，账号 `357278306946`。组织策略不允许改到东京。
- 使用默认 VPC `vpc-0f2bc0f12ba17b825`。Fargate 打开公网 IP 以便拉取 ECR 镜像，没有购买 NAT Gateway。RDS `go-api-db` 无公网地址。
- 公网入口是 ALB `go-api-1526541297.ap-southeast-2.elb.amazonaws.com`。任务定义 `go-api:1`，镜像 `go-api:v1`，期望任务数 1。
- 云上数据库连接串在 Secrets Manager `go-api/database-url`，由执行角色注入 `DATABASE_URL`。连接使用 `sslmode=require`。

## 2026-11-08 已确认约束

- 区域使用悉尼 `ap-southeast-2`。账号创建时分配，控制台不能改。CDK 和流水线都用这个区域。
- 学习环境的 Go 服务先跑 1 个 Fargate 任务。
- 预览环境共用 RDS，用独立 schema 隔离数据。
- 总体选型：CDK（TypeScript）定义基础设施，GitHub Actions + CodeBuild，SAM 负责 Lambda 灰度，计算用 ECS Fargate，数据库用 RDS PostgreSQL。
- Phase 2 的目标是把 Go 服务部署到 AWS 并经 ALB 访问。CDK 自动化、PR 环境和灰度分别属于 Phase 4、5、6。
- 本地 Postgres 账号 `app` / `app` 只用于本机 Docker。云上数据库使用独立凭证，不写进仓库。

## 架构校正

- ECS 负责期望状态和调度，Fargate 提供运行环境，ECR 提供镜像。Task Definition 决定镜像和资源，Service 决定任务数量。
- 公网 API 走 ALB 和 Target Group。Cloud Map 用于服务之间的发现，不是 ALB 的必经组件。
- WAF 关联 CloudFront、API Gateway 或 ALB，不能直接挂在 Lambda 上。
- SAM 的 Canary 只覆盖 Lambda。ECS 灰度用 CodeDeploy 蓝绿或 ECS 滚动更新。CDK 负责把这些策略定义出来。

## 防重复

- 创建 ECR、RDS、ECS Service、CloudFront、栈之前，先按名称查是否已存在。
- `STATE.md` 里 `DONE` 的任务不因为新会话而重新实现。
- 本地集成测试依赖 `DATABASE_URL`。没设置时会跳过，不能把跳过当成数据库验收通过。
