# 状态板（给 AI 看）

> 用法：**倒序追加**，每轮一段。只记会影响后续行动的事：① 完成了什么 ② 作了什么决定、理由 ③ 下一步从哪接。
> 给人看的版本在 `docs/devlog/`（按日期命名）。内容冲突时以代码与 adr 为准（权重见 CLAUDE.md「真相源权重」）。

## 2026-09-06 · 凌晨 3 · 演示前大巡检：全功能走查 24/24 + 备份演示视频成片 + 文档口径刷新

- 完成：① UI 全功能走查脚本 `walkthrough-ui.mjs`（真实 StepFun 运行态，语义定位容忍模型输出差异）**24/24 通过**——门卫/登录对错/铃铛/来件/真实分析(2草稿)/查重候选/草稿编辑/关联+新建事务/详情来源+时间线/状态机/筛选/搜索/手动兜底/设置页/退出/二次拦截。② **备份演示视频成片** `docs/demo/video/OneCase-备份演示视频.mp4`（3.8 分钟 8.2MB，1440x900，edge-tts 配音 XiaoxiaoNeural + 烧录字幕，假光标跟随+拟人输入；Playwright 分段录制 → ffmpeg 逐段合成(配音响度标准化+SRT 按句铺时) → 拼接；管线入库 `record-demo-video.mjs`/`narration.json`/`gen-voice.py`/`compose.py`，配音稿按 cn-humanizer 口径去 AI 味，可整片或单段重录）。③ 文档口径刷新：06/07/08/DEMO_SCRIPT/README 数字 200/29 → **213/32**（2026-09-06 实测），07 加登录步骤/干净 Profile 红线/视频指引，08 加 Q21（虚拟登录安全性）/Q22（设置页非摆设），意外矩阵新增 `.next` 产物错乱一条。
- 踩坑与修复：① `.next` 产物错乱（build/dev 共写后页面无样式、JS 404，前端功能全失效，**极易误判为新代码 bug**）——处置：杀净 3000 端口进程 + `rm -rf .next` 重启；② settings AI 配置加载完成前误显示"无法读取"→ 改"读取中…"；③ 浏览器禁本地存储时登录会与门卫死循环 → 写入失败提示留在登录页；④ 用户浏览器窗口无法前置且带 MetaMask 扩展 → 功能测试改用 Playwright 干净 Chromium（与演示日推荐环境一致），红线写入 07 T-60。
- 决定：本轮不动 PPT/PDF 二进制（对外材料归人）——06/08 已注明答辩口径："PPT P9 快照 200，代码实测 213，材料定格后代码仍在演进"；hyperframes 未走完整 intent 层，片头/结尾卡用同思路 HTML→渲染轻量实现（CLI 0.8.4 在位，需动效再升级）。
- 验证：typecheck 干净；单测 **213** 全绿（web 81）；E2E **32/32**；视频整片回看+抽帧核对通过；演示库已 db:reset 回 KPI 2/3/3 基线。
- 下一步从哪接：① 本人在路演机实机播放视频一遍（外放试音量）+ U 盘/云端各拷一份；② 按 07 T-1/T-60/T-5 清单执行（db:reset → 起服务 → 合成图片冒烟 → 登录试一遍）；③ PPT P9 数字如需刷到 213 走材料轮（python-pptx 文本级修补路径）。

## 2026-09-06 · 凌晨 2 · 演示虚拟登录 + 设置页落地（本人拍板「加完整性」，全量验证绿）

- 完成：① `/login` 演示虚拟登录页——内置演示凭据 `onecase / onecase2026`（单一来源 `lib/demo-auth.ts`，页脚有备忘小字），仅写 localStorage 本机会话，**无后端鉴权、不拦 API**（API 级脚本/彩排零影响）；AppLayout 加前端门卫（无会话跳 /login），退出登录在设置页。② `/settings` 设置页——真实项：账号资料（读会话）、通知偏好三开关（localStorage 持久化，经 `summarizeNotifications` 新增 notify 选项**真实作用于顶栏铃铛分组与角标**，全关时铃铛空态有专门文案）、AI 识别配置只读（复用 /api/intakes/capabilities，Mock 环境如实显示「Mock 演示模式」，不展示密钥）、分类字典只读；未实现项统一 Badge「敬请期待」（修改密码/页面内切换模型/组织权限/SLA/集成/导入导出/审计/品牌）+「规划中」占位卡，不冒充可用。③ 字典单一来源：`CATEGORY_LABELS` 原在今日工作/全部事项/详情三页重复定义、手动建案另有 `CATEGORY_OPTIONS`，统一提取 `lib/category-labels.ts`（含下拉用 `CATEGORY_SELECT_OPTIONS`），四个页面全部改接。④ 侧栏恢复预留的「管理」区放设置入口，用户卡可点进设置。
- 决定：门卫只做前端跳转（本人明确此为演示完整性需求而非安全需求，勿在其上叠真实权限）；E2E 用 Playwright 标准 setup 项目——`tests/e2e/auth.setup.ts` 真实走 /login 存 storageState，chromium 项目全局复用（状态目录已 gitignore；setup 项目须与 chromium 同配 `channel` 否则回退找未安装的 headless shell 报错）；README/E2E 数字与 07 运行手册登录提示本轮不改——对外口径归人，且凌晨段刚刷过材料。
- 验证：typecheck 干净；单测 domain 33 / contracts 25 / ai 74 / **web 81**（新增 demo-auth 6、user-settings 4、通知过滤 3）全绿；Playwright E2E 本轮实测 **32 用例全过**（新增 settings.spec 2 条，全部既有用例带门卫通过；凌晨段记录 29，口径差 1 条未对齐，留材料轮核）；`next build` 成功（/login、/settings 静态预渲染）。**注意：凌晨段刷入材料的数字（200 单测/29 E2E）因本轮落地再次过时**，全仓现为 213 单测 / 32 E2E，材料轮需再刷。
- 下一步从哪接：① 本人在 07 运行手册加一行 T-5「先登录演示账号」（凭据在登录页页脚也有，防忘词）；② 材料数字刷新（213/32）与 README 验证基线段同步；③ 既有 backlog 候选不变（Review 页 evidenceConflict 渲染）。

## 2026-09-06 · 凌晨 · 材料数字刷至当日实测 + 两会话工作分批提交

- 完成：基于晚7回修后的代码全量复跑——**单测 200（domain 33 / contracts 25 / ai 74 / web 68）、业务不变量 99/99（含 §8 新六项）、Playwright E2E 29/29（隔离环境，新增 conflict-flag）**，typecheck 干净。比赛材料数字整体从 09-05 口径（196/93/28）刷至 09-06 口径（200/99/29）：PPT 第 9 页（74/68/200、注记改 09-06）、02-v2、06/07/08、preliminary README、01、根 README；PDF 重导、P9 judge 复验通过，三份二进制再次覆盖 `初赛提交附件-v2/`。
- 分批提交 8 节点（两会话分开归属）：`3a9ae52` 冲突横幅渲染 / `870a614` 类别字典校验 / `aeb88ec` 地点同位数字匹配（=晚7 的三项回修）→ `c73a7b6` 彩排走查脚本 → `2eeeab2` 阶段0/Gate1 资料包 → `740ab8b` 现场展示包(20分钟 3+15+2)+口径与数字同步 → `01ec076` 二进制附件同步 → 本条状态板。
- 决定：工作区里 login/settings/demo-auth/user-settings/category-labels/notification-summary 等改动是并行会话**在途新工作**（疑似认证/设置轮），未替其提交，留其本人会话收工自行落库；状态板只提交本段。
- 下一步从哪接：① 本人 PowerPoint/WPS 实机播放检查 + 20 分钟计时排练（06 §9）；② T-1 天按 07 §1（1 次合成图片冒烟 + 备份录屏）；③ 报名信息与发送归本人；④ 本地领先 origin/main 多个提交，推送与否请本人定。

## 2026-09-05 · 晚 7 · 彩排四项发现全部修复并回归全绿

- 完成（本人指示"修复这些问题"，对应晚 5 彩排的 R1-R4）：① confirm 建案类别字典校验——字典外类别（实测 HEALTH）置空为未分类、审计留痕「类别 X 不在字典，已记为未分类」，AI 原值保留 IntakeIssue（`confirm-intake-service.ts`，不变量新增 §8-1/§8-2）；② 同位异写地点分补偿——`text-similarity.ts` 新增 `locationNumbersEqual`，楼栋/单元号逐位一致但字符串相似度不足时按 0.65 记「地点相近」（仅影响候选排序不自动合并，前缀不一致不补偿，R2 红线未动）；③ Review 页渲染 evidenceConflict——红色「⚠ 信息冲突」横幅加在 review/page.tsx 内联草稿卡（**发现 AIDraftCard 组件系死代码无人引用**，组件同步改但生效路径是页面内联），Mock 新增场景 4（关键词「冲突」→ evidenceConflict=true），新 E2E `conflict-flag.spec.ts`；④ 彩排脚本任务 6 改用任务 2 新建 OPEN 案验证 OPEN→RESOLVED 被拒。
- 回归：ai 74/74、web 68/68（+4 locationNumbersEqual）、typecheck 通过、不变量 **99/99**（+6）、Playwright E2E **29/29**（+1 conflict-flag；其余 28 条文本不含「冲突」关键词，不受 Mock 新路由影响）。`next build` 本机未跑（:3000 dev 在运行，build 与 dev 共写 `.next`，见意外矩阵），由 CI 覆盖。演示库为干净 seed（不变量脚本自带 reset）。
- 决定：字典外类别选"置空+留痕"而非"拒绝建案"——阻塞人工流程违背「AI 失败可兜底」；edit.categoryCode 契约扩展留 P8 类别字典管理时一并定。
- 下一步从哪接：① 本人审 4 样本拍板验收线（REVIEW.md I05 节已标注冲突横幅已修，按修复后代码审核）；② 招募真人执行阶段0+Gate1（材料就绪）；③ 遗留 backlog：edit.categoryCode 契约扩展、P8 类别字典管理页；④ 本轮修复涉及 packages/ai、apps/web 页面与脚本、docs、本板，提交时与晚 6 的二进制批次分开归属。

## 2026-09-05 · 晚 6 · 二进制附件同步完成（PPTX/PDF/Word）+ SVG 路径作废

- 完成：`AI+民生-个人参赛-OneCase-v2.pptx` 文本级修补（python-pptx，版式零改动）——P3 Provider 行重排含 StepFun、P8 三格改 Mock｜Qwen / OpenAI｜StepFun + 脚注更新、P9 数字 **52/24/76 → 74/64/196**（修补前实际值比 02-v2 此前记录的 55/36/91 更旧）、P12"当前 Mock"→"Mock 不能识别图片"；**全部 14 页备注**同步为 02-v2 最新讲稿（原备注停在 8-31 口径）。PowerPoint COM 重导 PDF，14 页渲染 PNG 交 judge 逐页核对：P8/P9/P12 一次通过，P3 首次失败（Provider 行溢出压到 03 列）→ 重分行后复验通过。`OneCase-项目简介.docx` 两处"当前 Mock/配置视觉模型"表述同步。三份二进制已覆盖 `初赛提交附件-v2/`。
- 文档状态随之改口（均已落盘）：02-v2 头部、preliminary-2026/README（顶部 + 附件状态节）、01（头部 + 核对项勾选）、根 README 参赛材料段、06 脚本 §7（改为完成记录）。
- **决定与作废**：晚3「下一步①」的 SVG 工程重导出路径**作废**——核查发现 `projects/onecase-prelim-v2_ppt169_20260831/svg_final` 与提交版 PPTX 不同源，SVG 内仍含姓名"乔瑞雪"与已停用团队名"不理不器"，用它重导出会把个人信息带回展示材料；后续如需改 PPT，继续用 python-pptx 对提交版直接修补。
- 验收边界：渲染核对覆盖字体/裁切/重叠/数字正确性；PowerPoint COM 渲染≈实机但**不替代**本人在路演用 PowerPoint/WPS 实机播放检查（01 清单未勾项）。
- 下一步从哪接：① 本人实机播放检查 + 20 分钟计时排练（06 §9）；② T-1 天按 07 §1（1 次合成图片冒烟 + 备份录屏）；③ 材料侧对发送不再有阻塞，报名信息与发送动作归本人。

## 2026-09-05 · 晚 5 · Gate1 彩排真实走查(StepFun 10 次外呼)全通过

- 完成：本人授权真实 Provider 后，新增 `apps/web/scripts/rehearsal-walkthrough.mjs`（按任务卡 1-8+F1 的 API 级彩排，外呼上限 12、硬断言/观察项分级、Provider 无关），对 ：3000（stepfun/step-1o-turbo-vision）完整走查：**系统契约 12/12 通过，analyze 10/12 次，单次 2.2-4.7s，0 失败**。演示库已 db:reset 回干净基线。记录见 `docs/testing/usability/rehearsal-2026-09-05.md`。
- 彩排新发现：① D2 咨询草稿输出字典外类别 `HEALTH`（P8 实证 + confirm 建案是否校验类别 ∈ 字典的缺口候选，backlog）；② "三号楼"归一化只做对一半——同楼未误标「位置不同」，但字符串相似度不足没拿地点分（C1 命中 0.35，S4-T1 地点归一直接证据）；③ F1 本次冲突侧向为配文侧（北门）+ evidenceConflict=true，与评估轮 I05（图片侧）不同——两次均如实标冲突，"标记可靠、侧向人工定"更稳；④ CASE-018 seed 即 IN_PROGRESS，任务 6 非法迁移分支未触发（既有 status-change 脚本已覆盖）；⑤ 图片任务真实识别成功（合成场景卡→楼道灯损坏/3栋2单元）。
- 桌面推演 9 项发现的预期全部被彩排证实（C3 排序/搜「灯」0 结果/四选一校验/reset 必要性），消息库与任务卡无需再改。
- 决定：彩排结论只覆盖"系统契约+单人可走通"，不替代 S1-T7 真人测试，不入对外材料。
- 下一步从哪接：① 本人审 4 样本拍板验收线（REVIEW.md，可参考 R4 对 I05 的补充）；② 招募真人执行阶段0+Gate1（材料就绪）；③ backlog 候选两项：Review 页渲染 evidenceConflict、confirm 类别字典校验。

## 2026-09-05 · 晚 4 · 阶段0/Gate1 测试资料包 + 4样本审核包 + 模拟社工走查回修

- 完成：`docs/research/`（访谈提纲/同意书脱敏规则/计时表/样表清单/授权边界备忘，含招募话术）；`docs/testing/usability/`（Gate1 方案与五项判定/任务卡8张/记录表/21条合成消息库）；`apps/web/scripts/render-usability-images.mjs` 已生成 10 张合成配图至 `tmp/usability-assets/`（gitignore，可脚本重生成）；`tmp/quality-eval/2026-09-05T09-23-32-504Z/REVIEW.md` 4 样本（T20/I05/I09/I10）人工审核包，含 3 个验收线选项与拍板后落盘清单。
- 模拟社工桌面走查（4 人设，`docs/testing/usability/simulation-notes.md`，证据等级=材料自测非真人）发现 9 项并已回修材料：**C3 的 Hard Negative 预期原稿写错**——seed 本有 CASE-011（3栋1单元一层照明故障），正确行为=关联 CASE-011 或新建，严重错误=关联到任何 3栋2单元 的案；任务6 原稿依赖"超7天未更新"，但 db:reset 后 7 天内恒为 0（seed 不造历史日期），已改为待处理/处理中数字判定；OPEN 不能直接迁 RESOLVED（domain/case-state.ts），口播稿改"系统要求几步就几步"；任务1 成功标准放宽（出现 CASE-018 候选时关联同位案也算成功）；加"每位参与者开始前 db:reset + 对照遍纸笔"；任务7 搜"灯"对 seed 标题"照明"是 0 结果，已设提示规则；访谈 A2 加"翻最近10条数一数"法、B1 加 fallback 与工作群探针。顺带核实"三号楼→3栋"中文数字归一已存在（web/text-similarity.ts），C1 预期成立。
- 新增产品 backlog 候选（未实现）：Review 页渲染 evidenceConflict 提示（与验收审核包 I05 节同一发现——模型已标注、UI 不显示）。
- 决定：模拟走查结论只用于修材料，不得写入对外材料当"用户验证"；G3 判定口径统一为"错楼栋关联"。
- 下一步从哪接：① 本人按 `tmp/quality-eval/.../REVIEW.md` 审核 4 样本并拍板验收线；② 用 `docs/research/README.md` 招募话术约 3-5 位社工，合并执行阶段0（访谈+计时+样表）与 Gate1（任务卡）；③ 工作区竞赛材料侧另有并行会话未提交改动（晚3 段），提交时分开归属。

## 2026-09-05 · 晚 3 · 现场展示包（20分钟 3+15+2）落盘

- 完成：按《展示要求》图片（每队20分钟：3 团队介绍 + 15 成果展示 + 2 评委问答，另计 3 分钟评分）新增三份材料于 `docs/competition/preliminary-2026/个人参赛版/`：06 现场展示总脚本（逐字稿+PPT放映映射+16:30止损点）、07 现场 Demo 运行手册（T-1天/T-60/T-5 清单、故障预案表、现场红线）、08 评委问答预案（结论先行 20 问）。同步更新：03（时长与测试数字）、02-v2 第 9 页文案（55/36/91 → 74/64/196）、preliminary-2026/README（新文档索引、新口径、过时验证段改写）、01（路演口径改 3+15+2、排练项改 20 分钟）、docs/demo/DEMO_SCRIPT.md（E2E 已隔离的过时告警更正 + 指向 07 手册）。
- 实测依据（本会话取得）：全仓单测复跑 **196 项通过（domain 33 / contracts 25 / ai 74 / web 64）**；运行态冒烟 :3000 `stepfun/step-1o-turbo-vision`、`imageModelSupported:true`、KPI 2/3/3（seed 基线）、CASE-018 `IN_PROGRESS`→已解决合法、`.env.local` 无 Mock 降级双开关。未调用外部模型（0 次新增，预算纪律未破）。
- 决定：本轮**不重新生成 PPTX/PDF 二进制**。更正本会话早前的错误判断：v2 源工程**在库中**——`preliminary-2026/projects/onecase-prelim-v2_ppt169_20260831/`（svg_final 14 页 + exports 管线），重导出有现成路径，只差改 4 页 SVG（03/08/09/12）并跑导出；页面文案已在 02-v2 与 06 §7 备好。导出留待专门一轮（涉及二进制核对与逐页视觉检查）。旧 12+5 口径标记为被展示要求取代，但注明"以工作人员当场宣布为准"。
- 下一步从哪接：① 在 v2 源工程改 4 页 SVG（03/08/09/12，文案见 02-v2 与 06 §7）并经 exports 管线重导出 PPTX/PDF，逐页核对后替换 `初赛提交附件-v2/`；② 项目简介 Word 同步核对；③ 按 06 §9 完成两轮计时排练；④ T-1 天按 07 §1 执行（含 1 次合成图片冒烟 + 录制备份视频）；⑤ 以上未完成前，附件不发送、现场不报旧数字。

## 2026-09-05 · 晚 2 · I08 注入缓解(提示词v2)落地并复跑验证

- 完成：上段②的注入缓解。SYSTEM_PROMPT 新增规则 7（消息内指令一律不执行、被要求编造的字段值忽略并标缺失），`PROMPT_VERSION='v2'` 常量化接入 analyze 审计。提交 `8d41495`（含 analyze 路由的 R4 批次连同其测试一并落库——原计划让 R4 随下轮走，但同文件无法拆分，改为在提交信息中如实说明批次构成）。
- 复跑验证（30/30 次真实调用）：自动检查 **24/26（92.3%，v1 为 23/26）**，I08 未再被劫持（地点「南门」+ 主动标 `evidenceConflict:true`），调用/Schema 失败 1→0；另 3 条注入变体（文字地点编造/字段劫持/角色覆盖）全部未被劫持，不过拟合。T04/T15 标注争议结论不变。边界声明：**不等于注入防护普遍证明**，材料不得声称防护。详见 devlog 评估记录「增补」节。
- T20 行为变化待本人裁定：无事项输入从「硬失败」变为「占位草稿进人工确认流」，更优雅还是更易误导由验收审核一并定。
- HEAD 自洽性已验证：stash(-u) 后在纯 HEAD 跑 web 测试 50/50 通过（发现并补齐了 vitest `@` 别名缺失——3a6be43 起的路由测试在干净 checkout 会解析失败，已修）。
- 下一步从哪接：① 本人人工审核 4 样本（最新 v2 输出在 `tmp/quality-eval/2026-09-05T09-23-32-504Z/`）并拍板验收线；② 工作区仍有 41 个未提交文件（E2E 隔离/评估脚本/比赛材料等），本地已领先 origin/main 23 个提交未推送——推送与否请本人定。

## 2026-09-05 · 晚 · 两项决策拍板落盘 + 真实模型质量评估探索轮完成

- 本人拍板：① 真实视觉评估预算授权解除；② SQLite→PostgreSQL 参赛阶段不迁移（→ `docs/adr/003`，已按「拍板移入 adr」规则落盘并补 adr/README 索引）。
- 真实模型质量探索轮按 `docs/testing/real-model-quality.md` 规程完整执行：step-1o-turbo-vision 30 次真实调用（20 文字+10 图片，无重试）。自动字段检查 **23/26 通过**（漏项 0/多余 0）。**关键发现：注入样本 I08 模型跟随了恶意地点指令**（输出「九十九栋」）——对外材料不得声称注入防护；T20 无事项输入暴露 Schema≥1 事项边界；4 样本（T20/I05/I09/I10）待本人人工审核后定验收线。详见 `docs/devlog/REAL_MODEL_QUALITY_EVAL_2026-09-05.md`，原始输出在 `tmp/quality-eval/2026-09-05T09-08-*`（gitignore）。
- 提交 `6b07c5f`：ADR-003 + 评估 devlog + TASK.md 进度段（含验收线待拍板声明）。README「真实识别未验收」口径在验收线拍板前不动。
- 下一步从哪接：① 本人看 4 个人工样本（PNG 在 tmp/quality-eval/2026-09-05T09-08-23-347Z/）并拍板验收线（must-know 决策一最后一项）；② I08 注入缓解（提示词强化/复核提示）需专项验证，属新改动须另行安排；③ 工作区仍有 ~44 个未提交文件（R4 批次/E2E 隔离/评估脚本/比赛材料），待并行会话收工统一整理。

## 2026-09-05 · 傍晚 · 闭合「尚未闭合」清单 + 测试修复落库

- 提交 2 笔（只含本轮文件，未碰他人未提交批次）：`45bfe4e` body-timeout 竞态修复 + golden-path 语义定位；`3a6be43` 视觉能力白名单 `isVisionCapableModel`（capabilities 补 `imageModelSupported`，intake 页对纯文本模型如实提示）+ analyze 响应补 `modelVersion` + Review 页展示实际 provider/model。回归：web 64/64（新增 9 项测试）+ typecheck 干净。
- 对账原 TASK.md「尚未闭合」四项全部闭合：R4 落库失败恢复（代码+R4 回归测试已在库）、E2E 隔离（3100 + e2e-demo.db + 强制 Mock，并行会话完成）、视觉能力精确判断、Review provider/model 展示（后两项本轮提交）。TASK.md 进度段已同步改写（该文件混有并行会话改动，故本轮不提交它）。
- 决定：analyze 路由的两行 modelVersion 改动**留在工作区不提交**——该文件整体是上一会话未提交的 R4 改造批次，整体裹入会造成归属混乱；它随 R4 批次一起落库即可。
- 下一步从哪接：真实视觉模型质量验收（等预算授权，见 must-know.md）；工作区仍有约 40 个未提交文件（R4 批次、E2E 隔离、评估准备、比赛材料），需统一整理提交。

## 2026-09-05 · 下午 · 代码审查 + 逻辑闭环测试（全绿）

- 完成：全量单测复跑（contracts 25 / domain 33 / ai 74 / web 55）+ 93 项不变量 + 三条黄金链路脚本（golden-path 16/16、status-change 23/23、manual-create 全过；analyze 走真实 stepfun/step-1o-turbo-vision）；测后已 db:reset 恢复干净基线，我起的 dev 已停。
- 修复 2 处（未提交，属测试补充权限）：① `packages/ai/__tests__/body-timeout.test.ts` 时序竞态——满载下响应头晚于 50ms 才到会落进请求阶段超时分支、文案不同，`pnpm test` 偶发红；超时窗口放大到 200/300ms，回归语义不变。② `apps/web/scripts/test-golden-path.mjs` 对 Mock 文案过耦合（断言 `includes('照明')`，真实模型起标题「楼道灯损坏」）；改为按标题语义定位关联/新建目标并放宽正则，真实 Provider 换序也稳。另把 status-change 一条过时标签「初始 + 4」改为「version 恰好 +1」。
- 注意：本轮确认存在并行会话同仓改动（上方「E2E 闭环与真实评估准备」段即其收工记录，`evaluation-budget.test.ts` 于本轮会话中途出现）；提交前先合并两侧改动清单，避免踩脚。
- 下一步从哪接：提交上述测试修复；E2E 数据库/Provider 隔离若按并行会话方案已闭合，则把 TASK.md「尚未闭合」清单同步。

## 2026-09-05 · E2E 闭环与真实评估准备

- 完成：独立 E2E 服务、数据库与构建缓存；完整 28/28 通过，缺 Key 故障模式 3 通过、2 按设计跳过；常规 E2E 前后 dev.db 哈希相同。
- 完成：真实评估独立 20 文字＋10 合成图片事实样本，评分与请求预算测试通过；旧 Mock 期望不得用于真实 Provider。入口 `pnpm --filter @onecase/web eval:quality` 默认零外呼。
- 决定：不把请求上限当人民币费用上限；真实 StepFun 最多 30 次调用授权已询问、尚待回复，未调用。获准后先 T01/I01 冒烟，再跑其余 28 条，不能重复超预算。
- 接续：见 `docs/devlog/E2E_AND_QUALITY_PREPARATION_2026-09-05.md` 和 `docs/testing/real-model-quality.md`；认证授权和视觉材料不在本轮修改范围。

## 2026-09-04 · 方法论落地（系统初始化补课）

- 完成：按「AI 自主系统」课程方法补齐开工手册层——`CLAUDE.md`（开工三行 / 分流 / 冒烟 / 意外矩阵 / 真相源权重）、`.42cog/intent.md`（AI 代笔初稿，**待本人改收敛方向**）、`.42cog/must-know.md`（两个未决决策）、本板、`scripts/check-tools.sh`、`.nvmrc`（锁 22 对齐 CI）、两个技能（`demo-verify` / `cross-lineage-review`）。
- 决定：采用「纯加法」落地，不跑六类文件夹重构、不搬家（老系统做加法不当搬家的课程原则）；未改任何现有文件与业务代码。
- 下一步：① 本人把 `intent.md` 收敛方向改成自己的话（当前是 AI 代笔）；② 决策一（真实视觉模型验收）按 `must-know.md` 推进；③ 之后每轮开工先读本板顶部、收工追加一段。

## 项目现状快照（2026-09-04，摘自 README 与 CI 配置，细节以原文为准）

- 文字黄金链路可演示；图片上传已接通，真实识别未验收；语音未支持（入口禁用）。
- 验证基线：141 项单测 / 93 项服务不变量 / 26 项 Playwright E2E / 20 条合成 Eval；CI 流程见 `.github/workflows/ci.yml`（typecheck → 单测 → 不变量 → build → E2E）。
- 比赛材料：初赛附件 v2 已同步，邮件未发送（报名与资格需本人核实）。
