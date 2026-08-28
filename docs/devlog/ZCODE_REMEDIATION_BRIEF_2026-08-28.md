# OneCase 元反思整改执行单（交给 ZCode）

日期：2026-08-28  
基线：`master` / `e5cbd1e`  
用途：根据代码审查与真实 API 反例，修复业务完整性问题，并验证新增能力没有破坏既有黄金链路。

## 1. 结论摘要

当前实现的 UI Happy Path 基本成立：AI 草稿可以编辑，手动创建 Case 可以运行，黄金链路和原状态机测试也通过。但服务端没有守住两个核心业务不变量，因此暂时不能视为完成最终验收：

1. 每个 AI Issue 必须且只能有一个人工决策，全部完成后才能把 Intake 标记为 `CONFIRMED`。
2. 手动兜底只能处理未完成 AI 分析的 Intake，不能绕过已经成功生成的多 Issue Review。

此外，草稿编辑后 Duplicate 候选会过期；真实 Provider 配置失败会在所有环境静默切换 Mock；手动创建没有校验来源 Intake 与 Case 的组织一致性。

## 2. 执行原则

- 只做与下列问题直接相关的最小修改，不重构无关模块。
- 保留现有 API 主体和 UI 交互，避免破坏已通过的黄金链路与状态流转。
- 所有业务不变量必须在服务端/事务内校验，不能只依赖 UI。
- 新增失败测试或最小复现后再修复；修复后保留为回归测试。
- Mock 自动降级只能由明确的 Demo 配置授权，不能在未知或生产环境静默发生。
- 不新增生产依赖，不修改数据库技术选型，不实现完整认证/RBAC。

## 3. P1：Confirm 必须覆盖全部 Issue

### 现状与证据

文件：`apps/web/src/lib/confirm-intake-service.ts`

服务只遍历客户端提供的 `issueDecisions`，随后无条件把 Intake 更新为 `CONFIRMED`。真实 API 已复现：

```text
issueDecisions: []
HTTP 200
createdCases: []
linkedCases: []
Intake.status: CONFIRMED
```

### 修复要求

在 `prisma.$transaction` 内，读取 `analysisIssues` 后、执行任何决策前校验：

1. `analysisIssues` 至少有一个元素。
2. `issueDecisions.length === analysisIssues.length`。
3. `issueDecisions` 中的 `issueIndex` 不重复。
4. 决策中的 issueIndex 集合与 Analysis 的 issueIndex 集合完全一致。
5. decision 只能是 `CREATE_CASE | LINK_EXISTING | REJECTED`；不要只依赖 TypeScript 类型。
6. `LINK_EXISTING` 必须有 `targetCaseId`；其他决策不应携带产生歧义的目标。
7. 任一校验失败时整个事务不产生 Case、CaseSource、CaseAction，也不改变 Intake 状态。

建议使用稳定错误码，例如：

```text
ISSUE_DECISIONS_INCOMPLETE
DUPLICATE_ISSUE_DECISION
INVALID_ISSUE_DECISION
```

API 对客户端参数错误返回 400/422，不要统一返回 500。

### 必须新增的测试

- 空决策数组被拒绝，Intake 保持 `ANALYZED`。
- 少一个 Issue 的部分决策被拒绝。
- 重复 issueIndex 被拒绝。
- 多出不存在的 issueIndex 被拒绝。
- 完整的一关联、一创建仍成功。
- 全部 `REJECTED` 是否允许：按当前产品语义可允许，但必须是所有 Issue 都显式 `REJECTED`。

## 4. P1：手动兜底不能绕过已完成的 Analysis

### 现状与证据

文件：`apps/web/src/lib/create-case-service.ts`

当前只拒绝 `sourceIntake.status === 'CONFIRMED'`。真实 API 已复现：一个成功分析出 2 个 Issue 的 Intake，可以直接调用 `/api/cases` 创建 1 个 Case；随后正常 Confirm 因 `INTAKE_ALREADY_CONFIRMED` 被拒绝，剩余 Issue 丢出业务闭环。

### 修复要求

传入 `sourceIntakeId` 时，在同一事务中同时读取 Intake 和对应的 IntakeAnalysis，并要求：

- Intake 尚未 `CONFIRMED`。
- Intake 不得是 `ANALYZED`。
- 不得存在 `COMPLETED` Analysis。
- 允许的兜底状态应明确收敛为：Intake 为 `PENDING`，且 Analysis 不存在或状态为 `FAILED`。
- 如果存在成功 Analysis，返回明确错误码，例如 `INTAKE_REQUIRES_REVIEW`，引导用户回到 `/intake/[id]/review`。
- 创建 Case、创建 CaseSource、写审计、更新 Intake 必须继续处于一个原子事务内。

### 必须新增的测试

- `PENDING + 无 Analysis` 可以手动兜底。
- `PENDING + FAILED Analysis` 可以手动兜底。
- `ANALYZED + COMPLETED Analysis` 必须拒绝，且 Case 数量、CaseSource、Intake 状态均不变。
- 已 `CONFIRMED` Intake 继续拒绝重复关联。
- 测试必须真实构造 FAILED/COMPLETED Analysis，不能再用“完全不调用分析”等同于所有 AI 失败场景。

## 5. P2：编辑草稿后使 Duplicate 候选失效

### 现状

文件：`apps/web/src/app/intake/[id]/review/page.tsx`

Duplicate 候选仅在页面初次加载时根据 AI 原始标题、类别、地点查询。用户编辑标题或地点后，候选、分数和 Hard Negative 提示不会更新。

### 修复要求

采用最小且安全的方案：

- 当标题或地点被编辑为与上一次候选查询不同的值时，将该 Issue 的候选标记为过期。
- 清除该 Issue 已选中的 `LINK_EXISTING` 决策，避免继续提交旧候选。
- 重新请求 `/api/duplicates/find` 后才允许选择关联目标。
- 可以使用短 debounce，或提供明确的“重新检查相似 Case”按钮；不要每次按键都发请求。
- 类别如果未来开放编辑，也必须纳入同一失效逻辑。
- Duplicate 查询失败不能阻断创建新 Case，但不得继续展示旧候选为当前结果。

### 必须新增的测试

- 修改地点后，原候选/关联选择被清除。
- 重新检索使用人工编辑后的标题和地点。
- 从“3栋2单元”改为“3栋1单元”后，候选说明不再沿用旧地点判断。
- 不编辑草稿时，原黄金链路行为保持不变。

## 6. P2：Mock 自动降级仅限明确 Demo Mode

### 现状

文件：`apps/web/src/lib/ai-provider.ts`

未知 `AI_PROVIDER` 被当作 mock；Qwen/OpenAI 缺少 Key 等配置错误也会静默返回 `MockProvider`。这会让显式配置真实 Provider 的环境产生预制 Mock 草稿，却表现为分析成功，手动兜底也不会出现。

### 修复要求

- `AI_PROVIDER` 非 `mock | qwen | openai` 时直接报配置错误。
- `AI_PROVIDER=mock` 仍可正常使用。
- Qwen/OpenAI 配置失败时：
  - 仅当明确的 Demo 开关允许自动 fallback 时切换 Mock，例如 `DEMO_MODE=true` 且 `AI_ALLOW_MOCK_FALLBACK=true`。
  - 其他环境必须抛错，让 Analyze API 写入 FAILED Analysis、将 Intake 恢复到允许重试/手动兜底的状态，并返回 AI unavailable。
- Audit 必须继续记录实际生效的 Provider；发生 Demo fallback 时，响应或 UI 应能识别这是 Mock，而非真实 Provider。
- 校验 `AI_MAX_RETRIES` 为有限、非负整数；非法配置不要导致请求循环零次后返回模糊错误。

### 必须新增的测试

- 未知 `AI_PROVIDER` 不得静默使用 Mock。
- `qwen` 无 Key、非 Demo Mode 时抛出配置错误。
- 明确 Demo fallback 开启时才使用 Mock，并记录实际 Provider 为 mock。
- 真实 Provider 的运行时 401/429/500/超时仍进入既有失败与重试逻辑。

## 7. P2：保持来源 Intake 与 Case 的组织一致

### 现状

文件：`apps/web/src/lib/create-case-service.ts`

新 Case 的 organizationId 来自请求/默认 Demo 组织；来源 Intake 查询只读取 id/status，没有校验其 organizationId。

### 修复要求

- 查询 sourceIntake 时读取 `organizationId`。
- 要求 `sourceIntake.organizationId === organizationId`，否则返回 `SOURCE_INTAKE_ORG_MISMATCH`。
- 校验必须位于创建 Case 之前并处于同一事务。
- 同时复核 `LINK_EXISTING`：目标 Case 的 organizationId 必须等于 Intake 的 organizationId。若当前没有校验，一并补上，这是同一个业务不变量，不算扩大范围。

### 必须新增的测试

- 跨组织 sourceIntake 手动创建被拒，数据库无写入。
- 跨组织 `LINK_EXISTING` 被拒，数据库无写入。
- 同组织路径保持成功。

## 8. 不要顺手处理的范围

本轮不要实现：

- 完整认证、RBAC 或数据库 RLS。
- SQLite 到 PostgreSQL 迁移。
- Case 编号序列重构。
- Embedding/向量检索。
- UI 设计重做或 CSS 框架迁移；继续使用现有原生 CSS 样式体系。
- 新增生产依赖。

## 9. 验证矩阵

完成修改后依次运行并记录关键输出：

```bash
pnpm test
pnpm typecheck
pnpm --filter @onecase/web build
pnpm test:e2e
node apps/web/scripts/test-status-change.mjs <baseUrl>
node apps/web/scripts/test-manual-create.mjs <baseUrl>
```

补充要求：

- 为本执行单中的服务端反例增加自动化测试，不能只依赖 Playwright Happy Path。
- E2E 前后使用 `pnpm --filter @onecase/db db:reset` 隔离 Demo 数据。
- Windows 上若全仓 `pnpm build` 因 Prisma engine DLL 被 dev server 占用而报 `EPERM rename`，停止或隔离 dev server 后重跑；不要把环境锁写成构建通过。
- 当前 `pnpm lint` 会进入 ESLint 初始化交互，未配置前不能声称 lint 通过。本轮不要为此擅自扩大范围；在交接中标为未验证。
- 真实 Qwen/OpenAI 调用如果没有凭据，不得声称已验证；Mocked fetch、Contract Test 和真实 Provider 验证是不同证据层。

## 10. 最终验收标准

以下条件全部满足才可标记整改完成：

- 空、部分、重复或越界 Issue 决策都不能确认 Intake。
- 只有所有 Analysis Issue 被显式决定后，Intake 才能进入 `CONFIRMED`。
- 成功分析的多 Issue Intake 不能被手动创建旁路吞掉。
- 真正的 AI 失败仍可手动创建，并保留原始 Intake 来源和审计。
- 编辑标题/地点后，不会继续使用旧 Duplicate 候选或旧关联选择。
- 非 Demo 环境不会把真实 Provider 配置错误静默伪装成 Mock 成功。
- Case、目标 Case、来源 Intake 的 organizationId 保持一致。
- 原黄金链路、草稿编辑、手动兜底和状态流转均通过回归测试。
- Web 构建通过；全仓构建、lint 或真实 Provider 未验证时必须如实说明。
- 最终 `git diff` 仅包含本执行单必要改动，没有无关重构。

## 11. ZCode 完成后的交付格式

请按以下结构汇报：

```text
结果：
修复的 P1/P2：
修改文件：
新增/修改测试：
验证命令与关键输出：
失败或未验证项：
结构影响：需求经过哪些层；哪些层未修改及原因：
剩余风险：
回滚方式：
```

