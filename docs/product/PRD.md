# OneCase 社区事项 AI 工作台 - PRD

版本：v0.1 Discussion Baseline
适用范围：72 小时 MVP 及后续试点决策
非目标：本文不规定具体框架、数据库版本、云厂商或模型版本。

方向补充（2026-10-09）：目标定位扩展为“基层民生服务 AI 工作台”，首批设计失业人员就业帮扶、老年人助餐与探访两条服务链路。沿用工作人员操作与人工确认；服务对象、下一步行动、转介/回访及结果的最小人工跟进原型已实现，见 [实现记录](../devlog/LIVELIHOOD_PROTOTYPE_2026-10-09.md)。完整 AI 提取和一线服务效果仍未验证。详见 [民生服务扩展方案](./livelihood-service-expansion.md) 与 [合成任务卡](../testing/usability/livelihood-scenario-cards.md)；下文保留 v0.1 事项管理基线，不能作为完整民生服务能力声明。

实现状态补充（2026-09-05）：文字流程已实现；图片／截图支持单张上传、预览、保存及刷新恢复，Qwen/OpenAI/StepFun 图片消息已接通。当前运行态为 `stepfun / step-1o-turbo-vision`，一条合成图片 Intake 已真实分析并进入 Review；没有代表性样本、准确率或稳定性结论。Mock 仍只用于文字流程，不能识别图片。真实语音 ASR 仍不做，页面明确禁用；下文“语音转录”只指外部转写后的文字，不表示应用可以录音。微信来源仍由工作人员手动录入，未接入微信。当前异常收尾、E2E 隔离和运行态可见性缺口见 [StepFun 闭环审查](../review/StepFun接入闭环审查-2026-09-05.md)，验证范围见 [图片输入记录](../testing/image-intake.md)。

## 1. 产品定义

### 1.1 当前事项管理基线

OneCase 是面向社区工作人员的 AI Intake & Case Management Layer。它把微信文字、聊天截图、现场图片、语音转录等尚未成为工单的信息，转化为可编辑、可确认、可关联、可跟踪的社区事项。

核心判断：

```text
Message != Case
AI Draft != Business Fact
```

核心链路：

```text
Resident Intake
-> AI Eventization
-> 1..N Case Drafts
-> Duplicate Candidates
-> Human Review
-> Create or Link Case
-> Case Workflow / Timeline / Dashboard
```

### 1.2 民生服务扩展目标（最小人工跟进原型已实现，一线待验证）

面向基层服务工作人员，把居民表达与主动探访记录整理为待确认的需求，协调就业、养老等服务，并持续跟进结果。候选链路为“需求发现 → 人工确认 → 下一步行动 → 协调转介 → 跟进回访 → 结果记录”。

个人服务事项按服务对象与独立需求跟进：同一人可有多个事项，不同人的同类诉求不能仅凭文字/地点相似合并。公共问题仍可由人核实后关联。资格、审批、服务意愿及未知事实不由 AI 推定；发出转介不等于已提供服务。

范围、两条完整流程、验收与结构影响以 [扩展方案](./livelihood-service-expansion.md)为准。当前原型已实现人工对象引用、行动/回访时间、转介接收与服务结果，保存在现有处理记录中，未新增居民主档或改变数据库 schema。原状态机和事项管理基线保持；个人服务新来件的身份核实/来源关联与真实模型提取仍需后续设计与验证。

## 2. 用户与问题

### 2.1 核心用户

- 社区工作人员/网格员：收集诉求、整理事实、判断重复、跟进处理。
- 社区负责人：查看高风险、积压、反复发生事项。
- 系统管理员：维护类别、权限和后续路由规则。

居民是信息来源，但不是 MVP 的直接操作用户。

### 2.2 关键痛点

- 原始信息分散且不结构化，工作人员需要二次录入。
- 一条消息可能包含多个独立问题。
- 多位居民的不同表达可能指向同一事项。
- 历史处理过程散落在聊天和表格中，难以追踪和统计。

### 2.3 最小价值假设

在不改变居民表达方式的前提下，OneCase 能缩短“原始信息 -> 已确认 Case”的人工整理时间，同时不增加错误合并风险。

## 3. 产品目标与非目标

### 3.1 目标

- G1：降低 Intake 到 Confirmed Case 的整理成本。
- G2：减少同一问题被重复创建为多个 Case。
- G3：集中呈现 Case 事实、来源、负责人、状态和 Timeline。
- G4：让 AI 建议可编辑、可追踪、可审计。
- G5：AI/Embedding 故障时，核心业务仍可手动完成。

### 3.2 非目标

- 不替代 12345 或现有政务工单系统。
- 不建设智慧城市/GIS 调度平台。
- 不做自动执法、责任认定或处罚判断。
- 不让 AI 自动合并、关闭 Case 或向居民发送正式答复。
- 不在 MVP 做 Multi-Agent、RAG、真实微信集成、复杂 SLA/RBAC、移动 App。

## 4. 核心领域规则

1. 一个 Intake 可以产生 1-5 个 Issue Draft。
2. 多个 Intake 可以作为来源关联同一个 Case。
3. Draft 属于 Intake Analysis，不属于 Case 生命周期。
4. 只有用户确认后才能 Create Case 或 Link Existing Case。
5. Duplicate 是候选，不是自动决策。
6. 未知地点、责任主体等字段必须保持 null/UNKNOWN，不得补齐猜测。
7. Dashboard 只统计已确认 Case。

## 5. MVP 范围

### 5.1 P0

- 文字输入。
- 图片/截图输入：单张 JPG / PNG / WebP，最大 10 MB；补充文字选填。选择时仅本地预览，提交后保存；失败可恢复并转人工。
- AI Structured Extraction。
- Multi-Issue Detection。
- Human Review/Edit。
- Create Case。
- Top 3 Duplicate Candidates 与匹配依据。
- Link Existing Case。
- Case List / Detail / Timeline。
- Case Status Change。
- 基础 Dashboard。
- Mock Provider、Manual Fallback、Demo Reset。

### 5.2 P1 - 时间允许

- 简化 Assignee。
- 真实多模态 Provider。
- 基础 Demo 身份与 Manager 视图。

### 5.3 明确不做

真实语音 ASR、微信/企微、12345、GIS、自动回复、知识库 RAG、复杂工作流、复杂权限、微服务。

## 6. 核心用户故事

### US-01 新建 Intake

作为社区工作人员，我可以粘贴文字或上传图片/截图，以便系统生成事项草稿。

### US-02 多事项识别

作为社区工作人员，当一条信息包含多个问题时，我能逐个编辑并分别创建/关联，而不是丢失其中一个问题。

### US-03 人工 Review

作为社区工作人员，我能看到 AI 提取字段、缺失信息和冲突，修改后再确认。

### US-04 重复候选

作为社区工作人员，我能看到最多 3 个相似未关闭 Case、匹配依据，并选择关联或新建。

### US-05 Case 跟踪

作为社区工作人员，我能查看 Case 的来源、状态、优先级、负责人和 Timeline。

### US-06 管理概览

作为负责人，我能查看新增、未解决、高优先级和高频类别；Demo 数字必须明确标记。

## 7. 关键页面

1. Home：待处理、高优先级、最近 Case。
2. Intake Input：文字与图片/截图入口。
3. AI Review：1..N Draft、缺失信息、编辑、AI 标识。
4. Duplicate Panel：候选、匹配依据、关联/新建操作。
5. Case Detail：事实、来源、状态、负责人、Timeline。
6. Dashboard：Case 指标与 Demo 数据标识。

## 8. Case 生命周期

```text
OPEN -> IN_PROGRESS -> WAITING -> RESOLVED -> CLOSED
  ^          |            |          |
  +----------+------------+----------+  (reopen, according to policy)

OPEN / IN_PROGRESS / WAITING -> CANCELED
```

允许迁移矩阵应由 Domain Code 显式定义并测试；UI 不得绕过规则。

## 9. AI 提取契约

每个 Issue Draft 至少包括：

- `title`
- `summary`
- `categoryCode | null`
- `locationText | null`
- `impact: LOW | MEDIUM | HIGH | UNKNOWN`
- `urgency: LOW | MEDIUM | HIGH | UNKNOWN`
- `affectedGroups[]`
- `riskSignals[]`
- `missingInformation[]`
- `evidenceConflict`

AI 不输出最终责任主体或业务结论。Priority 由已提取事实经过确定性规则形成建议，再由用户确认。

## 10. 验收标准

| ID    | Given                  | When               | Then                           |
| ----- | ---------------------- | ------------------ | ------------------------------ |
| AC-01 | 普通居民文字           | 点击 AI 整理       | 返回通过 Schema 的 Draft       |
| AC-02 | 未提供地点             | AI 分析            | 地点为 null/未知，不编造       |
| AC-03 | 一条信息有两个独立问题 | AI 分析            | 展示至少两个可分别处理的 Draft |
| AC-04 | AI 字段错误            | 用户编辑并确认     | 用户值成为 Case 事实           |
| AC-05 | 有相似历史 Case        | 分析完成           | 返回最多 3 个候选和依据        |
| AC-06 | AI 认为相似            | 用户未确认         | 系统不得自动关联               |
| AC-07 | 用户选择关联           | Confirm            | Intake 成为已有 Case Source    |
| AC-08 | 用户选择新建           | Confirm            | 创建唯一 Case ID               |
| AC-09 | 非法状态跳转           | 提交               | 返回明确业务错误，状态不变     |
| AC-10 | AI 超时/Schema 非法    | 分析失败           | 可重试且可手动建 Case          |
| AC-11 | 跨组织访问             | 请求 Case          | 拒绝且不泄漏数据               |
| AC-12 | Case 修改成功          | 查看 Timeline      | 出现可追踪 Activity            |
| AC-13 | 不支持的文件           | 上传               | 拒绝并说明格式/大小限制        |
| AC-14 | 创建请求重试           | 同 Idempotency Key | 不产生重复 Intake              |

## 11. 指标与证据边界

North Star：`Median Time to Confirmed Case`。

候选指标：Schema Valid Rate、Core Field Accuracy、Critical Hallucination Rate、Duplicate Precision/Recall、False Merge Rate、Human Override Rate、Median Review Time、Manual Fallback Success。

所有目标值都是待验证假设，不得表述为已实现结果。Duplicate 先优化 Precision，再提高 Recall。

## 12. Demo 完成标准

使用明确标记的合成数据，重复演示：

```text
一条居民信息
-> 两个结构化问题
-> 一个发现已有相似 Case 并由人关联
-> 另一个创建新 Case
-> Case Timeline 与 Dashboard 更新
```

Provider 或网络不可用时，Mock/Manual 路径仍可完成演示。

## 13. 试点前必须验证的假设

- 真实用户的高频信息入口与现有流程。
- 类别字典、地点层级、Priority Matrix。
- Duplicate Hard Negative 与可接受阈值。
- 真实基线耗时和人工纠错模式。
- 数据授权、脱敏、留存和部署要求。
