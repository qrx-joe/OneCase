# OneCase - 社区事项 AI 工作台

**版本**: v0.1 MVP
**状态**: 黄金链路已闭环 (可演示)
**更新**: 2026-08-28

---

## 项目简介

OneCase 是面向社区工作人员的 AI Intake & Case Management Layer。

**核心判断**:
```
Message != Case
AI Draft != Business Fact
```

**黄金链路** (已全部实现并验证):
```
居民反馈 → AI 结构化提取 (1..N 草稿)
→ Duplicate 候选 (含 Hard Negative 保护,Top3+匹配依据)
→ 人工确认: 关联已有 Case / 创建新 Case (原子事务+幂等)
→ Case Detail (居民来源 + Activity Timeline)
→ 状态流转 (状态机校验 + 乐观锁 + 合法迁移下拉)
→ Dashboard 真实统计 (只计已确认 Case)
```

---

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

演示或测试污染数据后一键恢复:

```bash
pnpm --filter @onecase/db db:reset    # 清空业务表 + 重新 seed
```

---

## 演示流程 (90 秒)

| 步骤 | 操作 | 预期 |
|------|------|------|
| 1 | 首页 | KPI 为真实统计 (待处理 2 / 处理中 3 / 高优先级 3) |
| 2 | 点"＋ 新建 Intake" | 进入输入页 |
| 3 | 粘贴: `王主任,我们三栋二单元那个灯又坏了,我妈昨天晚上回来差点摔倒。另外楼下垃圾今天也没人清。` | — |
| 4 | 点"AI 整理为事项" | 步骤化 Processing 动画 → 跳转 Review |
| 5 | Review 页 | **2 个 AI 草稿** (照明 P2 / 垃圾 P3),紫色"AI 草稿·未写入 Case"标识 |
| 6 | 看右侧候选 | **CASE-018 (1.00, 地点一致/类别一致) 首位**;CASE-011 标注"位置不同" (Hard Negative) |
| 7 | 事项 1 点"关联此 Case" | 决策区显示"✓ 将关联 CASE-018" |
| 8 | 事项 2 点"创建新 Case" | — |
| 9 | 点"确认全部决策" | 弹出结果: 关联 1 + 创建 1 |
| 10 | 打开 `/cases/CASE-018` | 居民来源 +1,Timeline 出现关联审计 |
| 11 | 状态下拉选"→ 已解决" | Badge 更新,Timeline 追加状态变更 |
| 12 | 回首页 | KPI 数字联动变化 |

**核心卖点演示**: `1 Intake → 2 Issues` (拆分) + `多 Intake → 1 Case` (关联) — 步骤 5-9 一次展示。

---

## 测试

```bash
pnpm --filter @onecase/domain test   # Domain 33/33 (状态机/优先级/评分)
pnpm --filter @onecase/ai test       # AI 26/26 (Mock/Qwen/OpenAI/Contract/超时/重试)

# 端到端 (需 Dev Server 运行在 3000,脚本需先 db:reset)
node apps/web/scripts/test-golden-path.mjs    # 黄金链路 (创建→分析→确认,一关联一新建+幂等)
node apps/web/scripts/test-status-change.mjs  # 状态变更 6 场景 (含非法迁移/版本冲突)
node apps/web/scripts/test-manual-create.mjs  # 手动创建 Case (AI 失败兜底,关联回原始 Intake)

# Playwright UI 链路 (自动 db:reset,用例间隔离)
pnpm --filter @onecase/web test:e2e           # 黄金链路 + 草稿编辑

pnpm --filter @onecase/web build     # 构建验证
```

---

## 项目结构

```
packages/
  domain/     纯业务逻辑 (状态机/优先级/评分) — 无框架依赖
  contracts/  Zod Schemas
  ai/         Provider 抽象 + Mock/Qwen/OpenAI + Factory
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

`AI_PROVIDER=mock` (默认,断网可用)。Qwen/OpenAI 已实现 (packages/ai),接入时设 `QWEN_API_KEY` 并改工厂配置 — 业务层只依赖 `ExtractionProvider` 接口,切换无侵入。

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

- 认证/RBAC/租户硬隔离未实现 (organizationId 仅过滤,未校验归属)
- Case 编号 `count()+1` 并发可重号 → 改序列
- Embedding 重复检测未接 (当前为标题/地点/类别启发式)
- SQLite → PostgreSQL 迁移
- webpack 缓存损坏: 改 lib 文件后热重载可能 500,重启 `pnpm dev` 即恢复;`next build` 与运行中的 dev server 共写 `.next`,build 后建议重启 dev
