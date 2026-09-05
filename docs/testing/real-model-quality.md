# StepFun 合成样本质量评估

## 目的与证据边界

旧 `packages/ai/__tests__/eval-cases.ts` 是 Mock 路由规格，部分期望要求返回原文没有的楼栋，因此禁止用它评判真实模型。该套件继续保留为离线回归，指定真实 Provider 时明确报错。

新的 `packages/ai/evaluation/cases.ts` 包含 20 条文字、10 条合成反馈图片定义，按原文事实标注期望地点。样本由 Agent 编写，尚未经过社区工作人员审核，不是业务专家金标准。PNG 由浏览器渲染合成文字生成，不是居民截图或实景照片。

自动检查按主题进行一对一事项匹配，检查漏项、多余事项、类别和地点；允许交换输出顺序、常见中文数字与阿拉伯数字。它是有限的字段检查，不能发现所有幻觉，也不能替代人工检查优先级、风险与摘要。

T20、I05、I09、I10 需要人工审阅，不计入自动质量通过率：分别为无事项文字、图文冲突、模糊图片和无事项图片。当前产品 Schema 要求至少一个事项；无事项输入可能暴露真实产品边界，不能修改样本来迎合输出。

## 无费用预检

在仓库根执行：

```powershell
pnpm.cmd --filter @onecase/web eval:quality
```

默认生成 30 条样本清单及 10 张图片，保存到 `tmp/quality-eval/<时间>/`，不读取密钥、不调用模型。先检查图片可读性及期望值，再安排真实调用。

## 真实调用

用户已给予现有 StepFun 配置下小规模测试与评估的持续授权，无需逐轮确认。执行前仍需确定请求上限，遵守失败停止条件；充值、套餐购买及明显扩量不包含在该授权中。

使用现有 `apps/web/.env.local` 中的 StepFun 配置，进程已有环境变量优先，不在命令行输入或打印密钥。模型沿用 `STEPFUN_MODEL`，缺省为 `step-1o-turbo-vision`。

先跑一条文字和一张图片：

```powershell
pnpm.cmd --filter @onecase/web eval:quality --run --max-requests=2 --ids=T01,I01
```

本轮计划总计 30 次，冒烟通过后只跑剩余 28 条，不重复消耗前两条：

```powershell
pnpm.cmd --filter @onecase/web eval:quality --run --max-requests=28 --ids=T02,T03,T04,T05,T06,T07,T08,T09,T10,T11,T12,T13,T14,T15,T16,T17,T18,T19,T20,I02,I03,I04,I05,I06,I07,I08,I09,I10
```

限制与行为：

- 每次执行必须显式给出 1—30 的请求上限；每样本最多一次调用，额外重试为 0。
- 每次输出最多 1200 Token，单次超时 30 秒；启动间隔至少 7.5 秒，按每分钟约 8 次控制。服务商 429 限流立即停止，其他请求或输出校验连续失败 3 次停止。
- `--ids` 限定样本，上限小于样本数时仅执行前若干条；未执行样本不能计为通过。
- 只允许调用项目使用的 StepFun completions 端点，不修改产品默认模型或提示词。
- 请求限额是单次进程限制，重新运行会产生新调用；多轮累计必须遵守已授权总量。
- 请求数与输出 Token 限制不是人民币费用上限。usage 随结果保存，实际费用以服务商账单为准。

`max_tokens` 的含义已按 [StepFun 官方 Chat Completion 文档](https://platform.stepfun.com/docs/zh/api-reference/chat/chat-completion-create) 核对；输入也会消耗 Token。

## 报告与验收

每次运行保存 `manifest.json`、PNG、逐条更新的 `results.json`，最后生成 `report.md`。记录模型、样本版本、Prompt/Schema 哈希、请求次数、耗时、usage、输出及评分。异常中断时保留已经写入的结果。

程序退出码 0 仅表示未遇到调用或 Schema 错误，不等于质量通过。探索阶段不设置未经业务确认的质量门槛；人工审核失败样本后，再与使用者约定验收标准。文字和图片应分别报告，人工样本不混入自动通过率。

本轮准备工作已经完成；是否已有真实结果以 `docs/devlog/` 最新记录和具体结果文件为准，不能把预检输出作为真实识别证据。
