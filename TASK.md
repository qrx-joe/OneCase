# OneCase MVP 执行任务

状态：保留原始执行基线；当前实现状态更新于 2026-09-05
来源：`D:\EdgeDownload\OneCase｜社区事项 AI 工作台：深度研究与双文档交付.pdf`
目标：把研究稿转成一个可验证、可演示、可回滚的社区事项 AI 工作台 MVP。

当前进度：文字流程与单张图片输入已实现，Qwen/OpenAI/StepFun 的文字和图片消息已接通。2026-09-05 运行态为 `stepfun / step-1o-turbo-vision`，一条合成图片 Intake 已真实完成分析、通过 Schema 并进入 Review；这只证明链路可运行，不代表识别质量验收。最近复跑 AI 74、Web 64、Contracts 25、Domain 33 项单元测试及独立临时数据库上的 93 项业务不变量；三条黄金链路脚本（golden-path 的分析步骤走真实 stepfun 调用）全绿。原「尚未闭合」四项已闭合：R4 落库失败即时恢复（代码+R4 回归测试）、E2E 数据库/Provider 隔离（专用端口 3100 + e2e-demo.db + 强制 Mock）、视觉能力精确判断（模型级白名单 `imageModelSupported`，未知模型不冒认）、Review 页展示实际 provider/model。仍开放：真实识别**验收线待本人拍板**——探索轮已于 2026-09-05 完成（step-1o-turbo-vision，30 次真实调用：自动字段检查 23/26 通过，注入样本 I08 模型跟随了恶意地点指令，无事项输入暴露 Schema ≥1 事项边界，4 样本待人工审核；详见 [评估记录](docs/devlog/REAL_MODEL_QUALITY_EVAL_2026-09-05.md)），拍板前 README「真实识别未验收」口径不变。SQLite→PostgreSQL 已拍板参赛阶段不迁移（[ADR-003](docs/adr/003-sqlite-postgresql-timing.md)）。详见 [图片验证记录](docs/testing/image-intake.md)与 [StepFun 闭环审查](docs/review/StepFun接入闭环审查-2026-09-05.md)。本项目由 1 人独立开发，AI+民生个人参赛；报名与材料状态见 [提交说明](docs/competition/preliminary-2026/README.md)。下文的阶段计划及早期问题不自动代表当前事实。

## 0. 执行模型必须遵守的工作方式

1. 先阅读本文件、`docs/product/PRD.md`、`docs/architecture/TECH_SPEC.md`，再检查当前仓库。
2. 不把 PDF 中的版本号、价格、法规状态视为当前事实；使用前查官方资料并记录核验日期。
3. 先完成 Mock 黄金链路，再接真实 AI Provider。任何时候 AI 失败都必须允许手动完成 Case 创建。
4. 每次只推进一个可独立验证的小阶段，不跨阶段顺手扩 scope。
5. 不新增未获授权的生产依赖，不写真实居民数据，不提交密钥。
6. AI 只能生成 Draft；创建、关联、关闭 Case 必须由用户操作触发。
7. 每阶段结束按“communicating”模板汇报，验证失败必须原样说明。

## 1. question

以下问题会影响实现，但不会阻塞 Mock-first 基础开发。建议默认值写在括号中：

1. 本轮目标是 72 小时黑客松 Demo，还是可持续的试点基础？（默认：先交付 72h Demo，但保留试点边界）
2. Demo 最终运行在哪里？（默认：本机可完整运行；云部署单独授权后处理）
3. 首选 AI Provider 和已具备的凭据是什么？（默认：先实现 `MockProvider`，再接 Qwen）
4. 是否要求图片/截图在首轮真实调用多模态模型？（默认：是；但 Mock 路径必须独立可演示）
5. 是否有真实匿名样例和社区类别字典？（默认：没有，使用明确标记的合成数据）
6. Demo 是否需要真实登录？（默认：Seeded Demo User，不实现完整认证；接口保留 organization scope）
7. 视觉交付标准是工程可用还是比赛高保真？（默认：黄金链路高保真，其余页面功能优先）
8. 团队人数和可用时间是多少？（未知；这会影响并行度和砍范围顺序）

在得到回答前，执行模型可以完成：项目骨架、Domain、Mock AI、Seed 数据、黄金链路和测试。不得自行执行部署、付费或外部系统写入。

## 2. to do

### Phase 0 - 固化基线

- 阅读三份文档并输出不超过 15 条的决策摘要。
- 检查目录、Git、Node/pnpm、PostgreSQL/Docker 可用性。
- 建立 `README.md`、`.env.example`、`docs/adr/` 和最小运行说明。
- 将实际采用的版本写入 lockfile，不照抄研究稿的漂移版本。
- verify：仓库状态、版本输出、文档链接均可追踪；没有密钥和真实个人信息。

### Phase 1 - Domain first

- 建立 Modular Monolith 工程边界：`web`、`domain`、`db`、`ai`、`contracts`。
- 实现 Intake、IntakeAnalysis、Case、CaseSource、CaseAction、DuplicateCandidate 的最小模型。
- 实现 Case 状态机、Priority Policy、Confirm Transaction、Optimistic Lock、Idempotency。
- 先写 Domain Unit Tests：合法/非法状态迁移、多 Issue confirm、人工关联边界、租户隔离。
- verify：定向测试、typecheck；AI Provider 尚未接入也能通过。

### Phase 2 - Mock 黄金链路

- Seed 至少 6 个 Case、8 个 Intake，包含一个多事项输入和一个 Hard Negative。
- 实现：文字输入 -> Mock Structured Extraction -> Human Review -> Duplicate Candidate -> Link/Create -> Case Detail -> Timeline -> Dashboard。
- 页面必须显示 `AI 草稿·待确认`、缺失字段、匹配依据和 Demo 数据标识。
- 实现 Demo Reset；Reset 只能在 Demo Mode 使用。
- verify：Playwright 覆盖“一条 Intake 拆成两个 Issue，其中一个关联、一个新建”的完整路径。

### Phase 3 - 真实 AI 与重复检测

- 定义 provider-neutral 接口，保留 `MockProvider`。
- 输入视为 untrusted data；Structured Output 后必须执行 Zod/runtime validation。
- Provider 超时、非法 Schema、有限重试与手动 fallback 都必须可测试。
- 使用 canonical case text 生成 embedding；小规模先 exact cosine。
- Duplicate 只返回 Top 3 候选；初始 heuristic 必须标注为未校准，不自动合并。
- verify：Contract Tests、异常路径、至少 20 条小型合成 Eval；记录模型/Prompt/Schema 版本。

### Phase 4 - Demo readiness

- 完成 6 个核心页面状态：loading、empty、error、success、permission denied、AI unavailable。
- 准备 `DEMO_MODE`、Mock fallback、本地 Seed/Reset、90 秒录屏脚本。
- 跑 lint、typecheck、unit、integration、E2E、build。
- 检查 diff、依赖 License、README、`.env.example`、敏感信息。
- verify：断网或 Provider 不可用时，黄金链路仍能用 Mock/手动方式演示。

## 3. next to do

MVP 验收后再做，不能提前侵入 72h 范围：

1. 访谈 5-10 位真实一线工作人员，建立当前流程计时和真实分类字典。
2. 在合法授权和脱敏前提下建立 100-200 条 Intake、150+ Duplicate Pair 的 Gold Dataset。
3. Shadow Mode：AI 只生成结果，不改变现有工作流。
4. 校准地点标准化、类别、Priority Matrix、Duplicate threshold 和权重。
5. 实现正式认证、RBAC、RLS/数据库级隔离、留存删除流程、审计查询。
6. 根据目标客户重新选择中国区云、对象存储、AI Endpoint 和合规方案。
7. 只有出现任务堆积或吞吐证据后，再引入 Redis/BullMQ 或云队列。
8. 只有 exact search benchmark 不满足目标后，再评估 HNSW 或独立向量数据库。
9. 只有客户明确需要，再做企微/12345/外部治理系统集成。

## 4. communicating

每个阶段开始时输出：

```text
阶段：
目标：
完成标准：
准备修改的层和文件：
本阶段不做：
```

每个阶段结束时输出：

```text
结果：
修改文件：
验证命令与关键输出：
失败或未验证项：
结构影响：需求经过哪些层；哪些层未修改及原因：
风险/回滚方式：
下一步：
```

遇到以下情况立即暂停并询问：部署、付费、真实外部消息、生产数据、凭据、删除重要内容、公共 API 破坏性调整、跨模块显著扩 scope。

## 5. advice

### 建议

- 核心卖点不是“AI 总结”，而是 `Message -> Draft -> Human Decision -> Case`。
- 第一个 Demo 必须展示 `1 Intake -> 2 Issues` 和 `Multiple Intakes -> 1 Case`，否则差异化不成立。
- 先做 Mock 黄金链路能把产品、Domain 和 UI 风险与 Provider 风险解耦。
- Duplicate 优先保证 Precision；错合并会让真实事项消失，后果比漏掉重复更严重。
- Dashboard 只消费已确认 Case，不直接统计 AI Draft。
- 不要在 MVP 中加入 Multi-Agent、RAG、GIS、真实微信、复杂 SLA、微服务或 Kubernetes。

### 当前没有把握的点

- 真实社区工作人员是否愿意使用新的工作台，以及使用入口应嵌入哪里。
- 8 个一级类别是否符合目标社区；研究稿只给了通用假设。
- 中文地点标准化和 Duplicate heuristic 在真实数据上的准确性。
- PDF 中列出的框架版本、模型能力、价格和法规状态是否仍为当前状态。
- 72 小时内高保真 UI、真实多模态、完整测试能否全部完成，取决于团队人数和现有资产。

### 用户/项目目前遗漏的信息

- 比赛准确截止时间、提交格式、路演设备和网络条件。
- 团队成员、分工、可投入时长和熟悉的技术栈。
- AI Provider、云环境、数据库环境及是否已有账号。
- 品牌视觉、目标屏幕尺寸和 Demo 语言。
- 可合法使用的样例数据、类别字典、地点层级与标注规则。
- MVP 的明确验收人，以及“完成”是本机运行、录屏、在线 Demo 还是代码仓库交付。

## 6. 最终完成标准

- 核心黄金链路可重复运行，不依赖临场网络。
- 所有 AI 结果可编辑且不会未经人工确认成为业务事实。
- 一个 Intake 可以产生多个 Draft；多个 Intake 可以关联一个 Case。
- 异常情况下仍可手动创建 Case。
- 至少有 Domain tests 和一条黄金链路 E2E。
- 文档、代码、Demo 数据不声称未测得的效率或准确率。
