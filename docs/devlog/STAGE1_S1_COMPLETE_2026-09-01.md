# 阶段 1 完成记录：最小手机可用闭环（S1-T3 ~ S1-T6）

- **日期**: 2026-09-01
- **依据**: [执行方案](../review/社区工作者视角-执行方案.md) 阶段 1
- **说明**: 阶段 1 中的 S1-T7（可用性测试执行）需要真人社工参与，属 Gate 1 现场环节，不在本次代码交付内；本记录覆盖全部代码任务。

## 结果

按执行方案完成阶段 1 的五个代码任务，每任务独立提交、可单独回滚：

| 任务 | 提交 | 内容 |
|---|---|---|
| S1-T3 术语中文化 | `647abbe` | 新建 Intake→居民来件、AI 事件化→AI 草拟、创建新 Case→新建事项、关联此 Case→关联此事项、等待外部→等待物业/街道、手动创建 Case→手动创建事项；同步 5 个 E2E 断言与 README/演示脚本 |
| S1-T4 死按钮修复 | `25dd534` | 顶栏搜索回车跳转 `/cases?q=`；通知铃铛接 `/api/cases` 真实汇总（待处理/处理中/超 7 天未更新），事项页支持 `?q/?status/?stalled` 筛选与清除；新增纯函数 `summarizeNotifications` + 4 项单测 |
| S1-T1/T2 移动端 | `bbfed4d` | ≤768px 底部 Tab 导航（侧栏隐藏时的替代入口）、表格卡片化、页头纵排、按钮触控尺寸；新增 375×812 移动黄金链路 E2E（含无横向溢出断言） |
| S1-T5 业务出口 | `a059f87` | "跳过"改为四选一：已答复/仅记录/无效重复/暂不受理（须填原因）；Schema 增 `IntakeIssue.disposition/dispositionNote`（`db push` 已应用）；服务端校验 DISPOSITION_REQUIRED/DEFERRED_NOTE_REQUIRED/歧义拒绝；处置经 `GET /api/intakes/[id]` 可审计；契约单测 4 项 + 不变量 §3-4 + E2E 2 项 |
| S1-T6 默认新建 | `67e15f8` | 无相似候选的 Issue 预填"新建事项"（显示"无相似候选，已选新建"）；有候选不预填、检索失败不预填、已有决策不覆盖（R2 红线：LINK_EXISTING 任何情况不预选）；纯函数 + 4 项单测 + E2E |

另有 2 个修复提交：`b32a44f`（ai-fallback 断言同步基线后文案，**基线遗留失败，非本轮引入**）、`7e82d14`（review-defaults 泛型，修 build）。

## 修改文件

- 页面/组件：`AppLayout`、`intake/page`、`intake/[id]/review/page`、`cases/page`、`cases/[id]/page`、`cases/new/page`、`page`(首页)、`AIDraftCard`、`DuplicateCandidateCard`、`globals.css`
- 服务/API：`confirm-intake-service`、`api/intakes/[id]/confirm`、`api/intakes/[id]`、`api/dashboard`
- 契约/DB：`contracts/schemas`（ISSUE_DISPOSITIONS 等）、`prisma/schema.prisma`
- 新增 lib：`notification-summary`、`review-defaults`（均纯函数 + 单测）
- 测试：E2E 新增 `mobile-golden-path`/`disposition`/`default-create`，更新 `golden-path`/`draft-edit`/`duplicate-refresh`/`api-invariants`/`intake-boundaries`/`ai-fallback`；脚本 `test-confirm-invariants` 增 §3-4

## 验证命令与关键输出

- 单测：domain 33 + contracts 24 + ai 52 + web 32 = **141/141 通过**
- 不变量脚本：`pnpm --filter @onecase/web test:invariants` → **93/93 通过**（含新增 §3-4）
- E2E 全量：`pnpm exec playwright test` → **26/26 通过**
- `pnpm --filter @onecase/web typecheck` 通过；`pnpm --filter @onecase/web build` 通过

## 失败或未验证项

1. ai-fallback 4 例曾失败——基线（图片输入改造）改了错误横幅文案但断言未同步；已修正断言（`b32a44f`）。教训：基线提交时应跑完整 E2E。
2. 移动端验证基于 Chrome DevTools 375×812 + Playwright chromium，**未做真机（安卓/iOS 微信内嵌浏览器）验证**；S4-T5 真机 Spike 前不应声称"微信内可用"。
3. S1-T7 可用性测试（5 位社工、脱敏材料、计时对比）未执行——需线下组织，是 Gate 1 的真正判定条件。
4. 通知铃铛的"超 7 天未更新"基于 `updatedAt`，非办结时限（dueDate 属阶段 2/4 字段）。

## 结构影响

需求经过 web 层（页面/组件/API/服务）与 contracts 层（新增处置枚举与决策 Schema）；domain/ai 包未改动。`IntakeIssue` 新增两个可空列，旧数据不受影响。

## 风险/回滚方式

- 每任务一个提交，`git revert <hash>` 即可独立回退；Schema 新列可空，回滚代码后无需回滚数据库。
- 红线核查：无任何自动关联/合并；预填仅限无候选场景的 CREATE_CASE；隐私遮挡提示未动。

## 审查整改（2026-09-01，对应[当前代码审查报告](../review/当前代码审查报告-2026-09-01.md)）

审查发现 4 个问题，全部确认属实并已修复（每项独立提交）：

| # | 问题 | 修复 | 提交 |
|---|---|---|---|
| P1 | 首次查重失败被误判为"无候选"并预填新建（**本记录上文"检索失败不预填"的声明当时只对刷新路径成立，初始加载路径确有此缺陷，特此更正**） | 初始查询改为 `{ok, list, superseded}` 结构；失败项写入 dupErrors 并加入预填 skip；新增首次 500 E2E | `1e6aeee` |
| P2 | 已在 /cases 时连续全局搜索，页内输入框与列表不同步 | effect 监听 searchParams 同步 q；新增连续两次搜索 + 前进后退 E2E | `c6b1d80` |
| P2 | 通知角标重复计数（同一事项停滞+待处理计 2） | summarizeNotifications 增 `total`（命中任一条件的独立事项数），角标与 aria-label 改用该口径（方案 A）；新增重叠单测 | `a84cd95` |
| P2 | 移动端卡片无字段标签，含义依赖列顺序猜测 | td 增加 data-label + 移动端伪元素展示；行卡片可聚焦、Enter 进入详情；移动 E2E 断言标签内容与键盘可达 | `c10e466` |

整改后回归：单测 **142/142**（domain 33 + contracts 24 + ai 52 + web 33）、Playwright E2E **28/28**、typecheck 与 `next build` 通过。

审查报告第三节所列试点阻断项（认证/对象级授权、Case 编号并发、图片存储、真机与真人证据）对应执行方案阶段 3/4，维持原排期，不在本轮处理。

\

## 下一步

1. 组织 S1-T7 脱敏可用性测试 → Gate 1 判定；
2. 阶段 0（访谈/计时/样表收集）若尚未启动应并行推进——阶段 2 的导入导出模板设计依赖样表；
3. 真机 Spike（安卓微信 PWA 安装路径）排入 S4-T5 前置。
