# 民生服务候选标准与负例检查（2026-10-10）

## 结果与授权范围

用户在 Auto-kaizhi 方法与 Skill 评估后要求“下一步”，本轮按 `aias-meta-proto` 整理现有原型的标准样本、失败边界与可执行检查。材料可复现，状态仍为 AI_DRAFT；用户亲改、跨谱系联合评审和一线走查未执行，不能宣布定标或需求验证完成。

参考 Auto-kaizhi 的三层验证与原型定标方法，产出为 OneCase 原创材料；未复制课程正文、初始化项目、安装开发套件或迁移现有文档结构。

## 产物与结构影响

- [standard.md](../testing/usability/standard.md)：S01 白班岗位指导、S02 本次探访与新周期，完成范围、原件/亲改记录和三层验证边界。
- [negatives.md](../testing/usability/negatives.md)：八条机器负例、八项人工清单、来源说明与拒绝检查方法。
- [livelihood-prototype-fixtures.json](../testing/usability/livelihood-prototype-fixtures.json)：两条样本的逐步输入和期望、八条反例；所有数据合成，审批与反馈状态显式为未完成。
- [check-prototype.mts](../testing/usability/check-prototype.mts)：读取 fixtures，直接调用现有 service-record 业务函数；任何断言失败非零退出。采用仓库既有 TypeScript/tsx 工具，适配 Windows，不运行 Skill 的 Bash 模板生成器。
- 可用性 README 新增入口，state/board.md 追加本轮记录；原走查包、Word 与 PDF 保留。

需求经过材料、结构化样本、检查执行器和现有业务规则。实际修改止于文档与样本检查工具；apps/packages、API、UI、数据库 schema、状态机和依赖均未修改。未实现研究中待决定的待办视图、资源卡或来源关联。

## 实际执行的验证

| 检查 | 结果 | 能说明什么 |
| --- | --- | --- |
| 文档内的样本检查命令 | 2/2 正例、8/8 负例通过 | 当前纯业务函数与结构化期望一致 |
| 既有 service-record.test.ts | 14/14 通过 | 既有服务记录规则定向回归 |
| 临时副本 N02 期待转介发出即可收尾 | 退出码 1，FAIL canResolve | 能拒绝错误收尾期望 |
| 临时副本 S01 删除结果确认依据 | 退出码 1，要求反馈来源 | 能拒绝缺少依据的完整链路 |
| 临时副本 S02 删除后续联系时间 | 退出码 1，要求下一次联系 | 能拒绝缺少后续安排的探访 |
| 检查器及导入代码的独立严格 TypeScript 检查 | 通过 | 脚本类型可检查，不代表全仓重跑 |
| 保护文件前后 SHA-256 | 173/173 一致 | apps/packages、两个本地库、既有架构/调研和三份原走查包保持原样 |
| 新增文本 / 本地链接 / 负例编号 | 5 份文本、15 个链接、8 个编号通过 | 文件可访问、格式与编号一致，不证明语义已获人审 |
| git diff --check | 通过 | 既有差异没有空白错误；新增文本另作空白检查 |

三份违规副本仅写入 tmp，运行后逐文件删除；原 fixtures 内容不变。首次样本命令因相对路径多退一级失败，修正文档为 `../../docs/...` 后，按文档原命令重跑通过。没有隐藏或跳过业务断言。

复现命令（仓库根目录）：

```powershell
pnpm.cmd --filter @onecase/web exec tsx ../../docs/testing/usability/check-prototype.mts
pnpm.cmd --filter @onecase/web exec vitest run src/lib/__tests__/service-record.test.ts
pnpm.cmd --filter @onecase/web exec tsc --noEmit --strict --target ES2022 --module ESNext --moduleResolution bundler --esModuleInterop --skipLibCheck --types node ../../docs/testing/usability/check-prototype.mts
```

## 限制与下一步

本轮无数据库写入、浏览器操作、真实模型调用或真人记录。脚本只测服务函数与内存序列化；不验证 API 权限、版本竞争、旧事项存在性、持久化、UI 易用性、外部回执真实性、实际就业/养老效果。此前的 E2E/并发测试记录保持历史属性，本轮未重跑，不列为本轮结果。

人工 CHECKLIST 保持未勾选，用户亲改栏保持待填。Skill 的“挑与改必须是人”不能由 AI 或用户要求推进材料来代填。下一步由用户审阅两个样本，明确一处保留/修改及理由，再提取原则并复验；没有经办人时，一线记录继续未执行。

未调用模型、发送消息、安装依赖、提交、推送或部署。结构与链接检查不证明内容已获人审，也不替代实际经办人证据。
