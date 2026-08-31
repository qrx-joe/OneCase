# OneCase 项目审查报告

日期：2026-08-31
原审查基线：`main` / `2a12b03`（上一轮 5 项整改提交后）。Codex 后续修复基于 `32aff8f`，结果见 §8。
方法：全量通读 apps/web 全部路由/服务/页面、packages 全部源码、seed/reset、CI、README 与 .env.example；对照 TASK.md 完成标准与 README 已知限制，区分新问题、已声明限制和本轮范围外需求。
原审查记录：typecheck ✅ / 不变量 34 项 ✅ / E2E 11/11 ✅ / 全仓 build ✅ / `pnpm install --frozen-lockfile` ✅。单测原记为 63 项有误，Codex 实跑全仓单测为 103 项；原 E2E 结果不能代替后续改动的复验。

后续进度：§2、§3 保留原审查问题描述；Confirm 状态校验、输入上限、幂等冲突和旧链接兼容的修复见 §9。

---

## 1. 结论摘要

核心链路已有 Confirm 事务、手动兜底门禁、analyze CAS、Mock 降级双开关、组织一致性和决策留痕校验。后续复审发现 CI 在建表前运行数据库测试，以及旧分析请求可在新请求接管后写入；Codex 已做本地修复和服务级回归，见 §8。CI 配置包含单测、不变量、E2E 和 build，最新远程运行结果仍待确认。

原报告未覆盖上述两项问题，不能据此宣布整体整改通过验收。除 §8 的复验边界外，仍需处理以下问题：

1. **边界与纵深**（P2×5）：详情/变更端点的组织归属不校验、confirm 缺两道纵深校验、遗留死页面、未完成 Review 的 Intake 无找回入口、rawText 无长度上限。
2. **文档与代码漂移**（P3 多项）：.env.example 含 3 组未实现的环境变量、README 测试章节落后于现状、「语义相似度」措辞与实现不符。
3. **死代码/死表**（P3）：intake/[id] 死页面、domain/services.ts 占位实现、3 张未使用的表、未实现的输入 Tab。

---

## 2. P2 — 试点前应处理

### P2-1 详情与变更端点不做组织归属校验（README 已声明，此处细化清单）

`README 已知限制`已写明「organizationId 仅过滤，未校验归属」。逐端点核实后的实际缺口：

| 端点 | 现状 |
|------|------|
| `GET /api/cases/[id]`（cases/[id]/route.ts:17） | 按 cuid/caseNumber 全局查，无组织过滤 |
| `GET /api/intakes/[id]`（intakes/[id]/route.ts:13） | 同上 |
| `POST /api/cases/[id]/status`（status/route.ts:46） | 可变更任意组织的 Case 状态 |
| `POST /api/intakes/[id]/analyze`、`/confirm` | 按 id 直查 Intake，confirm 内部有一致性校验（组织一致 ✓），但读取本身不过滤 |

写路径中 confirm 的 LINK 目标与手动创建的 sourceIntake 已在事务内校验同组织（整改简报 §7 落地）；缺口集中在**读路径与状态变更**。当前仅适合受控、无敏感数据的演示；公开访问或真实试点前，需要认证和基于当前身份的归属校验。

### P2-2 confirmIntake 缺两道纵深校验（defense in depth）

`confirm-intake-service.ts` 读取 Intake 后只校验 `!== 'CONFIRMED'`，未校验：

- `intake.status === 'ANALYZED'`（当前正常流一定满足，但 PENDING+人为构造 analysisId 的组合目前可过）；
- `analysis.status === 'COMPLETED'`（FAILED Analysis 理论上无 Issue，会被 `ANALYSIS_ISSUES_EMPTY` 拦截，属于间接保护）。

当前均不可利用（推演过全部状态组合），但它们是「靠巧合成立」的不变量。建议补上，防止未来重构（如允许无分析的 confirm）时被静默绕开。

### P2-3 遗留死页面 `/intake/[id]/page.tsx`，且提交按钮必 500

`apps/web/src/app/intake/[id]/page.tsx` 是 UI 重写（334b721）前的遗留页：

- 原生 `<form method="POST" action="/api/intakes">` 以 form-encoded 提交，而 `/api/intakes` 只走 `request.json()` → 解析抛错 → 外层 catch 返回 500，「保存草稿」按钮永远失败；
- 语义也不对：POST /api/intakes 是**新建**而非更新当前 Intake，即使能提交也会造成重复建档；
- 仍用 Tailwind class（项目已改用原生 CSS 体系），无任何导航入口指向它。

建议直接删除或 302 到 `/intake/[id]/review`。这是本周删除 intake-service 死代码时漏掉的同类项。

### P2-4 未完成 Review 的 Intake 没有找回入口（孤儿草稿）

Review 页「丢弃」按钮只是 `router.push('/intake')`，Intake 停留在 ANALYZED；侧边栏只有 今日工作/新建/事项 三个入口，**没有任何 Intake 队列页面**。用户中途离开 Review 页后，这批「AI 已分析、等待人工确认」的数据只能靠手输 URL 回访。TASK.md 的最终完成标准要求「AI 结果不会未经人工确认成为业务事实」——目前成立（它们只是草稿），但试点场景下这是主要工作队列，缺入口意味着草稿会静默积压。

建议：至少在首页或独立页加「待确认草稿」列表（ANALYZED 状态 Intake）；「丢弃」应显式落地一个终态（如 DISCARDED）而非放着不管。

### P2-5 `/api/intakes` 对 rawText 无长度上限

`intakes/route.ts:11` 只校验非空。rawText 原样进入 AI prompt（真实 Provider 时）且永久入库，无 max length。Demo 无碍；试点前建议加输入上限（如 10k 字符）与基础频控，控制成本与滥用面。

---

## 3. P3 — 应排期处理

### 3.1 文档与环境模板漂移

- `.env.example` 含三组**代码中完全未使用**的变量：`NEXTAUTH_SECRET`/`NEXTAUTH_URL`、`STORAGE_*`（附件上传未实现）、`AI_DEBUG`（grep 无引用）。使用者会误以为这些开关生效。
- README「测试」章节落后：未提 `pnpm test:invariants`（本轮新增、34 项、已进 CI）；E2E 描述为「黄金链路 + 草稿编辑」，实际 4 个 spec 11 条（含 api-invariants、duplicate-refresh）。
- `duplicate-service.ts:2` 注释写「0.55 语义」，实现是字符+词元**词汇**相似度（bigram/Levenshtein），无 embedding。UI 与 API 响应已如实标注「未校准 heuristic」，但代码注释与技术文档若称「语义」需统一措辞——TASK.md 完成标准明确「不声称未测得的能力」。

### 3.2 死代码 / 死表

- `packages/domain/src/services.ts`：Phase 1 占位（confirmIntake 只有注释、findDuplicateCandidates 返回空数组），真实实现都在 apps/web/src/lib。TASK.md Phase 1 的「Confirm Transaction 在 domain」实际落在了 web 层——要么把占位删掉并在 ADR 记录架构决定，要么把事务逻辑下沉。
- Schema 三张表无任何读写：`AiRun`、`CaseEmbedding`、`DuplicateCandidate`（候选是即时计算不落库）。保留会误导读者以为有 embedding 管道。
- `packages/ui` 骨架包：文件内已自我声明未使用，可接受。

### 3.3 UI 诚实性

- 输入页「截图 / 图片」「语音 · P1」两个 Tab 是无 onClick 的死按钮，看起来可切换实则不可用。TASK.md 问题 4 的默认值是「首轮真实调用多模态」——尚未实现时建议加「即将上线」置灰态而非可点击外观。
- Home 表格行点击用 `window.location.href` 跳转（全页刷新），应换 `next/link` 或 `router.push`。
- Review 提交结果用 `alert()`（可接受，但与 Toast 组件并存，风格不统一）。

### 3.4 小型竞态与健壮性

- `intakes/route.ts:19` 幂等检查是 findUnique→create 两步，并发同 key 第二个请求会撞唯一约束返回 500（应捕获 P2002 转幂等响应）。
- `demo-context.ts` 的 `cachedOrgId` 进程级缓存永不失效；db:reset 不删 Organization 所以正常演示安全，但手工删组织重 seed 后旧缓存会导致静默空结果（仅 dev 场景）。
- provider 默认模型名字符串在 3 处重复（provider-factory / ai-provider.getProviderInfo / analyze 路由失败分支），漂移风险。
- `idempotencyKey` 全局唯一不含组织维度：跨组织重放同一 key 会拿到别组织的 Intake 数据。

### 3.5 工程化小项

- 仓库无 ESLint 配置，`pnpm lint` 不可用（简报已知，交接需持续标注「未验证」）。
- CI：Playwright 浏览器无缓存（每次全量下载）；无 `concurrency` 取消旧流水线；`retries: 2` 可能掩盖偶发脆弱用例。
- Playwright `reuseExistingServer: true`：本地若有带旧代码的 dev server 挂在 3000，E2E 会静默测旧实现（本轮开工前专门停掉两个 dev server 才排除该风险）。
- `GET /api/cases` 固定 `take: 20` 无分页参数。

---

## 4. 与 TASK.md 的偏差（本轮范围外，不代表已完成验收）

整改简报限制本轮修改范围，不代表用户取消原始需求或授权推迟全部未完成项。后续应由用户确认范围及验收标准。

| 项 | 现状 | 说明 |
|----|------|------|
| Phase 3「canonical case text 生成 embedding + exact cosine」 | 未实现（词汇启发式替代） | 整改简报 §8 明确本轮禁做；但 TASK.md Phase 3 验收行未满足，**交接材料不应声称 Phase 3 完整收口**（e03e799 提交信息中的「Phase 3 收口」仅指 Eval 部分，措辞有歧义） |
| Phase 4「6 种页面状态：含 permission denied、AI unavailable」 | permission denied 无认证可依托，未实现；AI unavailable 已有（错误态+手动兜底） | permission denied 仍未满足原验收标准；演示范围与试点范围需另行确认 |
| Phase 1「Confirm Transaction、Optimistic Lock、Idempotency 在 domain」 | 实现于 apps/web（domain 只有状态机/优先级） | 功能达成、位置漂移，建议 ADR 记录 |
| 多模态（图片输入） | 未实现 | TASK.md 问题 4 默认「是」，当前仅文字链路 |

---

## 5. 已确认修复（本轮 codex 复审 5 项，附提交）

| Finding | 提交 | 验证 |
|---------|------|------|
| P1 stale 候选可关联/可提交 | `6814879` | duplicate-refresh 3/3（含挂起请求+迟到响应用例） |
| P1 analyze/兜底状态覆盖竞态 | `4cd8950` | 不变量 §4-5 六项（CAS 抢占/在途 409/CONFIRMED 不覆盖） |
| P2 不变量脚本未进 CI | `a40a116` | CI 新 step + `pnpm test:invariants`，frozen-lockfile 通过 |
| P2 测试污染 Demo 基线 | `ccacfea` | organizations 2→1 治愈，finally 自清理+自检 |
| P2 模板缺降级开关 | `2a12b03` | .env.example 补 AI_ALLOW_MOCK_FALLBACK |

上述表格记录原整改提交，不代表后续复验全部通过。Codex 已在 provider 边界注入挂起响应，配合真实 SQLite 和路由 handler 自动验证接管后迟到成功及失败，见 §8；这属于服务级集成测试，不是浏览器或真实模型服务的端到端证明。

---

## 6. 建议处理顺序

1. **先完成 §8 的 CI 与并发修复复验**，再处理 P2-3 遗留页和 P3.1 文档漂移；遗留 URL 优先评估兼容跳转，并验证历史入口，不将删除页面称为零风险。
2. **P2-4 待确认草稿入口**（试点工作队列，产品闭环最后一块）
3. **P2-2 confirm 纵深校验**（十行级，加两条不变量用例）
4. **P2-5 rawText 上限 + P3.4 幂等竞态**（输入健壮性一批做）
5. **P2-1 组织归属校验**（与认证/RBAC 同批做，避免二次返工）

---

## 7. 复验命令

```bash
pnpm typecheck
pnpm -r test
pnpm test:invariants
pnpm --filter @onecase/web test:e2e
pnpm -r build
```

## 8. Codex 补充修复与验证

### CI 初始化顺序

- 修复前，在独立空数据库运行 `test:invariants`，`reset-demo.ts` 访问 `CaseAction` 时返回 `P2021`，复现建表顺序缺陷。
- 将 `.github/workflows/ci.yml` 的 `db:push` 移至不变量测试之前。`db:reset` 继续只负责清数据和 seed。
- 本机 Windows 对尚不存在的 SQLite 文件执行 `db:push` 报 `Schema engine error`。改由 Prisma Client 建立空白库并确认 `sqlite_master` 无表后，建表及不变量测试通过。生成客户端时另出现一次 Windows 引擎 DLL 占用警告；本轮未修改依赖或终止其他任务来消除此警告。
- 以上验证覆盖空 schema 初始化和测试顺序，不代表已在全新 Linux runner 上跑通 CI。尚未提交或推送本轮修复。

### 分析批次与迟到写入

- 抢占时对读取到的 `updatedAt` 做 CAS，显式写入递增的 `claimedAt` 作为批次版本。此举也拒绝读取旧快照的请求在其他分析已完成后重新抢占。
- 成功和失败收尾均在事务中校验 `id + ANALYZING + claimedAt`，先条件更新状态，再写 Analysis / Issues；写入失败时事务整体回滚。
- 收尾版本同样递增，防止同一毫秒内失败重试复用旧版本。不新增表字段、不迁移数据库、不改变 API 响应结构。
- `updatedAt` 在分析期间承担版本职责；未来如新增草稿编辑或其他 Intake 写入，必须评估这些更新对在途分析的失效作用。

### 回归与证据边界

- 新增挂起 provider 的四种接管场景：新分析接管、人工兜底接管，各覆盖旧请求迟到成功与失败。仅推进应用时钟，不等待十分钟，不修改旧批次的数据库时间戳。
- 修复前，新分析接管场景共 6 项断言失败；修复后通过。人工兜底接管原已通过，本次保留回归保护。
- 补测当前批次失败返回 502、FAILED 审计与 PENDING 回退、重试复用 Analysis，以及完成后的重复分析幂等。
- 本轮实跑：全仓单测 **103/103**、业务不变量首轮 **52/52**；保留并行工作新增的失败重试检查后，再跑合并脚本 **67/67** 通过。typecheck、全仓 build、`git diff --check` 通过。build 存在既有 Tailwind 配置模块格式警告，本轮未迁移样式体系。
- 数据库测试使用工作区内独立临时库，没有重置原 Demo 数据。发现并行工作新增 E2E 文件并启动 3000 服务后，本轮没有再启动浏览器测试，避免争用同一个 `.next`；原报告的 11/11 仅保留为历史结果。

### 结构影响与后续

本轮修改 CI、analyze 路由、共享超时注释及服务级测试。Confirm、手动创建服务、数据库 schema、页面和原生 CSS 均未修改。待当前开发服务空闲后复跑 E2E，并在授权推送后检查新 CI；草稿找回入口、认证、输入限制等仍属于后续任务。

## 9. 第二批边界修复（基于 33a2460）

### 本轮修改

- **P2-2 Confirm 门禁**：事务内要求 Intake 为 `ANALYZED`、Analysis 为 `COMPLETED`。不符合时 API 返回 422；已确认重复提交继续返回 409。保留已有的完整决策、组织一致性与原子写入校验。
- **P2-5 输入校验**：contracts 新增 `CreateIntakeSchema`。拒绝空白、非字符串原文、错误字段类型和无效 JSON，新建原文上限为 10000 个 UTF-16 代码单元，与浏览器 `maxLength` 一致。校验不裁剪或改写原文；前端显示相同上限。未增加频控或请求体字节级限制。
- **P3.4 幂等冲突**：组织别名先解析；同 key、同组织、同文本和来源重试返回同一 Intake。捕获并发创建的 P2002 后读取已创建结果，避免返回 500。不同载荷或不同组织复用 key 返回 409，不返回旧 Intake 内容。key 仍全局唯一，不新增数据库字段；此校验不能替代身份认证和归属授权。
- **P2-3 旧入口兼容**：保留 `/intake/[id]`。PENDING / ANALYZING 跳到带 `intakeId` 的恢复页，ANALYZED 跳到 Review，CONFIRMED 跳到事项列表；不存在的 ID 继续返回 404。移除旧入口中提交到 JSON API 的错误 HTML 表单。

### 回归证据

- 修复前，新加的边界测试有 17 项失败，总计 70/87 通过；复现了错误输入、并发 key 冲突、不同请求复用 key 和未就绪分析生成 Case。
- 修复后：业务不变量 **87/87**、全仓单测 **116/116**、typecheck 通过。并发测试使用真实 SQLite，同时发起 8 个同 key 请求，确认返回同一 Intake、只保存一行并保留原文。
- E2E **22/22** 通过（58.4 秒，无重试）：包括黄金链路、草稿编辑、候选刷新、AI 失败后的重试与刷新恢复，以及新增旧入口四种状态、404、前后端长度上限检查。通过自动启动的新服务和独立 SQLite 测试，未复用其他开发服务；Mock / HTTP 故障注入不代表真实模型服务验收。
- 前端不导入 contracts 校验代码来读取长度常量，避免将 Zod 带入新建页面；E2E 将浏览器 maxLength 与服务端常量比较，防止数值漂移。最终全仓构建通过，`/intake` 页面构建大小为 2.86 kB，First Load JS 为 98.2 kB；既有 Tailwind 配置模块格式警告仍在，未改样式工具链。`git diff --check` 通过。
- 继续使用独立临时数据库，不重置原 Demo 库。未修改并行工作中的 `docs/competition/`。

### 结构影响与剩余范围

本轮涉及 contracts、Intake 创建 API、Confirm 服务及响应映射、Intake 页面和测试。保留数据库 schema、AI Provider、手动创建服务、Review 决策逻辑及原生 CSS；旧入口复用现有恢复流程，不另建状态机。

待确认草稿队列、丢弃终态、认证与权限、频控仍未实现。此次只修复上述边界，不表示原报告所有问题或原 TASK 验收标准均已完成。
