# AWS Cloud Native Application Platform

当前完成 Phase 1：本地 Go 用户服务。服务写入 PostgreSQL，并用 Docker 独立运行。云上资源还没有创建。

已确认的约束：

- 区域使用悉尼 `ap-southeast-2`（账号创建时自动分配，控制台不能改）
- 学习环境的 Go 服务先跑 1 个 Fargate 任务
- 预览环境共用 RDS，用独立 schema 隔离数据

## 本地运行

```bash
cd services/go-api
docker compose up --build
```

Postgres 账号密码只用于本机：`app` / `app`。API 默认监听 `http://localhost:8080`，数据库映射到本机 `5432`。端口被占用时可以改掉再启动，例如：`API_PORT=8081 POSTGRES_PORT=5433 docker compose up --build`。

```bash
curl -s http://localhost:8080/health

curl -s -X POST http://localhost:8080/users \
  -H 'Content-Type: application/json' \
  -d '{"name":"Ada","email":"ada@example.com"}'

curl -s http://localhost:8080/users
curl -s http://localhost:8080/users/1

curl -s -X PUT http://localhost:8080/users/1 \
  -H 'Content-Type: application/json' \
  -d '{"name":"Ada Lovelace","email":"ada@example.com"}'

curl -s -o /dev/null -w '%{http_code}\n' -X DELETE http://localhost:8080/users/1
```

只启动数据库、在本机运行 Go：

```bash
docker compose up postgres
export DATABASE_URL=postgres://app:app@localhost:5432/app?sslmode=disable
go run ./cmd/server
```

## 前端

```bash
cd frontend
npm install
npm run dev
```

开发服务器默认是 `http://localhost:5173`，并把 `/users` 和 `/health` 转发到 `API_PROXY`。本机 API 在 8081 时，`frontend/.env` 写 `API_PROXY=http://localhost:8081`。页面可以登记、修改和删除用户。

## 测试

```bash
cd services/go-api
go test ./...
DATABASE_URL=postgres://app:app@localhost:5432/app?sslmode=disable go test ./...
```

未设置 `DATABASE_URL` 时，数据库集成测试会跳过。

## 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/health` | 检查进程和数据库 |
| POST | `/users` | 创建用户 |
| GET | `/users` | 用户列表，`limit` 最大 100 |
| GET | `/users/:id` | 用户详情 |
| PUT | `/users/:id` | 更新姓名和邮箱 |
| DELETE | `/users/:id` | 删除用户 |

重复邮箱返回 409。邮箱会转成小写后保存。
