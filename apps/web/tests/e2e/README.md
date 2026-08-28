# Playwright E2E 测试说明

## 运行条件

- [x] Playwright 浏览器 (chromium-1234,与 @playwright/test 1.62.x 匹配)
- [x] `channel: 'chromium'` 新 headless 模式,无需单独下载 headless shell
- [x] 端口 3000 (已有 dev server 时直接复用,否则自动启动)

## 测试场景

### 1. 黄金链路 (tests/e2e/golden-path.spec.ts)

TASK.md Phase 2 验收路径,真实断言,任何一步失败即测试失败:

```
1. /intake 填入多事项文本 → "AI 整理为事项"
2. 跳转 Review 页,断言: 2 个草稿 + "AI 草稿 · 未写入 Case" + 缺失字段提示
3. 事项 1 候选区: Hard Negative CASE-011 标注"位置不同";点 CASE-018 "关联此 Case"
4. 事项 2 点"创建新 Case"
5. "确认全部决策" → alert 汇总 "关联 1 个: CASE-018 + 创建 1 个: CASE-XXXX" → 回首页
6. /cases/CASE-018: 居民来源 +1、原始引用、Timeline 出现关联审计
```

### 2. API 级回归 (scripts/test-golden-path.mjs)

不依赖浏览器,覆盖同一链路 + Confirm 幂等 (重复确认被拒、不多建 Case)。

## 运行命令

```bash
pnpm --filter @onecase/web test:e2e                        # Playwright UI 链路
node apps/web/scripts/test-golden-path.mjs                 # API 级 (先 db:reset)
pnpm --filter @onecase/db db:reset                         # 演示前重置数据
```

## 确定性

- `global-setup.ts` 在每次 Playwright 运行前自动执行 `db:reset`,
  保证候选排序、来源计数等断言可重复。
- node 脚本不自动 reset,需手动先跑 `pnpm --filter @onecase/db db:reset`。

## 已知问题

1. `next build` 与运行中的 `next dev` 共写 `.next` 目录会让 dev server 500,
   跑 build 后如遇页面 500,重启 dev server 即可。
