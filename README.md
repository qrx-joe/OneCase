# OneCase - 社区事项 AI 工作台

**版本**: v0.1 MVP
**状态**: 文字与图片链路可演示；StepFun 已真实跑通至 Review，识别质量与异常收尾仍待验收
**更新**: 2026-09-06

---

## 项目简介

OneCase 帮社区工作人员把居民反馈整理成可编辑的草稿，由人决定新建事项或关联已有事项，再跟进来源、状态和处理记录。

**核心判断**:

```
Message != Case
AI Draft != Business Fact
```

**文字演示流程**（Mock 用于验证流程，不代表真实模型效果）：

```
居民反馈 → AI 结构化提取 (1..N 草稿)
→ Duplicate 候选 (含 Hard Negative 保护,Top3+匹配依据)
→ 人工确认: 关联已有 Case / 创建新 Case (原子事务+幂等)
→ Case Detail (居民来源 + Activity Timeline)
→ 状态流转 (状态机校验 + 乐观锁 + 合法迁移下拉)
→ Dashboard 真实统计 (只计已确认 Case)
```

---

## 当前功能范围

| 功能                                   | 当前情况                                                                                                                       |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 演示虚拟登录                           | 固定演示凭据（`onecase / onecase2026`，前端本机会话），打开任意页面先跳登录页；**无后端鉴权**，生产认证在试点前置清单最前                                                    |
| 设置页                                 | 账号资料（读真实会话）、通知偏好（真实控制顶栏铃铛，本机持久化）、AI 识别配置（只读展示实际 Provider/模型，不展示密钥）、分类字典；未实现项统一标「敬请期待」，不冒充可用         |
| 文字整理、草稿编辑、人工确认与事项跟踪 | 已实现，保留原有文字流程                                                                                                                       |
| 业务术语中文化                         | 界面统一为"居民来件/新建事项/关联此事项/等待物业/街道"；API 路径与内部字段名保持英文不变                                       |
| 手机端关键路径                         | ≤768px 底部 Tab 导航、表格卡片化、触控尺寸；已有 375×812 移动黄金链路 E2E，真机/微信内嵌浏览器尚未验证                         |
| 顶栏搜索与通知                         | 搜索回车跳转事项页并带入关键词；通知铃铛显示待处理/处理中/超 7 天未更新（真实统计）                                            |
| 不建事项业务出口                       | "跳过"改为四选一（已答复/仅记录/无效重复/暂不受理须填原因），处置与原因留痕于 IntakeIssue，经 `GET /api/intakes/[id]` 可审计   |
| 无候选默认新建                         | 候选查询确认无相似项时预填"新建事项"，可更改；有候选一律人工选择，绝不预选关联                                                 |
| 截图／图片输入                         | 可选择、拖拽或粘贴；每次 1 张 JPG、PNG 或 WebP，最大 10 MB；支持预览、移除及补充说明                                           |
| 图片保存与失败恢复                     | 点击整理后上传；与原始反馈一同保存，刷新可恢复，重试复用记录；人工确认时可查看原图                                             |
| 真实图片识别                           | Qwen/OpenAI/StepFun 图片消息已接通；当前 StepFun 图片 Intake 已真实完成分析并进入 Review，但没有代表性样本、准确率或稳定性结论 |
| Mock 图片处理                          | 明确返回不能识别，不用固定结果冒充图片识别                                                                                     |
| 语音                                   | 暂未支持，入口已禁用；可自行转写后粘贴文字                                                                                     |
| 消息渠道接入（飞书/钉钉/企业微信）     | **接入层已就绪**：入站 webhook + 按官方文档实现的签名校验/加解密（19 项契约测试）+ 未配置如实 503，见 ADR-004 与 `/api/integrations/status`；凭据未接入、**未与真实平台联调**。个人微信无官方接口。推送回群尚未实现 |
| Embedding 查重                         | 尚未实现（当前为标题/地点/类别启发式）                                                                                         |

2026-09-05 运行态检查为 `stepfun / step-1o-turbo-vision`；一条合成图片 Intake 的分析审计为 `COMPLETED`，耗时 3449 ms，并生成 1 个待人工决策草稿。该证据只证明链路运行，不证明识别质量。`/api/intakes/capabilities` 只检查本地装配，不调用模型；当前 `imageProviderConfigured` 仅按“非 Mock”判断，尚不能严格证明所选模型支持视觉。

项目尚未公开发布，仅使用合成数据演示。图片存入本地数据库，分析时发送给配置的模型服务；目前没有生产级认证、访问控制或数据留存机制，请勿录入真实居民隐私。

## 快速开始

### 环境要求

- Node.js >= 18
- pnpm >= 8

### 运行

```bash
# 1. 安装依赖
pnpm install

# 2. 初始化数据库 + Demo 数据 (SQLite,无需外部服务)
pnpm --filter @onecase/db db:push     # 建表
pnpm --filter @onecase/db db:seed     # 灌入 6 Case / 8 Intake

# 3. 启动
pnpm --filter @onecase/web dev
# → http://localhost:3000
```

### 演示前重置

仅在确认数据可丢弃的独立演示库中使用；此命令会清空业务数据，不能作为日常启动步骤：

```bash
pnpm --filter @onecase/db db:reset    # 清空业务表 + 重新 seed
```

---

## 演示流程 (90 秒)

下面是文字 Mock 演示的 seed 示例，候选、分数及统计以当前页面为准。真实 StepFun 输出不保证与固定 seed 文案一致；图片演示步骤见 [演示脚本](docs/demo/DEMO_SCRIPT.md)。现场未完成合成图片试跑时，只展示上传、保存和转人工，不展示“识别成功”。

| 步骤 | 操作                                                                                           | 预期                                                                                |
| ---- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 1    | 首页                                                                                           | KPI 为真实统计 (待处理 2 / 处理中 3 / 高优先级 3)                                   |
| 2    | 点"＋ 居民来件"                                                                                | 进入输入页                                                                          |
| 3    | 粘贴: `王主任,我们三栋二单元那个灯又坏了,我妈昨天晚上回来差点摔倒。另外楼下垃圾今天也没人清。` | —                                                                                   |
| 4    | 点"AI 整理为事项"                                                                              | 步骤化 Processing 动画 → 跳转 Review                                                |
| 5    | Review 页                                                                                      | **2 个 AI 草稿** (照明 P2 / 垃圾 P3),紫色"AI 草稿·未写入事项"标识                   |
| 6    | 看右侧候选                                                                                     | **CASE-018 (1.00, 地点一致/类别一致) 首位**;CASE-011 标注"位置不同" (Hard Negative) |
| 7    | 事项 1 点"关联此事项"                                                                          | 决策区显示"✓ 将关联 CASE-018"                                                       |
| 8    | 事项 2 点"新建事项"                                                                            | —                                                                                   |
| 9    | 点"确认全部决策"                                                                               | 弹出结果: 关联 1 + 创建 1                                                           |
| 10   | 打开 `/cases/CASE-018`                                                                         | 居民来源 +1,Timeline 出现关联审计                                                   |
| 11   | 状态下拉选"→ 已解决"                                                                           | Badge 更新,Timeline 追加状态变更                                                    |
| 12   | 回首页                                                                                         | KPI 数字联动变化                                                                    |

**核心卖点演示**: `1 Intake → 2 Issues` (拆分) + `多 Intake → 1 Case` (关联) — 步骤 5-9 一次展示。

---

## 测试

```bash
pnpm --filter @onecase/domain test   # 业务规则；本次图片修复未重跑此包
pnpm --filter @onecase/ai test       # Provider、图片传参、Contract、超时与重试
pnpm --filter @onecase/web test      # 图片输入边界、Provider 装配及查重服务
pnpm --filter @onecase/web typecheck

# 端到端 (需 Dev Server 运行在 3000,脚本需先 db:reset)
node apps/web/scripts/test-golden-path.mjs    # 黄金链路 (创建→分析→确认,一关联一新建+幂等)
node apps/web/scripts/test-status-change.mjs  # 状态变更 6 场景 (含非法迁移/版本冲突)
node apps/web/scripts/test-manual-create.mjs  # 手动创建 Case (AI 失败兜底,关联回原始 Intake)

# Playwright UI 链路（专用 3100 端口、e2e-demo.db、.next-e2e，强制 Mock）
# 不复用已有服务；仅重置固定的 E2E 测试库
pnpm --filter @onecase/web test:e2e

pnpm --filter @onecase/web build     # 构建验证
```

2026-09-01 阶段 1（最小手机可用闭环，见 [执行方案](docs/review/社区工作者视角-执行方案.md)）完成后通过：domain 33、contracts 24、ai 52、web 32 共 **141 项单测**；服务层不变量 **93/93**；Playwright E2E **26/26**（含移动端 375×812 黄金链路、不建事项业务出口、无候选默认新建）；Web 类型检查与 `next build` 通过。整改详情见 [阶段 1 完成记录](docs/devlog/STAGE1_S1_COMPLETE_2026-09-01.md)。

2026-09-05 StepFun 接入后复跑：AI **55/55**、Web **36/36**、Contracts **25/25** 单元测试，AI build 与 Web typecheck 通过；独立临时 SQLite、强制 Mock 的业务不变量 **93/93**。未直接运行整套 Playwright E2E，因为当前配置会重置正在使用的数据库并可能复用真实 StepFun 服务。完整审查见 [StepFun 接入闭环审查](docs/review/StepFun接入闭环审查-2026-09-05.md)。

2026-09-06 深夜全量复跑：单测 **213**（domain 33 / contracts 25 / ai 74 / web 81）、业务不变量 **99/99**、Playwright E2E **32/32**（含演示登录 setup 与设置页用例）、web typecheck 与 `next build` 通过。新增演示虚拟登录（`/login` + 前端会话门卫）与设置页（`/settings`），类别文案字典提取为 `lib/category-labels.ts` 单一来源；UI 全功能走查 24/24 通过（真实 StepFun 运行态，脚本 `apps/web/scripts/walkthrough-ui.mjs`）。

**CI**: GitHub Actions (`.github/workflows/ci.yml`) 在每次 push/PR 上自动跑 typecheck、单测（含 20 条合成 Eval）、全仓 build 与 Playwright E2E。

**Eval**: `packages/ai/__tests__/eval.test.ts` 仅对 Mock 基线跑 20 条合成用例（100% 通过 = 可执行规格），指定真实 Provider 会报错。真实 StepFun 评估使用独立的 20 条文字、10 张合成图片事实样本：`pnpm --filter @onecase/web eval:quality` 默认只生成样本、不调用模型；获准后显式指定 `--run` 与请求上限，见 [真实模型评估说明](docs/testing/real-model-quality.md)。

2026-09-05 E2E 隔离补齐后：常规 Playwright **28/28** 通过；服务端缺 Key 的失败模式 **3 项通过、2 项按设计跳过**。常规 E2E 前后演示库文件哈希相同，详情见 [本轮执行记录](docs/devlog/E2E_AND_QUALITY_PREPARATION_2026-09-05.md)。这些结果不代表真实模型质量已通过。

---

## 项目结构

```
packages/
  domain/     纯业务逻辑 (状态机/优先级/评分) — 无框架依赖
  contracts/  Zod Schemas
  ai/         Provider 抽象 + Mock/Qwen/OpenAI/StepFun + Factory
  db/         Prisma Schema (SQLite) + seed + reset
apps/web/
  src/app/
    api/        intakes(创建/分析/确认) cases(列表/详情/状态) duplicates dashboard
    page.tsx    今日工作 (Dashboard)
    intake/     新建 + Review (决策页)
    cases/      列表 + Detail
  src/lib/     prisma / ai-provider / duplicate-service /
              confirm-intake-service / demo-context
  src/components/  AppLayout / Button / Badge / ...
  scripts/     端到端测试脚本
docs/
  product/PRD.md  architecture/TECH_SPEC.md  adr/
```

## AI Provider

默认 `AI_PROVIDER=mock`，文字流程可离线演示，但 Mock 不能识别图片。

启用真实模型时，在启动 Web 服务的环境中设置以下变量，不需要改工厂代码：

| Provider       | 必要配置                                                                                                                                                 |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Qwen           | `AI_PROVIDER=qwen`、`QWEN_API_KEY`，并用 `QWEN_MODEL` 指定支持视觉的模型                                                                                 |
| OpenAI         | `AI_PROVIDER=openai`、`OPENAI_API_KEY`，并用 `OPENAI_MODEL` 指定支持视觉的模型                                                                           |
| StepFun (阶跃) | `AI_PROVIDER=stepfun`、`STEPFUN_API_KEY`；默认 `STEPFUN_MODEL=step-1o-turbo-vision`。已有一次图片链路运行证据，但识别质量未验收；纯文本可换 `step-2-16k` |

本地可将配置放在不入库的 `apps/web/.env.local`，修改后重启服务。不要把密钥写进代码、邮件或参赛附件。仅当 `DEMO_MODE=true` 与 `AI_ALLOW_MOCK_FALLBACK=true` 同时启用时，配置失败才允许退回 Mock；退回后仍不能识别图片。

图片以 `image_url` 消息发送，结构化结果经校验后进入原有人工确认流程。接口和模拟响应测试通过不代表真实识别质量已验证。文件格式、存储方式和接口字段见 [图片输入说明](docs/testing/image-intake.md)。

## 关键约束 (实现于代码中)

1. AI 只生成 Draft;创建/关联/状态变更全部人工触发
2. 草稿可编辑: Review 页标题/地点/优先级可人工修改,确认后以人工值为准并留审计 (AI 原值保留在 IntakeIssue)
3. AI 失败可兜底: 重试不重复建档;可转 `/cases/new` 手动创建,原始反馈自动关联为居民来源
4. 未知字段保持 null/UNKNOWN (缺失信息橙色提示,不猜测)
5. Duplicate 仅 Top3 候选 + 匹配依据,不自动合并 (评分未校准已标注)
6. Confirm 为原子事务;重复提交被拒 (INTAKE_ALREADY_CONFIRMED)
7. 状态迁移由 domain 状态机校验,UI 下拉与 API 校验同源
8. Dashboard 只统计已确认 Case

## 已知限制 (试点前需补)

- 后端鉴权未实现：当前仅有**演示虚拟登录**（固定账号、纯前端本机会话，无权限校验）；真实认证/RBAC/租户硬隔离在试点前置清单最前
- Case 编号 `count()+1` 并发可重号 → 改序列
- Embedding 重复检测未接 (当前为标题/地点/类别启发式)
- 图片识别仍需代表性样本、准确率、稳定性和现场失败演练；语音录音和转写尚未接入
- 图片目前以 data URL 存入 SQLite，仅适合小规模演示；生产存储与权限仍需设计
- AI 成功后若最终数据库事务失败，Intake 可能暂留 `ANALYZING`，当前需等待 10 分钟超时后接管
- Playwright E2E 已隔离专用数据库、3100 端口、构建缓存与 Mock Provider；旧 API 测试脚本不受该隔离配置保护
- SQLite → PostgreSQL 迁移
- webpack 缓存损坏: 改 lib 文件后热重载可能 500,重启 `pnpm dev` 即恢复;`next build` 与运行中的 dev server 共写 `.next`,build 后建议重启 dev

## 参赛材料

当前使用 AI+民生个人参赛版 v2，不使用团队名称。材料入口见 [初赛提交说明](docs/competition/preliminary-2026/README.md)。2026-09-05 晚完成同步、2026-09-06 随复跑刷新：PPTX 正文与备注、PDF、项目简介 Word 已全部对齐 StepFun 接入边界与 200 项实测口径（逐页渲染核对通过，记录见比赛材料 06 §7）；发送前剩 PowerPoint/WPS 实机播放检查。姓名和电话留在报名资料及邮件中，不放入展示材料。邮件尚未发送，报名与资格仍需本人核实。
