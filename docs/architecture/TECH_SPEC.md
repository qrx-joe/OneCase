# OneCase 技术规范与系统设计

版本：v0.1 Discussion Baseline
架构原则：Modular Monolith First
目标：72 小时能交付 Mock-first MVP，后续接真实 Provider 时不推翻 Domain 边界。

## 当前实现补充（2026-08-31）

本文其余部分保留设计基线，不代表全部落地。当前使用 SQLite，图片分析仍为同步请求；尚未实现下文规划的 PostgreSQL 队列、signed URL 或生产权限。

图片从 Intake 页面以 multipart 提交到现有创建接口，服务端检查实际请求大小、MIME 和文件头，在一个事务中写入 Intake 与 Attachment。图片以 data URL 存入 Attachment，不写公开目录。分析接口读取附件，通过 Provider 的 `image_url` 消息提交；模型输出沿用 Zod 校验、失败记录和人工确认。GET 详情支持恢复图片，确认页和手动创建页显示原图。

本次没有迁移数据库或增加依赖，未改查重、正式事项确认及状态机规则。Mock 拒绝图片，不模拟成功；真实模型未实测。完整字段与验证记录见 [图片输入说明](../testing/image-intake.md)。

## 1. 决策原则

优先级：Correctness > Privacy/Security > Maintainability > Observability > Extensibility > Performance > Novelty。

关键不变量：

- AI 理解模糊信息，但不拥有业务写权限。
- Domain Code 执行状态机、优先级和确认规则。
- Database 保存事实与审计。
- 用户触发不可逆业务判断。

## 2. 技术栈选择策略

研究稿建议 Next.js + TypeScript + PostgreSQL + pgvector + Zod + Playwright。实施时应先核验当前官方支持版本，再锁定依赖；不得直接照抄 PDF 中的漂移版本号。

建议基线：

- Web/Application：Next.js App Router 或团队熟悉的等价 TypeScript Web 栈。
- UI：Tailwind CSS + 可审查的组件 primitives。
- Database：PostgreSQL + pgvector；MVP 不引入独立 Vector DB。
- ORM：Prisma/Drizzle 二选一，以团队熟悉度和迁移可控性决定。
- Contracts：Zod + TypeScript。
- Tests：Vitest + 数据库 Integration Tests + Playwright。
- AI：provider abstraction + MockProvider + 一个真实国内多模态 Provider。
- Storage：MVP 可本地/私有对象存储；正式环境使用 private S3-compatible storage。

## 3. 目标目录

可采用 pnpm workspace：

```text
apps/
  web/
  worker/
packages/
  domain/
  db/
  ai/
  contracts/
  ui/
docs/
  product/
  architecture/
  adr/
```

若 72h 单人实现，允许先使用单个 Next.js app，但内部模块边界必须保持，不为目录形式机械拆包。

## 4. 模块边界

- Intake：原始输入、来源、附件元数据。
- Analysis：AI Draft、Schema/Prompt/Model 版本。
- Case：已确认事项、状态、优先级、负责人。
- Duplicate：候选检索、特征评分、人工决策。
- Priority：确定性策略。
- Audit：不可变业务 Activity。
- AI：Provider、Prompt、Schema、Eval。
- Integration：未来外部系统和 Outbox consumer。

禁止：React Component 直接 SQL；Prompt 直接修改数据库；LLM 自动关闭/合并 Case。

## 5. 核心数据模型

### 5.1 必须实体

- `organizations`
- `users`
- `categories`
- `intakes`
- `attachments`
- `intake_analyses`
- `cases`
- `case_sources`
- `case_actions`
- `case_embeddings`
- `duplicate_candidates`
- `ai_runs`
- `ai_jobs`（真实异步 AI 时）
- `outbox_events`（需要外部集成时）

### 5.2 关键字段与约束

- 所有核心业务表携带 `organization_id`。
- `intake_analyses.payload` 支持多个 issues。
- `cases.version` 用于 Optimistic Concurrency Control。
- `case_sources(case_id, intake_id)` 唯一。
- Embedding 记录 `model`、`dimension`、`embedding_version`、`canonical_hash`。
- AI Run 记录 provider/model/prompt/schema/latency/token/status，不默认保存完整敏感 Prompt。
- Raw Intake 与结构化 Case 分离。

## 6. 关键事务

### 6.1 Confirm Intake

输入：`analysisId` 与每个 `issueIndex` 的 `CREATE_CASE | LINK_EXISTING | REJECTED`。

同一数据库事务内：

1. 校验组织、Intake、Analysis 未过期。
2. 校验每个 issue action。
3. 创建 Case 或建立 CaseSource。
4. 更新 Intake 状态。
5. 写 CaseAction/Audit。
6. 必要时写 Outbox Event。

任何一步失败，全部回滚。

### 6.2 Case Update

请求携带 `expectedVersion`。版本不一致返回 `409 CASE_VERSION_CONFLICT`，不得静默覆盖。

## 7. AI Pipeline

```text
Input/Upload
-> File Validation
-> Normalize / EXIF Strip
-> PII Preprocess
-> Multimodal Extraction
-> Structured Output
-> Runtime Validation
-> Domain Normalization
-> Deterministic Priority Suggestion
-> Canonical Case Text
-> Embedding
-> Duplicate Search
-> Review Required
```

### 7.1 Provider 接口

```ts
export interface CaseExtractionProvider {
  extractCaseDraft(
    input: IntakeAIInput,
    context: ExtractionContext,
  ): Promise<RawExtractionResult>;
}

export interface EmbeddingProvider {
  embedCaseText(text: string): Promise<number[]>;
}
```

业务层只依赖接口。必须存在 `MockProvider`；真实 Provider 不得执行 Case mutation、消息发送或任意工具调用。

### 7.2 Prompt 与 Schema

- Resident input 永远放在 data/user payload，不放 system/developer instruction。
- 未知字段返回 null/UNKNOWN/missingInformation。
- 图片与文字冲突时设置 `evidenceConflict=true`。
- 使用 Provider Structured Output 后仍执行 Zod/runtime validation。
- Prompt、Schema、Model 都必须有版本。

### 7.3 失败策略

- Timeout/5xx：有限重试；不得无限 retry。
- Invalid Schema：最多一次 repair，再进入人工路径。
- Primary Provider 不可用：可切 fallback 或 Mock Demo。
- Embedding 不可用：Case 仍可创建，Duplicate 延后。

## 8. Duplicate Detection

Canonical text：title + summary + category + normalized location + risk keywords。

MVP：先 exact cosine，并叠加 tenant/status/time/category filters。初始评分可使用：

```text
0.55 * semantic
+ 0.20 * location
+ 0.15 * category
+ 0.10 * time
```

这是未校准 heuristic，只能用于候选排序。返回 Top 3，不自动合并。

必须包含 Hard Negative：同栋不同楼层、同类别不同设备、同问题不同地点、措辞相似但事实不同。

只有 benchmark 证明 exact 不满足数据规模/QPS/延迟目标后，才启用 HNSW；模型/维数变更必须新建 embedding version，不混用向量。

## 9. API 基线

前缀：`/api/v1`

| Method | Path | Purpose |
|---|---|---|
| POST | `/intakes` | 创建 Intake，支持 Idempotency-Key |
| GET | `/intakes/:id` | 查看 Intake |
| POST | `/intakes/:id/analyze` | 发起分析；真实异步模式返回 202/jobId |
| GET | `/jobs/:id` | 查询分析任务 |
| GET | `/intakes/:id/analysis` | 获取 Draft |
| POST | `/intakes/:id/confirm` | 事务性 Create/Link |
| GET | `/cases` | Case 列表 |
| GET | `/cases/:id` | Case Detail |
| PATCH | `/cases/:id` | 带 expectedVersion 更新 |
| POST | `/cases/:id/status` | 状态迁移 |
| GET | `/cases/:id/activity` | Timeline |
| GET | `/dashboard` | 已确认 Case 指标 |

统一响应：`data`、`error`、`meta.requestId`。错误码至少覆盖认证/权限/租户、文件、AI、Schema、状态迁移、版本冲突、重复关联、限流和内部错误。

## 10. AI Job

72h Mock 路径可同步。真实图片分析建议异步：DB-backed queue + 独立 worker，使用 `FOR UPDATE SKIP LOCKED` 领取任务并设置 retry/timeout 状态。

只有出现明确堆积、并发或延迟任务需求后再引入 Redis/BullMQ/云队列。

## 11. 安全与隐私

- 核心查询必须带组织范围；禁止只按全局 Case ID 查询。
- 附件 private，使用短期 signed URL。
- 校验 MIME、magic bytes、size；试点阶段增加 malware scan。
- 删除 EXIF，避免原图公开永久 URL。
- Raw resident content 不进入普通日志、Embedding 或 AI telemetry。
- 不提交 Token/API Key；使用 `.env.example`。
- AI 输出通过 Schema 与 Domain 双重校验。
- 正式试点前补 RBAC、RLS/数据库角色、留存删除、导出、备份与事件响应。
- 法规和云数据地域要求必须由实际客户与专业评审确认，本规范不构成法律意见。

## 12. Observability

每个请求贯穿 `request_id`、`trace_id`、`organization_id`，但不记录居民完整原文。

最小指标：AI request/error/latency/schema failure/retry/fallback、human override、duplicate accept/false positive、time to confirmed case。

## 13. 测试地图

### Domain Unit

- Case State Machine。
- Priority Policy。
- Duplicate Score/threshold boundary。
- Schema 与 normalization。
- Permission/tenant scope。

### Integration

- API + PostgreSQL transaction。
- Confirm atomicity。
- Optimistic Lock。
- Tenant Isolation。
- Idempotency。
- AI job claim/retry。

### AI Contract/Eval

- Schema valid/invalid。
- null-first、multi-issue、prompt injection、image/text conflict。
- Hard Negative duplicate pairs。
- Provider timeout/5xx/fallback。

### E2E

- 黄金链路 Create Intake -> Analyze -> Review -> Link/Create -> Case Detail -> Dashboard。
- AI down、no duplicate、wrong duplicate、permission denied、version conflict、network retry。

## 14. CI Gate

```text
install --frozen-lockfile
-> lint
-> typecheck
-> unit
-> AI contract tests
-> build
-> integration
-> Playwright E2E
-> dependency/security scan
```

AI Prompt/Model 变更必须跑固定 Eval；不能只凭 JSON 合法或 HTTP 200 放行。

## 15. Demo 环境

- `DEMO_MODE=true`
- Seeded organization/user/cases/intakes。
- `MockProvider` 和可控场景。
- Reset Demo Data 受 Demo Mode 与 token/本地权限保护。
- UI 明确显示 Demo 数据、AI 草稿和待人工确认。
- 录屏与关键素材本地可用，不依赖现场网络。

## 16. 延后决策

- 真实认证提供商。
- 生产云与数据地域。
- PostgreSQL 托管版本。
- ORM 二选一。
- 正式 Qwen/其他 Provider 与模型。
- 对象存储、恶意文件扫描方案。
- RLS 与数据保留期限。
- HNSW/独立向量数据库。

这些决策应由实际团队能力、部署目标、客户要求和 benchmark 触发，不应由研究稿替代。
