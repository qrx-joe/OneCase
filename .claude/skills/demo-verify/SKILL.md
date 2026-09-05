---
name: demo-verify
description: 当需要演示或录屏 OneCase 之前，或改动触及黄金链路（intake → AI 分析 → review 确认 → case → dashboard）之后需要完整回归验证时使用。按固定顺序完成：环境自检 → 数据库准备/重置 → 起服务 → 三条端到端脚本 →（可选）Playwright 全量 E2E。
---

# demo-verify —— 演示前重置 + 黄金链路完整验证

全部命令在仓库根目录、用 **bash + pnpm + node** 执行（写死，不临场换工具）。

## 第一步：环境自检

```bash
bash scripts/check-tools.sh
```

退出码非 0 先修环境，不往下走。

## 第二步：数据库准备

```bash
pnpm install                                  # pnpm-lock.yaml 没变可跳过
pnpm --filter @onecase/db db:push             # 建表（CI 同款）
```

⚠️ 演示彩排 / 黄金链路改动的回归，再执行重置（**清空业务表并重新 seed，只允许在数据可丢弃的演示库执行，执行前必须向操作者确认一遍**）：

```bash
pnpm --filter @onecase/db db:reset
```

## 第三步：起服务

```bash
pnpm --filter @onecase/web dev     # 后台跑，等 http://localhost:3000 可访问再继续
```

## 第四步：三条端到端脚本（顺序不换，判定「可演示」的硬标准）

```bash
node apps/web/scripts/test-golden-path.mjs    # 创建→分析→确认：一关联一新建 + 幂等
node apps/web/scripts/test-status-change.mjs  # 状态机 6 场景（含非法迁移/版本冲突）
node apps/web/scripts/test-manual-create.mjs  # AI 失败兜底 → 手动建 Case 回关 Intake
```

手跑前确认数据库是刚 reset 过的干净状态（见意外矩阵）。

## 第五步（时间允许）：Playwright 全量

```bash
pnpm --filter @onecase/web test:e2e           # 含移动端 375×812 黄金链路
```

## 降级方案

- dev 起不来（端口占用 / webpack 缓存损坏）：按 CLAUDE.md 意外矩阵处理（重启 dev、build 后重启 dev）；仍不行则 `pnpm --filter @onecase/web build` 验证编译 + `pnpm test:invariants`（服务级不变量不依赖浏览器）。
- Playwright 浏览器未装：`pnpm --filter @onecase/web exec playwright install chromium`。

## 去哪查

- 演示话术与页面步骤：`docs/demo/DEMO_SCRIPT.md`（90 秒脚本）。
- pnpm：https://pnpm.io/installation （国内源拉不动按 CLAUDE.md 意外矩阵走镜像，不静默换方案）。

## 判定与纪律

- 三条脚本全绿 = 可演示；任何红 = 修完重跑，**不带病演示**。
- 验证结果如实记录（过/不过、哪个脚本、关键输出一行），失败原样贴，不粉饰。
