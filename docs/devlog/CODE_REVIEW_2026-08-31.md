# OneCase 项目审查报告

日期：2026-08-31
基线：`main` / `2a12b03`（codex 复审 5 项整改完成后）
方法：全量通读 apps/web 全部路由/服务/页面、packages 全部源码、seed/reset、CI、README 与 .env.example；对照 TASK.md 完成标准与 README 已知限制，区分「新问题」与「已声明/已授权推迟项」。
验证状态（审查时实跑）：typecheck ✅ / 单测 63 ✅ / 不变量 34 项 ✅ / E2E 11/11 ✅ / 全仓 build ✅ / `pnpm install --frozen-lockfile` ✅

---

## 1. 结论摘要

核心链路（Intake → AI Draft → 人工决策 → Case → 状态流转 → Dashboard）的业务不变量已经过本周两轮整改后处于健康状态：Confirm 事务完整、手动兜底有门禁、analyze 有 CAS 抢占、Mock 降级有双开关、组织一致性和决策留痕均有服务端校验和回归测试，CI 已覆盖单测/不变量/E2E/build。

不存在会立刻产生错误业务事实的 P1 问题。剩余问题集中在三类：

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

写路径中 confirm 的 LINK 目标与手动创建的 sourceIntake 已在事务内校验同组织（整改简报 §7 落地）；缺口集中在**读路径与状态变更**。在无认证的 Demo 下无实际影响，接入认证时这些端点是第一批要补归属校验的地方。

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

## 4. 与 TASK.md 的偏差（已授权推迟，验收措辞需注意）

| 项 | 现状 | 说明 |
|----|------|------|
| Phase 3「canonical case text 生成 embedding + exact cosine」 | 未实现（词汇启发式替代） | 整改简报 §8 明确本轮禁做；但 TASK.md Phase 3 验收行未满足，**交接材料不应声称 Phase 3 完整收口**（e03e799 提交信息中的「Phase 3 收口」仅指 Eval 部分，措辞有歧义） |
| Phase 4「6 种页面状态：含 permission denied、AI unavailable」 | permission denied 无认证可依托，未实现；AI unavailable 已有（错误态+手动兜底） | Phase 4 按演示口径完成，验收清单这两项属试点范围 |
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

遗留已知风险：F2 的「分析在途被兜底抢走后迟到收尾」内部窗口（claim 与 AI 调用之间）由事务守卫保证但无法端到端自动化（需在 provider 内注入暂停），仅覆盖可观测面。

---

## 6. 建议处理顺序

1. **P2-3 删死页面 + P3.1 文档漂移**（半天内，纯清理，零风险）
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
