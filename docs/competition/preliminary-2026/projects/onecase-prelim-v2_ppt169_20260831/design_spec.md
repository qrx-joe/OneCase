# OneCase 初赛路演 v2 - Design Spec

> 机器可读执行契约见 `spec_lock.md`；两者不一致时以 `spec_lock.md` 为准。

## I. Project Information

| Item | Value |
| ---- | ----- |
| **Project Name** | onecase-prelim-v2 |
| **Canvas Format** | PPT 16:9 (1280×720) |
| **Page Count** | 14（封面 1 + 主体 12 + Q&A 1；主体 ≤15 符合赛事细则） |
| **Design Style** | editorial（杂志编辑风）× narrative（故事弧叙事） |
| **Target Audience** | 江岸计划·AI 黑客松初赛评审（政务/协会/运营商背景，技术+商业混合视角） |
| **Use Case** | 2026-09-04~06 初赛登台，12 分钟展示 + 5 分钟问答 |
| **Delivery Purpose** | `balanced`（投影演示 + 评委细读混合） |
| **Content Strategy** | 视觉全新设计；事实、实测数字、红线合规声明全部保留，叙事结构按比赛必含模块重组 |
| **Created Date** | 2026-08-31 |

**赛事硬约束（Executor 必须遵守）**：16:9 画布；主体 ≤15 页；必含五模块（定位/团队/方案 Demo/背书/商业）；开源 License 标注；原创与 AI 辅助如实声明；测试数字只用 2026-08-31 实测值（116 单元 / 87 不变量 / 22 E2E / 6 包类型检查）。

---

## II. Canvas Specification

| Property | Value |
| -------- | ----- |
| **Format** | ppt169 |
| **Dimensions** | 1280×720 |
| **viewBox** | `0 0 1280 720` |
| **Margins** | 左右 64px，上下 52px |
| **Content Area** | 1152×616 |

---

## III. Visual Theme

### Theme Style

- **Mode**: narrative — 情境（一线整理之痛）→ 冲突（拆分与查重的重复劳动）→ 转折（AI 建议·人决定）→ 验证（工程证据）→ 展望（受控场景落地）。标题写成推进节拍的句子，不写标签。
- **Visual style**: editorial — 刊头线、眉题（kicker）、栏式结构、发丝规则线、衬线标题×无衬线正文的特稿骨相；直角（rx 0-4），无阴影，色彩克制（结构强调，非装饰）。
- **Theme**: Light（纸面 `#FAFAF7`）；P14 收尾用 `#1E4D40` 整版反白收束。
- **Tone**: 克制、可信、有人文温度的工程感——社区治理特稿。

### Color Scheme

| Role | HEX | Purpose |
| ---- | --- | ------- |
| **Background** | `#FAFAF7` | 纸面底 |
| **Secondary bg** | `#F0F2ED` | 栏块底、表头底 |
| **Primary** | `#1E4D40` | 标题墨色、深色版面、结构主色 |
| **Accent** | `#D97B29` | 唯一强调色：眉题、关键数字、pull-quote 规则线 |
| **Secondary accent** | `#5E8C7B` | 次级强调、图表辅助 |
| **Body text** | `#22302B` | 正文 |
| **Secondary text** | `#5C6B64` | 导语、注释 |
| **Tertiary text** | `#8A968F` | 页脚、来源行 |
| **Border/divider** | `#D8DED6` | 发丝规则线 |
| **Grid hairline** | `#E4E8E1` | 表格内线、更细分隔 |
| **Success** | `#2E7D5B` | 已实现状态 |
| **Warning** | `#B5442E` | 风险、待补状态 |

> editorial 用色纪律：版面以墨色文字为主，accent 仅用于每页一处最重要元素（眉题字、焦点数字或一条规则线）；primary 承担结构（标题、刊头、深色块）。Success/Warning 只出现在 P12 状态符。

### Gradient Scheme

无渐变（editorial 平面纪律）。

---

## IV. Typography System

### Font Plan

**Typography direction**: 特稿衬线——Georgia 拉丁衬线前导 + 中文落宋体作标题，微软雅黑正文。

| Role | Chinese | English | Fallback tail |
| ---- | ------- | ------- | ------------- |
| **Title** | `SimSun` | `Georgia` | `serif` |
| **Body** | `"Microsoft YaHei"` | `Arial` | `sans-serif` |
| **Emphasis** | `SimSun` | `Georgia` | `serif` |
| **Code** | — | `Consolas, "Courier New"` | `monospace` |

**Per-role font stacks**:

- Title: `Georgia, SimSun, serif`
- Body: `"Microsoft YaHei", Arial, sans-serif`
- Emphasis: same as Title
- Code: `Consolas, "Courier New", monospace`（仅技术栈/接口名用）

> 全部为 Windows/macOS 预装字体，PPT-safe；无需安装或嵌入。

### Font Size Hierarchy

**Baseline (px)**: Body = **24**（`balanced` 固定值）。

| Slot | px | 用途 |
| ---- | -- | ---- |
| cover_title | 72 | P01 封面主标题 |
| hero_headline | 68 | P04 宣言、P14 收尾大字 |
| hero_number | 48 | P09 KPI 焦点数字 |
| title | 42 | 内容页标题（每页锁定） |
| subtitle | 32 | 副标题/章节导语 |
| lead | 28 | standfirst 导语、pull quote |
| body | 24 | 正文 |
| annotation | 18 | 图注、卡片小标 |
| footnote | 16 | 页脚、来源行、页码 |

---

## V. Layout Principles

### Page Structure

- **Header**: 顶部刊头区 y 36-96：眉题（accent 小字+字距）→ 衬线大标题 → 发丝线。
- **Content**: y 120-640，栏式结构，1-2 栏为主。
- **Footer**: y 664-696：左侧项目名 `OneCase · 初赛路演`，右侧页码 `02 / 14`（footnote 色）。

### Layout Patterns

editorial 核心手法：**刊头三段式**（kicker → headline → standfirst）；**栏式对开**（P05 左右两半以中缝发丝线分隔）；**pull quote**（P02 居中大引语+左侧 accent 竖线）；**表格**（P13 License 表，表头 secondary_bg）；**KPI 大数字**（P09 三栏大数+来源行）。卡片最小化——用规则线和留白分组，必要时 rx=2 的浅底块。

**Spacing**: 安全边距 64/52；栏间距 40；块间距 28；发丝线 1px `#D8DED6`；图标-文字间距 12。

---

## VI. Icon Usage Specification

### Source

- 库：`tabler-outline`（线性，stroke 2，与发丝规则线同语言）。
- 用法：`<use data-icon="tabler-outline/<name>" .../>`；已同步至 `icons/tabler-outline/`。

### Icon Inventory（25 枚，已验证存在）

| Purpose | Icon | Page |
| ------- | ---- | ---- |
| 居民留言 | `tabler-outline/messages` | P02/P05 |
| 居民群像 | `tabler-outline/users` | P02 |
| 参赛者 | `tabler-outline/user` | P03 |
| 拆分 | `tabler-outline/arrows-split-2` | P05 |
| 关联 | `tabler-outline/link` | P05 |
| 人工确认 | `tabler-outline/circle-check` | P04/P05/P07 |
| 台账清单 | `tabler-outline/checklist` | P02 |
| 失败风险 | `tabler-outline/alert-triangle` | P07 |
| 重试 | `tabler-outline/refresh` | P07 |
| AI | `tabler-outline/cpu` | P08 |
| 数据层 | `tabler-outline/database` | P08 |
| 合规 | `tabler-outline/shield-check` | P13 |
| 统计 | `tabler-outline/chart-bar` | P11 |
| 收入 | `tabler-outline/coins` | P10 |
| 文档证据 | `tabler-outline/file-text` | P09/P13 |
| 跟踪链路 | `tabler-outline/route` | P04 |
| 地点 | `tabler-outline/map-pin` | P05 |
| 草稿编辑 | `tabler-outline/pencil` | P07 |
| 部署配置 | `tabler-outline/settings` | P10 |
| 试点推进 | `tabler-outline/stairs` | P12 |
| License | `tabler-outline/scale` | P13 |
| 里程碑 | `tabler-outline/flag` | P12 |
| 目标指标 | `tabler-outline/target` | P11 |
| 提效 | `tabler-outline/bolt` | P11 |
| 社区 | `tabler-outline/home` | P01/P14 |

> editorial 克制纪律：图标是辅助锚点，每页 ≤3 枚；结构靠排版不靠图标堆砌。

---

## VII. Visualization Reference List

Catalog read: 71 templates

| Page | Template | Path | Summary-quote (verbatim) | Usage |
| ---- | -------- | ---- | ------------------------ | ----- |
| P02 | vertical_list | `templates/charts/vertical_list.svg` | "Pick for 3-6 numbered key points each with a short description — design principles, core tenets, action items, key takeaways, recommendations, executive summary points." | 三个整理痛点编号列表 |
| P03 | labeled_card | `templates/charts/labeled_card.svg` | "Pick for 3-4 parallel aspects of one subject with per-aspect titles + short body (self-introduction, four-pillar overview, capability quadrant)." | 单人参赛者的三项承担 |
| P06 | numbered_steps | `templates/charts/numbered_steps.svg` | "Pick for 3-6 horizontal sequential steps with numeric emphasis — how-it-works section, getting-started guide, methodology overview, implementation phases." | Demo 四幕操作剧本 |
| P07 | quadrant_text_bullets | `templates/charts/quadrant_text_bullets.svg` | "Pick for any 2×2 framework where each quadrant holds a titled bullet list — SWOT (Strengths/Weaknesses/Opportunities/Threats, internal-external × helpful-harmful), Ansoff (Existing/New Markets × Existing/New Products), or any named two-axis matrix with text content." | 2×2 容错保护矩阵 |
| P08 | layered_architecture | `templates/charts/layered_architecture.svg` | "Pick for 3-4 horizontal architecture layers (presentation/service/data), 2-4 module cards per layer, each card = title + 1-line description (description required, even if source brief)." | 四层技术架构 |
| P09 | kpi_cards | `templates/charts/kpi_cards.svg` | "Pick for 4-8 standalone numeric metrics shown as overview cards (2x2 or 1x4) — exec summary opener, dashboard headline, quarterly recap, results-at-a-glance." | 116/87/22 实测三数（变体：1×3） |
| P10 | chevron_process | `templates/charts/chevron_process.svg` | "Pick for 3-6 phase methodology with chunky arrow-chain progression and deliverables per phase." | 共建→验证→采购三段路径 |
| P11 | vertical_pillars | `templates/charts/vertical_pillars.svg` | "Pick for 1×3 / 1×4 / 1×5 vertical column layout where each pillar = one independent category with title + bullets — PEST (Political/Economic/Social/Technological), four-pillar strategy overview, side-by-side independent categories." | 三类验证指标并列 |
| P12 | roadmap_vertical | `templates/charts/roadmap_vertical.svg` | "Pick for 4-8 milestones on a vertical timeline with status indicators." | 当前/试点前/后续三组状态 |
| P13 | basic_table | `templates/charts/basic_table.svg` | "Pick for plain tabular text/number grid, 3-8 columns." | License 标注表 |

**P05 标注 `no-template-match`**：扇出/汇聚双向关系图无目录模板——fallback 为 custom layout（左右栏对开+中缝发丝线+箭头路径），已核对 `module_composition`（父子容器包裹，无方向性）与 `client_server_flow`（请求响应语义）均不匹配。

**Runners-up considered**:

- `process_flow` | rejected for P04: 五步链路是宣言页的辅助元素，页面主视觉是大字宣言而非流程图
- `icon_grid` | rejected for P07: 四项容错是 2×2 语义矩阵（修改/事务/重复/失败四类保护），非并列功能卡陈列
- `team_roster` | rejected for P03: 单人团队无多卡片陈列需求，labeled_card 的"单主体多侧面"更贴切
- `vertical_pillars` | rejected for P12: 边界三组需要状态指示（已实现✓/待补○/评估◇），roadmap_vertical 的状态符语义更准

---

## VIII. Image Resource List

无图片行（`image_usage: none`，用户确认）。全程纯 SVG 排版绘制。

---

## IX. Content Outline

### Part 1 开场·情境

#### Slide 01 - 封面

- **Cover impact**: 钩子=居民原话（真实的群众声音比任何口号有力）；构图=期刊刊头式排版海报（typographic poster）——顶部细刊头线（眉题"AI+民生赛道 · 初赛路演"），中部超大衬线 OneCase + 中文副题，居民引语作 standfirst，底部信息行，无任何装饰图形。
- **Layout**: 刊头三段式，单栏居中偏左
- **Title**: OneCase
- **Standfirst**: "三栋二单元的灯又坏了……另外楼下垃圾今天也没人清。"——把这样的居民反馈，整理成可追踪的社区事项
- **Info**: 不理不器 · 乔瑞雪 · AI+民生赛道

#### Slide 02 - 问题

- **Layout**: pull quote 特写 + 三点编号列表
- **Title**: 一条居民留言，藏着两件事
- **Core message**: 反馈进入正式台账之前的"整理环节"——拆分与查重——是社区工作里被忽视的重复劳动。
- **Visualization**: vertical_list
- **Content**:
  - 引语（合成示例标注）：灯坏了 + 垃圾没人清，是两件事，要分别跟进
  - 01 一条消息 · 可能包含多个需分别处理的问题
  - 02 不同居民 · 可能重复反映同一个问题，不应重复建档
  - 03 工作人员 · 需要拆分、查重，再誊入台账
  - 直接用户：社区工作人员、网格员（居民是信息来源，暂不需要操作）
  - 诚实注：问题频率与成本尚未实测，属待验证假设

#### Slide 03 - 团队

- **Layout**: 左侧人物信息块 + 右侧三栏承担
- **Title**: 一个人，一个完整交付
- **Core message**: 单人参赛，围绕一个完整场景做了从产品定义到测试的闭环。
- **Visualization**: labeled_card
- **Content**:
  - 乔瑞雪 · 不理不器 · 1 人团队 · AI+民生赛道
  - 产品定义：社区事项整理的流程设计与业务规则（状态机、确认门禁、查重策略）
  - 全栈实现：Web 工作台、AI Provider 适配（Mock / Qwen / OpenAI）、数据层与 API
  - 质量与文档：单元测试、业务不变量测试、端到端流程测试与产品文档

### Part 2 转折·方案

#### Slide 04 - 原则宣言

- **Layout**: breathing 宣言页：大字 hero_headline 居中 + 底部五步链路细线图
- **Title**: 让 AI 提建议，让人做决定
- **Core message**: AI 只出草稿，正式事项必须经人确认——这是产品的第一原则，也是叙事的转折点。
- **Content**:
  - 宣言两行：AI 整理建议 / 人确认事实
  - 五步链路（route 图标引导）：居民文字反馈 → AI 事项草稿 → 人工检查 → 新建或关联 → 持续跟踪
  - 注：原始反馈、AI 草稿与正式事项分开保存；分析成功不会自动生成正式事项

#### Slide 05 - 两种关系

- **Layout**: 栏式对开：左栏 1→N 扇出图，右栏 N→1 汇聚图，中缝发丝线
- **Title**: 拆开问题，汇拢来源
- **Core message**: 一拆一合，构成"整理"的完整语义。
- **Visualization**: custom（no-template-match，对开关系图）
- **Content**:
  - 左（拆开）：居民反馈 A → 草稿 1 照明 / 草稿 2 清运
  - 右（汇拢）：反馈 A + 反馈 B →（人工确认）→ 同一事项 + 来源记录
  - 底注：相似候选按标题词汇、地点、类别、时间排序并展示依据；地点不同会提示；系统不自动合并，最终人核对

#### Slide 06 - Demo 剧本

- **Layout**: 四幕编号横排 + 底部演示说明条
- **Title**: 两分钟，一条反馈的两种去向
- **Core message**: 现场 Demo 完整走通"拆分 → 不同决策 → 数据联动"。
- **Visualization**: numbered_steps
- **Content**:
  - 01 粘贴一段反馈：同时包含照明与清运两个问题
  - 02 检查草稿与候选：两个草稿各带相似事项候选与匹配依据
  - 03 分别作出决策：照明关联已有事项；清运新建事项
  - 04 查看结果联动：来源、处理记录与首页统计变化
  - 说明：演示数据为合成样例；现场标注实际模型模式（真实 Provider 或 Mock 流程验证）

### Part 3 支撑·证据

#### Slide 07 - 容错

- **Layout**: 2×2 语义矩阵（发丝线分隔，非卡片）
- **Title**: 确认、修改、失败，都有路径
- **Core message**: 建议进入正式记录的每条路径都有保护。
- **Visualization**: quadrant_text_bullets
- **Content**:
  - 草稿可修改：新建事项采用人工确认后的标题、地点、优先级，并留修改记录
  - 批量确认：新建、关联与记录写入同一事务；决策不完整则整体拒绝
  - 防重复：已确认反馈拒绝重复确认（409）；状态门禁拦住非法流转
  - 失败兜底：AI 失败可重试；符合条件的反馈可转人工手动创建

#### Slide 08 - 架构

- **Layout**: 四层横条层叠 + 底部技术栈行
- **Title**: 模型提取与业务规则，各归其位
- **Core message**: 模型只负责从文字提出结构化建议；校验、排序与确认全部在业务层。
- **Visualization**: layered_architecture
- **Content**:
  - Web 工作台：输入、草稿检查、事项跟踪
  - AI 适配：Mock / Qwen / OpenAI 三种 Provider
  - 业务控制：Schema 校验、候选排序、人工确认门禁、状态机
  - 数据记录：原始反馈、草稿、事项、来源、处理记录全程留痕
  - 技术栈：Next.js · React · TypeScript · Zod · Prisma · SQLite
  - 注：真实模型效果需专项实测；重复候选未用 Embedding

#### Slide 09 - 案例与背书

- **Layout**: 三栏 KPI 大数字 + 三行成果 + 来源行
- **Title**: 可核验的，才是可信的
- **Core message**: 以可复核的工程证据立信，不以宣传数字代替验证。
- **Visualization**: kpi_cards（1×3 变体）
- **Content**:
  - 116 单元测试全过（覆盖 AI 契约、业务规则、查重服务）
  - 87 业务不变量全过（真实数据库集成断言）
  - 22 端到端流程全过（浏览器全链路，含 AI 降级路径）
  - 项目成果：文字整理到事项跟踪的 MVP 完整实现
  - 工程证据：源码、演示脚本与测试用例可现场复核
  - 如实说明：暂无客户与合作数据
  - 来源行：仓库自动化测试套件，2026-08-31 本机实测；另含 6 个子包类型检查全过

#### Slide 10 - 商业路径

- **Layout**: 三段 chevron 路径 + 四要素两栏
- **Title**: 从一个受控场景开始
- **Core message**: 先在真实流程中证明价值，再谈服务收费。
- **Visualization**: chevron_process
- **Content**:
  - 场景共建 → 流程验证 → 服务采购
  - 使用者：社区工作人员与网格员
  - 潜在付费方：社区服务运营主体（预算与采购路径需验证）
  - 候选收入：部署与配置服务费 + 持续运维服务费
  - 主要成本：模型调用、部署、安全合规、用户支持
  - 注：商业化为待验证方案，当前无已验证价格、合同或收入

### Part 4 展望·收束

#### Slide 11 - 验证计划

- **Layout**: 顶部实验设计条 + 三栏指标柱
- **Title**: 是否省时，是否增加误判
- **Core message**: 用对照实验让数据决定下一步投入。
- **Visualization**: vertical_pillars
- **Content**:
  - 实验设计：同一批经授权、脱敏的反馈——人工整理 vs OneCase 辅助整理，对照测量
  - 主要指标：从原始反馈到确认事项的中位耗时
  - 质量指标：漏项、关键字段错误、误关联、人工修改次数
  - 运行指标：模型失败率、人工兜底频次、单次使用成本
  - 结语：验收阈值与场景方共同确定；是否继续投入由实测数据决定

#### Slide 12 - 边界

- **Layout**: 纵向路线图三组（✓ 已实现 / ○ 试点前 / ◇ 后续评估 状态符）
- **Title**: 只讲已经实现的
- **Core message**: 如实划界，比夸大更能建立信任。
- **Visualization**: roadmap_vertical
- **Content**:
  - ✓ 当前已实现：文字输入与长度校验、草稿检查与编辑、相似候选与人工确认、事项跟踪与统计
  - ○ 试点前补齐：身份认证与权限、组织数据隔离、输入与访问限制、草稿找回
  - ◇ 后续评估：图片/语音输入、微信等渠道接入、语义检索（Embedding）
  - 注：页面中图片、语音入口样式尚未打通，不计入已实现能力

#### Slide 13 - 合规

- **Layout**: 左侧 License 表 + 右侧两块声明
- **Title**: 开源基础与本人贡献，分别说明
- **Core message**: 原创边界清晰，合规声明如实。
- **Visualization**: basic_table
- **Content**:
  - License 表：Next.js / React / Zod = MIT；Prisma = Apache-2.0；Lucide React = ISC
  - 全量核对注：2026-08-31 扫描仓库 27 个直接依赖（含开发工具），无 GPL 等传染性协议
  - 本人贡献：产品定义、业务规则设计、全部功能实现与测试均由本人独立完成；项目未公开发表、未商业化
  - AI 辅助：开发中使用 AI 编程工具辅助编码与测试；产品判断、方案取舍与最终验收由本人负责；框架、模型与第三方代码不表述为本人原创

#### Slide 14 - Q&A 收尾

- **Closing impact**: 留下的一句话 = "AI 整理建议，人确认事实"（与 P04 宣言呼应，首尾闭环）；构图 = 整版 `#1E4D40` 深松绿反白——从纸面开场到墨色收束，全书合上。
- **Layout**: 深色宣言页
- **Content**:
  - OneCase · 让每条反馈有去向，每个事项可追踪
  - 期待共建：真实场景 · 脱敏样本 · 流程评估
  - 乔瑞雪 · 不理不器 · AI+民生

---

## X. Speaker Notes Requirements

- `notes/total.md` 主文档带 `#` 页标题；split 后单页文件不带 `#`。
- 总时长 12 分钟；每页讲稿口语化（narrative register：对话感、每页桥接上一页），标注秒数预算。
- 累计约 10:20，预留约 1:40 切屏与操作缓冲。

---

## XI. Technical Constraints Reminder

1. viewBox `0 0 1280 720`；背景用 `<rect>`
2. 换行用 `<tspan>`；禁 `foreignObject` / `mask` / `<style>` / `class` / `textPath` / `animate*` / `script`
3. 透明度用 `fill-opacity` / `stroke-opacity`；禁 `rgba()`
4. 文本符号写原生 Unicode（— · →）；XML 保留字符转义 `&amp;` `&lt;` `&gt;`
5. marker 仅 `<defs>` 内 triangle/diamond/circle，`orient="auto"`
6. `<g opacity>` 禁用；逐子元素设置
7. 字体只写 spec_lock 锁定栈；尺寸只用锁定 slot 值
8. 图标仅用 `<use data-icon="tabler-outline/...">` 引用已同步清单
