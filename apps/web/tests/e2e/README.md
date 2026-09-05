# Playwright E2E 测试说明

## 运行条件

- [x] Playwright 浏览器 (chromium-1234,与 @playwright/test 1.62.x 匹配)
- [x] `channel: 'chromium'` 新 headless 模式,无需单独下载 headless shell
- 端口 3100 必须空闲；已有服务不会被复用。
- 独立数据库 `packages/db/prisma/e2e-demo.db`，独立缓存 `.next-e2e` 和 TypeScript 配置。
- 默认强制 Mock；真实模型密钥以空值覆盖，禁用配置降级开关。

## 测试场景

### 1. 黄金链路 (tests/e2e/golden-path.spec.ts)

TASK.md Phase 2 验收路径,真实断言,任何一步失败即测试失败:

```
1. /intake 填入多事项文本 → "AI 整理为事项"
2. 跳转 Review 页,断言: 2 个草稿 + "AI 草稿 · 未写入事项" + 缺失字段提示
3. 事项 1 候选区: Hard Negative CASE-011 标注"位置不同";点 CASE-018 "关联此事项"
4. 事项 2 点"新建事项"
5. "确认全部决策" → alert 汇总 "关联 1 个: CASE-018 + 创建 1 个: CASE-XXXX" → 回首页
6. /cases/CASE-018: 居民来源 +1、原始引用、Timeline 出现关联审计
```

### 2. API 级回归 (scripts/test-golden-path.mjs)

不依赖浏览器,覆盖同一链路 + Confirm 幂等 (重复确认被拒、不多建 Case)。

## 运行命令

```bash
pnpm --filter @onecase/web test:e2e                        # Playwright UI 链路
node apps/web/scripts/test-golden-path.mjs                 # 旧 API 脚本；不受上述 E2E 隔离控制
```

## 确定性

- 每个 spec 的 `beforeAll` 调用 `reset.ts`，只允许固定测试库 URL，先建表再重置，
  保证候选排序、来源计数等断言可重复。
- 不要对当前演示库运行旧脚本的重置步骤。

## 服务端配置失败的兜底验证

PowerShell：

```powershell
$env:E2E_PROVIDER_FAILURE='true'
pnpm.cmd --filter @onecase/web test:e2e ai-fallback.spec.ts
Remove-Item Env:E2E_PROVIDER_FAILURE
```

启动器固定使用缺 Key 的 OpenAI 配置，不产生模型调用。预期 3 项通过、2 项跳过（缺 Key 不能恢复分析成功）；常规 28 项 E2E 中包含恢复分析成功的用例。

2026-09-05 本轮验证：常规 28/28 通过，配置失败模式 3 通过、2 跳过。演示 `dev.db` SHA256 前后一致。结果不等于真实模型质量验收。

## 已知问题

1. `next build` 与运行中的 `next dev` 共写 `.next` 目录会让 dev server 500,
   跑 build 后如遇页面 500,重启 dev server 即可。
