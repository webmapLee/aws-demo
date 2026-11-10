# 需求
构建Go服务 插入数据库 读取数据库 
lambda -> 
ALB（CloudMap） -> ECS
ECS（管调度）   -> 告诉 Fargate 跑哪个版本、跑几份
Fargate（跑程序）-> 拿到镜像，把法币网关跑起来
ECR（存镜像）   -> 把打包好的程序提供给 Fargate
Github -> Go代码 docker ECR（存镜像）
2.Lambda(身上要挂一个简单的WAF)读取 Go
3.CF 前端项目请求Lambda
4.CDK+CodeBuild 完成一个PR一个环境 前端到后端到 GO
5.prod上线配置需要灰度 SAM本身就可以实现

# 实现流程
这是一套比较完整的 AWS 云原生全栈应用 CI/CD 架构，涉及 Go 后端、数据库、Lambda、ECS Fargate、ECR、CloudFront、WAF、CDK、CodeBuild，以及 PR 级别的临时环境和生产灰度发布。

我建议把它作为一个真实项目来实现，而不是单独学习每个 AWS 服务。

先明确最终目标：

1. 开发人员提交 Go 代码和前端代码。
2. GitHub 自动触发 CI/CD。
3. Go 服务编译、测试、构建 Docker 镜像，推送到 ECR。
4. CDK 自动部署基础设施和应用。
5. 每个 PR 自动创建一个独立测试环境。
6. 前端通过 CloudFront 访问后端 API。
7. 后端通过 ECS Fargate 运行 Go 服务，连接数据库。
8. Lambda 承担轻量级 API 或业务处理。
9. 生产环境支持灰度发布、健康检查和自动回滚。

不过，你的原始架构里有几个地方需要先纠正。

## 一、先把架构关系理清楚

1\. ECS 和 Fargate 的关系

不是 ECS 告诉 Fargate 下载哪个版本的程序这么简单。

- ECS：容器编排与调度服务，负责维护期望运行状态。
- Fargate：容器计算运行环境，负责实际运行容器。
- ECS Task Definition：定义运行哪个镜像、CPU、内存、环境变量等。
- ECS Service：定义运行多少个 Task，以及如何部署和保持数量。
- ECR：保存 Docker 镜像。

例如：

```
ECS Service
    |
    | Desired Count = 3
    | Task Definition = go-api:12
    |
    v
ECS Scheduler
    |
    +---- Fargate Task 1
    |         |
    |         +---- Go API Container
    |
    +---- Fargate Task 2
    |         |
    |         +---- Go API Container
    |
    +---- Fargate Task 3
              |
              +---- Go API Container
                         |
                         v
                      Database
```

ECS 负责调度和维护三个任务，Fargate 提供运行资源，ECR 提供镜像。

2\. ALB 和 Cloud Map 不是同一个东西

- ALB：负责接收 HTTP/HTTPS 请求，将请求转发给后端服务。
- Cloud Map：负责服务注册和服务发现，让服务能够通过服务名称找到其他服务。
- ECS：可以将任务注册到 ALB Target Group，也可以注册到 Cloud Map。

常见的公网 API 请求链路是：

```
Internet
   |
   v
ALB
   |
   v
Target Group
   |
   v
ECS Service
   |
   v
Fargate Tasks
```

Cloud Map 更适合微服务之间的内部服务发现，不是 ALB 的必经组件。

3\. WAF 不能直接挂在 Lambda 函数上

AWS WAF 通常关联 CloudFront、API Gateway、ALB 等受支持的入口资源，而不是直接关联 Lambda 函数。

所以建议：

- 前端入口：CloudFront + WAF。
- Lambda API 入口：API Gateway + WAF。
- ECS API 入口：ALB + WAF，或者统一从 CloudFront 入口接入。

4\. SAM 和 CDK 的灰度发布职责

SAM 支持 Lambda 的 Canary、Linear 等流量迁移策略，可以结合 CodeDeploy 实现灰度发布。

但 SAM 不是整个系统的通用灰度发布工具。

ECS 服务也可以使用 CodeDeploy 蓝绿部署，或者 ECS 自身的滚动部署机制。CDK 则负责定义这些基础设施和部署配置。

## 二、我建议采用的完整架构

这里我会稍微调整你的架构：让 CloudFront 作为统一前端入口，分别把请求转发到 Lambda 和 ECS。

[O3の画像作成機能：さまざまな用途で活用できる便利なツール ✨ #LLM - Qiita](https://images.openai.com/static-rsc-4/sViPouhsNv6_VI9cYIpXfTzc0Vmpvm4PgW8NixTRSPOftsm0OGqG9pcRCth-Y2MNuYXxTfxPJXEJyrEGymKlem3pgVNmVLZIJ7rA-WL31ybmyJr7jwjSKnMWxAo_01GKBUTBKUVHXd1Wc1KWQIjxw55Z7TN7BXCOacZNsGkctCY?purpose=inline)

[qiita.com](https://qiita.com/okikusan-public/items/5c3cafb6942fd5824482?utm_source=chatgpt.com)

### 1. 业务运行架构

```
                    用户浏览器
                         |
                         v
                 CloudFront CDN
                    + AWS WAF
                         |
              +----------+----------+
              |                     |
          /* 前端资源             /api/*
              |                     |
              v                     v
          S3 Bucket            ALB / API Gateway
          React/Vue                  |
                                    |
                          +---------+---------+
                          |                   |
                       /go/*               /lambda/*
                          |                   |
                          v                   v
                     ALB Target           API Gateway
                        Group                  |
                          |                    v
                          v                  Lambda
                     ECS Service               |
                          |                    |
                    ECS Scheduler              |
                          |                    |
                 +--------+--------+           |
                 |        |        |           |
                 v        v        v           |
              Fargate  Fargate  Fargate         |
                 |        |        |           |
                 +--------+--------+-----------+
                          |
                          v
                      Database
                     RDS PostgreSQL
```

这里有一个关键设计：

- Go 服务：负责核心业务逻辑、数据库 CRUD、复杂业务处理。
- Lambda：负责轻量级、事件驱动或者短时间执行的业务。
- CloudFront：统一分发前端静态资源和 API 请求。
- WAF：保护外部 HTTP 请求入口。
- ALB：将 Go API 请求分发给 ECS 服务。
- RDS：存储业务数据。

例如：

| 请求                   | 处理方式                              |
| -------------------- | --------------------------------- |
| `/`                  | CloudFront → S3                   |
| `/assets/*`          | CloudFront → S3                   |
| `/api/go/users`      | CloudFront → ALB → ECS → Go       |
| `/api/go/orders`     | CloudFront → ALB → ECS → Go       |
| `/api/lambda/report` | CloudFront → API Gateway → Lambda |
| Go 查询用户              | Go → RDS                          |
| Lambda 查询轻量数据        | Lambda → RDS 或其他服务                |

为什么这样设计？

因为 Lambda 和 ECS 是两种不同的计算模型。

Lambda 更适合短时、事件驱动的任务；ECS Fargate 更适合持续运行的 Go HTTP 服务。不要为了使用 Lambda 而把本来适合 ECS 的 Go 服务再绕一层 Lambda。

如果确实需要 Lambda 调用 Go 服务，可以通过内部 ALB 或 Cloud Map 进行服务发现。

## 三、Go 服务：从代码到数据库

这是整个项目的第一个实战模块。

我们先做一个最简单的 Go 用户服务。

### 1. 项目结构

```
go-api/
├── cmd/
│   └── server/
│       └── main.go
├── internal/
│   ├── handler/
│   │   └── user.go
│   ├── service/
│   │   └── user.go
│   ├── repository/
│   │   └── user.go
│   └── database/
│       └── postgres.go
├── migrations/
│   └── 001_create_users.sql
├── Dockerfile
├── go.mod
└── go.sum
```

### 2. 数据库设计

使用 RDS PostgreSQL。

先建一张用户表：

```
CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 3. Go 服务实现

使用 Go + Gin + GORM（也可以换成标准库 database/sql）。

主要实现三个接口：

```
POST   /users       创建用户
GET    /users       查询用户列表
GET    /users/:id   查询用户详情
```

例如：

```
func CreateUser(c *gin.Context) {
    var user User

    if err := c.ShouldBindJSON(&user); err != nil {
        c.JSON(400, gin.H{"error": err.Error()})
        return
    }

    if err := db.Create(&user).Error; err != nil {
        c.JSON(500, gin.H{"error": "database error"})
        return
    }

    c.JSON(201, user)
}
```

### 4. Docker 打包

Go 代码写好后，通过 Dockerfile 打包。

```
FROM golang:1.25 AS builder

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux GOARCH=arm64 \
    go build -o /server ./cmd/server

FROM gcr.io/distroless/static-debian12:nonroot

COPY --from=builder /server /server

EXPOSE 8080

ENTRYPOINT ["/server"]
```

注意：这里使用 ARM64 构建只是示例，必须和 Fargate Task 的 CPU 架构一致。如果使用 x86_64，就需要改为 `GOARCH=amd64`。

本地验证：

```
docker build -t go-api:v1 .
docker run -p 8080:8080 go-api:v1
```

到这里，你已经有了一个可以独立运行的 Go 容器。

## 四、GitHub → Docker → ECR → ECS Fargate

这是第二个实战模块，也是整个架构最重要的 CI/CD 链路。

[AWS ECR to ECS Deployment. Audience: Anyone who wants a clear… | by Bhairab Patra | Medium](https://images.openai.com/static-rsc-4/84oQmD0QEi59LYDjnm-rcJlpBt-DndGgkJamldxWXcZGELQg3OuhKwy7byyXTU_Ic6FzwSC8HWYSWVmKAG0oQ-Z3dPzclvSVGDi3Gj_FSmxk1GBtySS_z2W3w3bMtO0b27mrViMvRIO2QByvSAg5h0B4Dk4Du2wQ_Hn_SWIrVO0?purpose=inline)

[medium.com](https://medium.com/%40bhairabpatra.iitd/aws-ecr-to-ecs-deployment-a46b23bde1f3?utm_source=chatgpt.com)

### 1. 创建 ECR 仓库

例如：

```
go-api
```

GitHub 提交代码之后，自动执行：

```
GitHub
   |
   v
GitHub Actions
   |
   v
Go Test
   |
   v
Docker Build
   |
   v
Docker Push
   |
   v
Amazon ECR
```

镜像命名建议：

```
go-api:git-commit-sha
go-api:pr-123
go-api:v1.0.0
```

生产环境建议使用不可变的镜像 Tag，并在部署时记录镜像 Digest，避免同一个 Tag 被覆盖导致无法准确追踪版本。

### 2. ECS 配置

创建以下资源：

| AWS 服务     | 资源              | 用途        |
| ---------- | --------------- | --------- |
| ECS        | Cluster         | 容器集群逻辑边界  |
| ECS        | Task Definition | 定义 Go 容器  |
| ECS        | Service         | 管理运行数量和部署 |
| Fargate    | Tasks           | 实际运行容器    |
| ECR        | Repository      | 保存 Go 镜像  |
| ALB        | Load Balancer   | HTTP 请求入口 |
| ALB        | Target Group    | 管理容器目标    |
| CloudWatch | Logs            | 收集 Go 日志  |

假设生产环境：

```
ECS Cluster: production-cluster

ECS Service: go-api-service

Task Definition:
  Image: go-api:git-a8f31c2
  CPU: 512
  Memory: 1024
  Port: 8080

Desired Count: 3
Minimum Count: 2
Maximum Count: 10
```

这里：

- Desired Count = 3：希望运行三个 Go 容器。
- CPU = 512：0.5 vCPU。
- Memory = 1024：1GB 内存。
- Minimum Count = 2：自动扩缩容时至少两个。
- Maximum Count = 10：最多十个。

ECS Service Scheduler 会持续维护期望任务数量，Fargate 负责实际提供计算资源。

[image](https://www.google.com/s2/favicons?domain=https://docs.aws.amazon.com\&sz=32)

Amazon Elastic Container Service+1



### 3. Go 服务如何连接数据库？

推荐：

```
VPC
├── Public Subnet
│   └── ALB
│
└── Private Subnet
    ├── ECS Fargate
    │   └── Go API
    │
    └── RDS PostgreSQL
```

安全组：

```
ALB Security Group
    |
    | 允许 8080
    v
ECS Security Group
    |
    | 允许 5432
    v
RDS Security Group
```

数据库账号密码不要直接写在 Docker 镜像里。

使用：

- AWS Secrets Manager：存储数据库凭证。
- ECS Task Execution Role：允许 ECS 拉取 ECR 镜像、写入日志。
- ECS Task Role：授予 Go 应用访问 Secrets Manager 等资源的权限。

这里需要区分两个 IAM Role：Execution Role 是给 ECS 容器启动过程使用的，Task Role 是给 Go 应用运行时使用的。

## 五、CloudFront + Lambda + WAF 如何实现？

[AWS Hands-on for Beginners AWS エッジサービス入門ハンズオンを公開しました！ | Amazon Web Services ブログ](https://images.openai.com/static-rsc-4/7R7HlDBLBHnxSji1WCwSGCbCHfMY9BJdPOEmaQ19tALEX34yv6PCjDe0BEBlTyfyXX4XVzG3VKuCMumOGLgRqFj5aFOhA5JzDvp_4Bvy7zysVA5ATxvTz4mhHJALXnwvgcUZ6SJipy1EA-y2TDRN8sLHlZlAVv5YZvkvnZ3poC0?purpose=inline)

[aws.amazon.com](https://aws.amazon.com/jp/blogs/news/aws-hands-on-for-beginners-12/?utm_source=chatgpt.com)

这部分负责前端和轻量级 API。

### 1. 前端部署

假设前端使用 React：

```
frontend/
├── src/
├── public/
├── package.json
└── vite.config.ts
```

执行：

```
npm install
npm run build
```

生成：

```
dist/
```

将 dist 上传到 S3：

```
aws s3 sync dist/ s3://my-frontend-bucket/
```

CloudFront 配置 S3 为前端源站，用户访问域名时由 CloudFront 返回页面。

### 2. Lambda 服务

例如写一个 Go Lambda 函数：

```
lambda/
└── report/
    └── main.go
```

它可以负责：

- 生成统计报告。
- 接收业务事件。
- 发送通知。
- 执行简单的数据处理。

通过 API Gateway 暴露 HTTP API：

```
POST /report
GET  /report/:id
```

### 3. WAF

建议在 CloudFront 上关联 Web ACL。

配置：

- AWS Managed Rules。
- SQL Injection 防护规则。
- XSS 防护规则。
- IP 访问控制。
- Rate-based Rule（请求速率限制）。

这样前端请求、Lambda API 和 ECS API 都可以通过统一的 CloudFront 入口接受 WAF 检查。

如果 ECS ALB 还允许公网直接访问，就需要额外保护 ALB，不能假设 CloudFront 上的 WAF 自动保护了所有绕过 CloudFront 的请求。AWS WAF 的受保护资源类型可以参考官方文档。

[image](https://www.google.com/s2/favicons?domain=https://docs.aws.amazon.com\&sz=32)

AWS 文档



## 六、CDK + CodeBuild：一个 PR 一个独立环境

这是你这套架构中最有价值的设计之一。

你说的：

> 一个 PR 一个环境，前端到后端到 Go。

这在工程实践中通常称为：

Preview Environment（预览环境）/ Ephemeral Environment（临时环境）

例如，开发人员同时提交三个 PR：

| PR      | 环境          | 前端   | Go 服务          | 数据   |
| ------- | ----------- | ---- | -------------- | ---- |
| PR #101 | preview-101 | 独立前端 | 独立 ECS Service | 测试数据 |
| PR #102 | preview-102 | 独立前端 | 独立 ECS Service | 测试数据 |
| PR #103 | preview-103 | 独立前端 | 独立 ECS Service | 测试数据 |

每个 PR 都有自己的访问地址：

```
https://pr-101.preview.example.com
https://pr-102.preview.example.com
https://pr-103.preview.example.com
```

每个环境可以使用独立的配置、前端版本和后端镜像。

### 1. 完整流程

[GitHub PR毎に独立環境を構築することにより開発効率を向上させました！ - JMDC TECH BLOG](https://images.openai.com/static-rsc-4/GIEm3f4TLFXQym-WHSy3IX8gjp_sFoIcB-TwCvy1bWl4WcbNmxrFyDDC618R6k54XvyXSMzEs-itpxyHiFFOZXEJ5AK4hjOhevV9JGEmPJKTg41zsH8FQcTb9wfgnYHWwsFDlu8zgerhMm0sdYatwxT6DM1YSPLqjJEJ6IwqfVo?purpose=inline)

[techblog.jmdc.co.jp](https://techblog.jmdc.co.jp/entry/2022/08/22/114852?utm_source=chatgpt.com)

```
开发人员
   |
   v
GitHub 创建 PR #101
   |
   v
触发 CI Pipeline
   |
   +--------------------------+
   |                          |
   v                          v
前端测试                   Go 测试
   |                          |
   v                          v
前端 Build                Docker Build
   |                          |
   v                          v
上传 S3                   推送 ECR
   |                          |
   +------------+-------------+
                |
                v
          CDK Deploy
                |
                v
      创建 Preview-101 Stack
                |
       +--------+--------+
       |                 |
       v                 v
    前端环境           后端环境
    S3/CDN            ECS/Fargate
       |                 |
       +--------+--------+
                |
                v
         自动化集成测试
                |
                v
          PR Review
                |
          合并或关闭 PR
                |
                v
        CDK Destroy Preview
```

### 2. 如何实现一个 PR 一个环境？

核心是给 CDK Stack 设置动态名称。

例如：

```
const prNumber = process.env.PR_NUMBER;

const stackName = `Preview-${prNumber}`;

new PreviewStack(app, stackName, {
    env: {
        account: process.env.CDK_DEFAULT_ACCOUNT,
        region: process.env.CDK_DEFAULT_REGION,
    },
});
```

创建 PR #101：

```
PR_NUMBER=101 npx cdk deploy Preview-101
```

关闭 PR：

```
PR_NUMBER=101 npx cdk destroy Preview-101
```

CDK 会通过 CloudFormation 管理这个环境中的资源。

### 3. 推荐的 CDK 工程结构

我建议使用 TypeScript 编写 CDK，因为前端和基础设施都可以使用 TypeScript，降低技术栈复杂度。

```
my-cloud-project/
│
├── frontend/
│   ├── src/
│   └── package.json
│
├── services/
│   └── go-api/
│       ├── cmd/
│       ├── internal/
│       └── Dockerfile
│
├── lambda/
│   └── report/
│
├── infrastructure/
│   ├── bin/
│   │   └── app.ts
│   │
│   ├── lib/
│   │   ├── network-stack.ts
│   │   ├── database-stack.ts
│   │   ├── ecr-stack.ts
│   │   ├── frontend-stack.ts
│   │   ├── ecs-stack.ts
│   │   ├── lambda-stack.ts
│   │   ├── security-stack.ts
│   │   └── preview-stack.ts
│   │
│   ├── package.json
│   └── cdk.json
│
├── .github/
│   └── workflows/
│       ├── pr-preview.yml
│       ├── production.yml
│       └── cleanup-preview.yml
│
└── README.md
```

### 4. 资源如何划分？

不要每次 PR 都创建一整套 VPC、RDS、CloudFront。

那样成本会很高，部署也会比较慢。

我推荐采用两层结构：

基础设施层：长期存在

Network Stack

VPC / Subnets / Security Groups

Data Stack

RDS / Secrets Manager

Shared Stack

ECR / ECS Cluster / ALB

Security Stack

IAM / WAF / KMS

PR 环境层：按需创建和销毁

PR-101

S3 / ECS Service / Task Definition / 独立路由

PR-102

S3 / ECS Service / Task Definition / 独立路由

PR-103

S3 / ECS Service / Task Definition / 独立路由

需要特别注意：如果多个 PR 共用 ALB，就需要为每个 PR 创建独立 Target Group 和 Listener Rule，利用独立域名或路径路由。共享 RDS 也必须做好数据隔离，例如独立 Schema 或独立测试数据库。不能让不同 PR 随意修改同一份测试数据。

CloudFront 也可以共享，通过不同域名或路径配置不同的 Origin 和缓存策略。

### 5. GitHub Actions 如何触发 CDK？

下面是一个简化的 PR 工作流：

```
name: PR Preview

on:
  pull_request:
    types: [opened, synchronize, reopened]

permissions:
  contents: read
  id-token: write

jobs:
  deploy:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Configure AWS Credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_ROLE_ARN }}
          aws-region: ap-southeast-2

      - name: Test Go
        run: |
          cd services/go-api
          go test ./...

      - name: Build Docker
        run: |
          docker build -t go-api:${{ github.sha }} \
            services/go-api

      - name: Deploy Preview
        run: |
          cd infrastructure
          PR_NUMBER=${{ github.event.pull_request.number }} \
          npx cdk deploy Preview-${{ github.event.pull_request.number }} \
            --require-approval never
```

这段代码展示的是流程骨架。真正落地时还需要完成 ECR 登录、镜像推送、镜像 Digest 传递、前端构建上传，以及 CDK Stack 对应镜像版本的绑定。

GitHub Actions 通过 OIDC 获取 AWS 临时凭证，不建议把长期 AWS Access Key 放在 GitHub Secrets 中。AWS 官方也推荐使用这种身份联邦方式。

[image](https://www.google.com/s2/favicons?domain=https://docs.aws.amazon.com\&sz=32)

AWS Identity and Access Management+1



另外，CodeBuild 也可以直接监听 GitHub PR 事件，执行构建和测试。CDK 提供 GitHub Source 和 Webhook 配置。

[image](https://www.google.com/s2/favicons?domain=https://docs.aws.amazon.com\&sz=32)

AWS CDK Reference+1



我的建议：

- GitHub Actions：负责 PR 事件触发、流程编排。
- CodeBuild：负责 Go 测试、Docker 构建、前端构建。
- ECR：负责镜像存储。
- CDK：负责环境部署。
- CloudFormation：负责资源创建、更新和删除。

不建议同时让 GitHub Actions 和 CodeBuild 各自独立触发同一套部署，否则容易出现重复构建和重复部署。

## 七、生产环境灰度发布

你提到：

> prod 上线配置需要灰度，SAM 本身就可以实现。

这个理解有一部分是正确的。

需要把 Lambda 灰度和 ECS 灰度分开。

### 1. Lambda 灰度发布：SAM + CodeDeploy

例如旧版本是 V1，新版本是 V2。

发布过程：

Lambda Canary 发布示例

V1 旧版本

当前生产版本

V2 新版本

发布中

第一阶段：10% 新版本，90% 旧版本

观察 10 分钟，检查错误率和延迟

第二阶段：100% 新版本

如果 CloudWatch Alarm 触发，则自动回滚。

SAM 配置示例：

```
Resources:
  ReportFunction:
    Type: AWS::Serverless::Function
    Properties:
      CodeUri: lambda/report/
      Handler: bootstrap
      Runtime: provided.al2023

      AutoPublishAlias: live

      DeploymentPreference:
        Type: Canary10Percent10Minutes
        Alarms:
          - !Ref ErrorAlarm
```

这里的 `AutoPublishAlias` 创建并管理 Lambda 版本别名，`DeploymentPreference` 定义流量迁移策略。

如果新版本错误率异常，CodeDeploy 可以根据告警自动回滚。

[image](https://www.google.com/s2/favicons?domain=https://docs.aws.amazon.com\&sz=32)

AWS Serverless Application Model+1



### 2. ECS 灰度发布：CodeDeploy + ALB

Go 服务运行在 ECS Fargate，推荐使用 ECS Blue/Green Deployment。

```
                 ALB
                  |
          +-------+-------+
          |               |
          v               v
      Blue Target      Green Target
          |               |
          v               v
      ECS V1            ECS V2
      Fargate           Fargate
```

发布过程：

1. V1 继续处理全部生产流量。
2. ECS 创建 V2 的新任务。
3. V2 注册到 Green Target Group。
4. 通过测试监听器验证 V2。
5. CodeDeploy 把 10% 流量切换给 V2。
6. 检查 CloudWatch 监控指标。
7. 正常则继续增加流量。
8. 异常则切回 V1。

AWS CodeDeploy 支持 ECS Canary、Linear 和 All-at-once 流量切换。

[image](https://www.google.com/s2/favicons?domain=https://docs.aws.amazon.com\&sz=32)

Amazon Elastic Container Service+1



### 3. 生产发布策略建议

| 服务     | 发布方式                  | 建议              |
| ------ | --------------------- | --------------- |
| 前端 S3  | 版本化资源 + CloudFront    | 先上传新资源，再更新入口文件  |
| Lambda | SAM + CodeDeploy      | Canary 10%      |
| Go ECS | CodeDeploy Blue/Green | Canary 10%      |
| 数据库    | 向前兼容迁移                | Expand-Contract |
| 基础设施   | CDK + CloudFormation  | 先变更评估，再部署       |

特别注意数据库：即使应用版本回滚了，数据库 Schema 也不一定能直接回滚。因此要让新旧版本在迁移期间兼容。

## 八、整个 CI/CD Pipeline 应该是什么样？

把前面的模块组合起来，最终形成下面这条自动化流水线。

## Development Pipeline

1. GitHub

   开发人员提交代码、创建 PR、代码审查。
2. CodeBuild — CI

   Go Test、前端测试、Lint、安全扫描。
3. Docker Build

   编译 Go、构建 Docker 镜像。
4. ECR + S3

   Go 镜像推送 ECR，前端静态文件上传 S3。
5. CDK + CloudFormation

   创建或更新 PR 专属基础设施。
6. Preview Environment

   前端、Go API、Lambda、数据库测试环境。
7. Integration Test

   自动化接口测试、前后端联调、数据库验证。
8. Pull Request Review

   开发人员验收，代码审查，通过后合并。

## Production Pipeline

1. Merge to Main

   触发正式发布流水线。
2. CDK Deploy

   部署生产基础设施和应用版本。
3. Lambda Canary

   SAM + CodeDeploy 灰度发布。
4. ECS Blue/Green

   Go 服务新旧版本并行，逐步切流。
5. CloudWatch Monitoring

   监控错误率、响应时间、CPU、内存和健康检查。
6. Release Complete / Rollback

   验证成功完成发布；异常自动回滚。

## 九、建议按照 6 个阶段进行真实项目实战

我不建议一上来就把所有 AWS 服务堆在一起。按照工程架构的学习目标，我们应该逐步实现，每个阶段都必须有可以运行的成果。

| 阶段      | 学习内容                                 | 实战成果                   |
| ------- | ------------------------------------ | ---------------------- |
| Phase 1 | Go、Docker、PostgreSQL                 | 完成 Go CRUD 服务          |
| Phase 2 | ECR、ECS、Fargate、ALB                  | Go 服务部署到 AWS           |
| Phase 3 | Lambda、API Gateway、WAF、CloudFront、S3 | 完整前后端访问链路              |
| Phase 4 | CDK、CodeBuild、GitHub OIDC            | 自动化 CI/CD              |
| Phase 5 | PR Preview Environment               | 一个 PR 一个完整测试环境         |
| Phase 6 | SAM、CodeDeploy、CloudWatch            | Lambda 和 ECS 灰度发布、自动回滚 |

### 每个阶段的验收标准

Phase 1：

- 能独立开发 Go HTTP 服务。
- 能完成数据库插入、查询、更新和删除。
- 能编写 Dockerfile。
- 本地 Docker 容器可以独立运行。

Phase 2：

- 能创建 ECR Repository。
- 能将 Docker 镜像推送到 ECR。
- 能通过 ECS Task Definition 配置镜像版本。
- 能通过 ECS Service 管理 Fargate Task 数量。
- 能通过 ALB 访问 Go API。
- 能让 Go 服务连接私有 RDS。

Phase 3：

- 能通过 CloudFront 访问前端。
- 能通过 CloudFront 转发 API。
- 能部署 Lambda。
- 能配置 API Gateway。
- 能配置 WAF。
- 能理解整个请求链路。

Phase 4：

- GitHub 提交代码自动触发构建。
- 自动运行 Go 和前端测试。
- 自动构建并推送镜像。
- CDK 自动部署基础设施。
- 不使用长期 AWS 密钥。

Phase 5：

- 创建 PR 自动部署独立环境。
- 不同 PR 之间互不影响。
- PR 更新自动更新环境。
- PR 关闭自动清理资源。
- 能够访问每个 PR 对应的前端和后端。

Phase 6：

- Lambda 支持 10% Canary。
- ECS 支持 Blue/Green。
- CloudWatch Alarm 能够触发回滚。
- 能够验证新旧版本兼容。
- 能够独立设计完整生产发布方案。

## 十、我们最终要完成的项目

我建议将这个项目命名为：

综合实战项目

# AWS Cloud Native Application Platform

基于 AWS 的全栈应用自动化部署平台

技术栈

Go

Gin

PostgreSQL

Docker

ECR

ECS

Fargate

Lambda

API Gateway

ALB

CloudFront

WAF

S3

CDK

CodeBuild

CodeDeploy

SAM

CloudWatch

GitHub Actions

最终交付成果

1. 一套可运行的 Go 后端服务。
2. 一套可运行的前端项目。
3. 一套 AWS 基础设施代码（IaC）。
4. 一套完整 CI/CD 自动化流水线。
5. 一套 PR 独立预览环境系统。
6. 一套生产环境灰度发布与自动回滚机制。
7. 一份完整的工程架构设计文档。

## 十一、正式开始前，先确定三个技术选型

这三个选择会影响后面整个工程的实现方式。

1\. 基础设施代码使用什么？

AWS CDK（TypeScript）—— 推荐，使用代码定义所有 AWS 资源。

AWS SAM —— 更适合专门管理 Serverless/Lambda。

CDK + SAM —— CDK 管整体基础设施，SAM 管 Lambda。

2\. CI/CD 使用什么？

GitHub Actions + CodeBuild + CDK —— 推荐。

CodePipeline + CodeBuild + CDK —— AWS 原生流水线。

GitHub Actions + CDK —— 尽量减少 AWS 构建服务。

3\. 数据库使用什么？

RDS PostgreSQL —— 推荐，适合 Go 业务服务。

RDS MySQL。

Aurora PostgreSQL —— 更偏生产级和弹性扩展。

4\. AWS 部署区域

悉尼 `ap-southeast-2` —— 已确认。账号创建时自动分配到该区域，控制台不能更改。CDK、GitHub Actions 和后续资源都使用这个区域。

确认选型，开始工程实战&#x20;

我的总体建议： 采用 CDK（TypeScript）+ GitHub Actions + CodeBuild + SAM + ECS Fargate + RDS PostgreSQL。

这套组合既能让你理解 AWS 各个服务的底层职责，又能让你最终具备独立设计一套完整工程架构的能力，而不是只会把服务拼接起来。

官方资料可以从这里开始：

- [AWS CDK 官方文档](https://docs.aws.amazon.com/cdk/v2/guide/home.html?utm_source=chatgpt.com)
- [ECS 官方文档](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/Welcome.html?utm_source=chatgpt.com)
- [CodeBuild 官方文档](https://docs.aws.amazon.com/codebuild/latest/userguide/welcome.html?utm_source=chatgpt.com)
- [SAM 官方文档](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/what-is-sam.html?utm_source=chatgpt.com)

我们最终的验收目标不是完成几个 Demo，而是你能够独立从零设计、部署、维护和迭代这整套系统。