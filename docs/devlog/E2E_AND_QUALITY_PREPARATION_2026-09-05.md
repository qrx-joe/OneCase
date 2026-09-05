# E2E 隔离闭环与真实模型评估准备

日期：2026-09-05。

## 完成结果

- 禁止复用已有 3100 服务，测试使用 `e2e-demo.db`、`.next-e2e` 和 `.tsconfig.e2e.json`。
- 真实 Provider 密钥以空值覆盖，避免 Next 从 `.env.local` 补回；故障模式固定使用缺 Key 的 OpenAI，禁用 Mock 降级，不外呼。
- 重置入口只接受固定测试库 URL，不再只检查文件名包含 e2e。
- 测试库和独立构建产物加入 `.gitignore`。
- 建立独立事实评估集：20 条文字、10 张 HTML 渲染的合成反馈图片。
- 新增一对一事项匹配、地点检查及调用预算测试；旧 Mock Eval 禁止用于真实 Provider。
- 新评估入口默认仅生成样本，真实执行必须显式 `--run --max-requests=N`，最多 30 请求、无额外重试、每次输出上限 1200 Token，连续 3 次调用或 Schema 失败停止。

## 验证

| 检查 | 结果 | 证据 |
|---|---|---|
| 桌面＋移动黄金链路冒烟 | 2/2 通过 | 独立 E2E 服务 |
| 完整 Playwright E2E | 28/28 通过，约 2.1 分钟 | `tmp/verification/e2e-full.log` |
| 服务端缺 Key 故障模式 | 3 通过、2 跳过，约 33.7 秒 | `tmp/verification/e2e-provider-failure.log` |
| Mock Eval＋选择器＋评分回归 | 31/31 通过 | `tmp/verification/eval-offline.log` |
| 评分＋预算限制 | 8/8 通过，其中评分 5 项与上一行重叠 | Vitest 定向运行 |
| 旧 Eval 指定 StepFun | 按预期失败，提示使用新入口，无模型调用 | `tmp/verification/legacy-eval-rejected.log` |
| 新评估无费用预检 | 30 条样本、10 张图片生成成功，模型调用 0 次 | `tmp/quality-eval/2026-09-05T07-46-00-461Z/manifest.json` |
| Web 类型检查 | 通过 | `tsc --noEmit --incremental false` |
| 本轮相关 tracked diff 空白检查 | 通过 | 既有讲稿改动的空白提示未顺手修改 |

故障模式跳过的是需要恢复模型分析成功的两项；缺 Key 服务无法恢复成功，同名业务路径在常规 28 项 E2E 中覆盖。跳过不算通过。

常规 E2E 前后 `packages/db/prisma/dev.db` 的 SHA256 相同：

`7BA759E21492EDB897AAF71C61AC48E15D3024743133D8131F530E5F32638B06`

故障模式后的再次哈希读取曾因其他进程占用而失败，没有停止其他进程。上述一致性结论限定于常规 E2E 前后已成功读取的两次哈希。

## 真实评估状态

本地 StepFun 密钥存在性与模型配置已检查，未打印密钥。模型为 `step-1o-turbo-vision`。本轮尚未调用真实模型：已提出最多 30 次调用的授权选项，等待用户答复，不能将默认选项视为授权。

脚本、样本和报告输出已就绪，获准后先执行 T01＋I01 两次冒烟，再执行其余 28 条。具体命令和费用边界见 [评估说明](../testing/real-model-quality.md)。

自动评分只覆盖有限的主题、数量、类别与地点检查；模糊图片、无事项和图文冲突共 4 条单独人工检查，不计自动通过率。当前产品 Schema 不允许零事项，是已暴露的业务边界，未为迎合评估擅自调整。

## 结构影响

- E2E 改动经过测试配置、服务启动与 Next 构建配置，产品默认启动仍使用原有配置。
- 质量评估复用生产 Provider 和 Schema，样本、评分和预算限制位于独立评估模块，不修改产品提示词或默认 Token 预算。
- 未修改认证授权、数据库 Schema、PPT/PDF/Word 版式，也未提交或推送代码。用户既有业务修复保留。

本轮完整 E2E 尚未发现阻断失败，不代表所有浏览器、真机和真实模型场景都已验收。
