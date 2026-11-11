# 经验与技术决策

需求分析和任务规划前先读本文件。新决策追加在最上面。不要删除已经生效的约束；过时决策标成「已替代」并指向新条目。

## 2026-11-11 发布权限

- `go-api-github-deploy` 的策略 `go-api-release` 只允许推送 ECR `go-api`，以及代入本账号四个 CDK bootstrap 角色。网站、数据库和 CloudFront 仍由 `GoApiRelease` 在构建机里更新。
- `buildspec.yml` 先用 CodeBuild 自己的角色把 Lambda 压缩包上传到 `lambda/<提交号>.zip`，再代入部署角色推送镜像并执行 `cdk deploy GoApiRelease`。镜像标签和压缩包键都是 `IMAGE_TAG`，由 GitHub Actions 传入 `GITHUB_SHA`。
- 源码桶允许 `357278306946` 和 Lambda 服务读取 `lambda/*`，供发布栈更新 `go-api-report`。本机仍然不要直接 `cdk deploy`。

## 2026-11-11 三个账号的身份

用户确认的对应关系，后续沿用这些称呼：

- `722769295876`：组织管理账号。组织 `o-ffqezcdhwo` 的管理员，SCP `p-grp31vw3` 从这里下发。本项目没有这个账号的凭证，也不登录它。
- `357278306946`：Builder ID 进入的成员账号，在上面的组织里，带有免费额度。网站、数据库、ECS、CloudFront 都在这里。本机默认凭证是 IAM 用户 `aws-demo`。
- `235494787236`：用户自己的 root 账号。OIDC、源码桶和 CodeBuild 在这里。本机配置名 `oidc`。

## 2026-11-11 流水线资源用 CLI 创建

- 本机可以调用 IAM、CodeBuild、S3 控制面，但 `aws s3 cp` 和 `cdk deploy` 上传对象到 `ap-southeast-2` 桶时，10 秒内建不起连接。两个账号的 CDK bootstrap 已经成功。
- 因此不要再原样执行 `cdk deploy GoApiOidc` 或 `GoApiPipeline`。同名资源已存在，上传恢复后直接部署会报 AlreadyExists。
- 配置名 `oidc` 是 `arn:aws:iam::235494787236:root`。默认凭证仍是 `357278306946` 的 `aws-demo`，不要覆盖。
- 已存在且不要再建：OIDC 提供方 `token.actions.githubusercontent.com`、角色 `go-api-github-oidc`（策略 `go-api-ci-start`）、角色 `go-api-codebuild`、项目 `go-api-ci`、桶 `go-api-ci-source-235494787236`、角色 `go-api-github-deploy`。这些资源目前不属于 CloudFormation。
- GitHub Actions 从 GitHub 的网络上传源码包，不依赖本机到 S3 的数据面。

## 2026-11-11 OIDC 改到可登录账号

- 已替代「在 `357278306946` 创建 GitHub OIDC」。该账号被 SCP `p-grp31vw3` 拒绝 OIDC 提供方。
- OIDC、源码桶和 CodeBuild 建在 `235494787236`。角色名 `go-api-github-oidc`、`go-api-codebuild`，项目名 `go-api-ci`，桶名 `go-api-ci-source-235494787236`。
- `357278306946` 的 `go-api-github-deploy` 只信任 `arn:aws:iam::235494787236:role/go-api-codebuild`。现有服务仍留在这个账号。

## 2026-11-10 Phase 4 部署受阻

- 账号 `357278306946` 的用户 `aws-demo` 被组织 SCP `p-grp31vw3` 明确拒绝 `iam:GetOpenIDConnectProvider` 和 `iam:ListOpenIDConnectProviders`。GitHub OIDC 提供方因此不能由当前身份创建或查询。
- 该区域还没有 CDK bootstrap：`/cdk-bootstrap/hnb659fds/version` 不存在，部署角色 `cdk-hnb659fds-deploy-role-357278306946-ap-southeast-2` 也不能代入。
- `cdk diff GoApiPipeline` 当时只有新增资源，没有改动现有 RDS、ALB、CloudFront 或 WAF。在 SCP 放行前不要部署。

## 2026-11-10 Phase 4 已锁定

- 代码仓库是 `webmapLee/aws-demo`，默认分支 `main`。流水线只用 GitHub OIDC，信任条件限 `repo:webmapLee/aws-demo:ref:refs/heads/main`。
- CDK 新建流水线资源并发布新版本。现有 RDS、ALB、CloudFront、WAF 不导入 CloudFormation。
- GitHub Actions 只编排；CodeBuild 项目名 `go-api-ci`，负责测试、前端构建和镜像。部署角色名 `go-api-github-deploy`。
- 前端检查沿用 `npm run build`。镜像继续推到 ECR `go-api`，架构 `linux/amd64`，标签用提交号。

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
