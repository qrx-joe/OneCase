# OneCase 开工手册

> 社区事项 AI 工作台。核心判断：`Message != Case`，`AI Draft != Business Fact` —— AI 只生成草稿；创建、关联、状态变更全部由人触发。
> 本篇是每次开工先读的入口。产品口径在 `docs/product/PRD.md`，技术口径在 `docs/architecture/TECH_SPEC.md`，原始执行基线在 `TASK.md`。本篇不重复它们，只定开工前三件事。

## 开工三行

- **我要什么**：OneCase MVP 保持「可演示、可验证、可回滚」——文字黄金链路稳定，真实图片识别完成验收，参赛材料与代码事实一致。
- **哪些我来定**（人）：需求取舍与范围（跨阶段扩 scope 必须先问）；业务口径（关联/新建/状态迁移的语义）；对外材料定稿；部署、付费、外部服务写入；一切不可逆操作（删库、force push、改动 CI 闸门）。
- **哪些你来定**（AI）：实现细节、测试补充、文档措辞、重构方案。能查的、能试的，先自己干完再汇报，别中途打断。

## 真相源权重（冲突时从上往下赢）

1. 代码 + `packages/db/prisma/schema.prisma` —— 唯一真相
2. `docs/adr/` —— 已拍板的技术决策
3. `docs/devlog/` —— 完成记录，越新越权威
4. `README.md` —— 对外口径，更新可能滞后
5. `TASK.md` —— 原始执行基线，阶段计划与早期问题**不代表当前事实**，只作历史参考
6. 对话记录 —— 最弱；重要结论不落盘就不算数

改事实的顺序：先改上游，再同步下游；只改下游不算完成。

## 分流规则

开工前把决策点分三类：

- **去查**：PRD / TECH_SPEC / adr / devlog / 已有测试里已有的 → 自己查，别问。
- **去试**：环境与链路（依赖安装、db:push、E2E 能不能跑、Provider 通不通）→ 先跑最小的一次。
- **去问**：偏好、授权、不可逆后果（见文末「立即暂停」清单）。来问时给 2-3 个备选 + 推荐 + 各自影响，不抛裸问题。

做错了由人承担后果的事，必须留给人，不替人定。

## 冒烟规则

- 全量之前先跑最小的一次：新 Provider 先跑 1 条真实样例；新页面先跑 1 条 E2E；改 schema 先跑 1 个 seed。
- 冒烟测**环境**（通不通），不测**质量**（好不好）——质量走单测 / Eval。
- 凡需本人设备、账号、现场判断的（真实 API key、真实图片验收、比赛提交动作），标出来交还，别用推测填充。
- 冒烟结论记回「意外矩阵」或 devlog：哪条路通、哪条不通、为什么。

## 意外矩阵（如果 X → 那么 Y；同类错误翻车三次必须新增一条）

| 如果 | 那么 |
|---|---|
| 改 lib 文件后热重载 500 / webpack 缓存损坏 | 重启 `pnpm dev` 即恢复；`next build` 与运行中的 dev 共写 `.next`，build 之后重启 dev |
| 页面渲染但无样式、JS 资源 404、前端功能全部失效（含跳转/事件） | 是 `.next` 产物错乱、页面脚本根本没加载（2026-09-06 实测踩坑，易误判为新代码 bug）：先 `netstat -ano` 找 3000 端口 PID 杀净，`rm -rf apps/web/.next` 再起 dev；演示日 T-60 清单含"确认首页有样式" |
| E2E 失败且怀疑数据污染 | Playwright 用例会自动 db:reset；手跑 `apps/web/scripts/*.mjs` 前先 `pnpm --filter @onecase/db db:reset`（会清业务数据，仅限演示库） |
| 确认接口返回 `INTAKE_ALREADY_CONFIRMED` | 幂等保护生效，不要重试确认；先查 intake 状态再决定下一步 |
| AI Provider 调用失败 | 不自动降级 mock（仅 `DEMO_MODE=true` 且 `AI_ALLOW_MOCK_FALLBACK=true` 才允许）；引导走手动创建 Case 的兜底路径 |
| 本地与 CI 行为不一致 | 先对版本：本地 Node 24 / CI Node 22、pnpm 10（`.nvmrc` 锁 22）；再怀疑代码 |
| pnpm install 拉不下包 | 依次试：默认源 → npmmirror 镜像 → 原样报告失败。不静默换方案、不降级需求 |
| 状态迁移被拒 | `packages/domain` 状态机是唯一校验源，UI 下拉与 API 同源；不要在 API 层加第二套规则 |
| Case 编号疑似重复 | `count()+1` 并发重号是 README 已记录的已知限制，不是新 bug，别顺手修（留给专门决策） |

## 纪律（每次提交前自查）

1. 不写真实居民数据，只用合成数据。
2. 不提交密钥；配置进 `.env.local`（已在 `.gitignore`）。
3. 不新增未获授权的生产依赖。
4. AI 产出不得冒充业务事实；Mock 不得冒充真实识别效果；文档不得声称未测得的效率或准确率。
5. 验证失败原样说明，不粉饰。

## 每轮开工 / 收工

- **开工**：先读 `state/board.md` 顶部一段，接上进度再动手。
- **收工**：往 `state/board.md` 顶部倒序追加一段——完成了什么 / 作了什么决定及理由 / 下一步从哪接。只记会影响后续行动的事。
- 分工：`state/board.md` 给 AI 看，`docs/devlog/`（按日期命名）给人看。过程状态写 board，阶段完成写 devlog。

## 文件地图

| 文件 | 管什么 |
|---|---|
| `.42cog/intent.md` | 意向书：收敛方向 + 不做什么（人写，AI 只读，不修改不重排） |
| `.42cog/must-know.md` | 待拍板决策点（当前两个：真实视觉模型验收、SQLite→PostgreSQL 时机） |
| `state/board.md` | 状态板（给 AI 看，倒序追加） |
| `scripts/check-tools.sh` | 开工前环境自检（node / pnpm / git） |
| `.nvmrc` | Node 版本锁（对齐 CI 的 22） |
| `.claude/skills/demo-verify/` | 技能：演示前重置 + 黄金链路完整验证 |
| `.claude/skills/cross-lineage-review/` | 技能：换谱系对抗性评审（P0-P3 分级） |
| `tmp/` | 过程材料区（已在 .gitignore，一次性文档放这里，不进主仓库） |

## 立即暂停并询问

TASK.md §4 全文有效：部署、付费、真实外部消息、生产数据、凭据、删除重要内容、公共 API 破坏性调整、跨模块显著扩 scope。
