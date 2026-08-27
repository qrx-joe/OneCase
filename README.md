# OneCase - 社区事项 AI 工作台

**版本**: v0.1 MVP Baseline  
**状态**: 72h Hackathon Demo  
**更新日期**: 2026-08-27

---

## 项目简介

OneCase 是面向社区工作人员的 AI Intake & Case Management Layer。

**核心价值**: 把分散的居民反馈（微信文字、截图、图片）转化为可确认、可关联、可跟踪的社区事项。

**核心判断**:
```
Message != Case
AI Draft != Business Fact
```

**黄金链路**:
```
Resident Intake
→ AI Eventization
→ 1..N Case Drafts
→ Duplicate Candidates
→ Human Review
→ Create or Link Case
→ Case Workflow / Timeline / Dashboard
```

---

## 项目结构

```
onecase/
├── apps/
│   ├── web/              # Next.js Web 应用 (主入口)
│   └── worker/           # AI 异步任务 Worker (待后续)
├── packages/
│   ├── domain/           # 纯业务逻辑 (Case/Intake/Duplicate/Priority)
│   ├── db/               # Prisma Schema + Migrations
│   ├── ai/               # Provider Abstraction + MockProvider
│   ├── contracts/        # Zod Schemas + Type Guards
│   └── ui/               # 共享组件库
├── docs/
│   ├── product/          # PRD.md
│   ├── architecture/     # TECH_SPEC.md
│   └── adr/              # Architecture Decision Records
├── README.md             # 本文件
├── .env.example          # 环境变量模板
├── package.json          # 工作区根配置
└── pnpm-workspace.yaml   # pnpm workspace 配置
```

**单 App 模式**: 72h 单人开发时,先使用单个 Next.js app + 内部模块边界,不为目录形式机械拆包。

---

## 快速开始

### 前置要求

- Node.js >= 18 (当前: v24.13.0)
- pnpm >= 8 (建议最新)
- PostgreSQL >= 15 (本地开发)
- Git

### 初始化项目

```bash
# 1. 安装依赖 (工作区)
pnpm install

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env 填入实际值 (本地开发可保持默认)

# 3. 初始化数据库
pnpm db:push

# 4. 启动开发服务器
pnpm dev
```

访问 http://localhost:3000

---

## 核心命令

```bash
# 开发
pnpm dev              # 启动所有工作区服务
pnpm dev:web          # 仅启动 Web 应用
pnpm db:studio        # Prisma Studio 数据库可视化

# 构建
pnpm build            # 构建所有工作区
pnpm lint             # 运行 ESLint
pnpm typecheck        # TypeScript 类型检查
pnpm test             # 运行单元测试

# E2E
pnpm test:e2e         # 运行 Playwright 测试
pnpm test:e2e:ui      # Playwright UI 模式
```

**详细文档**: [docs/architecture/TECH_SPEC.md](docs/architecture/TECH_SPEC.md) | [docs/product/PRD.md](docs/product/PRD.md)

---

## Demo 模式

设置环境变量启用 Demo Mode:
```bash
DEMO_MODE=true pnpm dev
```

**Demo 特性**:
- 预置合成数据 (Demo Data 标识)
- MockProvider (断网/无 API Key 可运行)
- Demo Reset (仅 Demo Mode 可用)

**黄金链路演示**:
```
1. 新建 Intake: "三栋二单元那个灯又坏了,垃圾也没人清"
2. AI 识别: 2 个独立事项 (楼道照明 + 垃圾清运)
3. 重复检测: 发现相似 CASE-018 (楼道照明)
4. 人工确认: 关联 CASE-018 + 创建新垃圾清运 Case
5. 查看 Timeline: 居民反馈 → 关联已有事项
```

---

## 技术栈

| 层级 | 技术选型 | 备注 |
|------|---------|------|
| Web 框架 | Next.js 14+ (App Router) | TypeScript 默认 |
| UI | Tailwind CSS + Shadcn/ui | Apple 风格设计系统 |
| Database | PostgreSQL + pgvector | MVP 不使用独立 Vector DB |
| ORM | Prisma (待最终确认) | 或 Drizzle |
| 验证 | Zod | 所有外部输入 |
| 测试 | Vitest + Playwright | Unit + Integration + E2E |
| AI | Provider Abstraction + MockProvider | 先 Mock 后真实 |

---

## 设计规范

**视觉方向**: Apple 风格 + B2B 工作台密度
- 轻灰工作区 + 白色内容面
- 系统蓝 `#007AFF` 唯一主操作色
- 风险色只用于真实风险
- 动效: 150ms 微交互 / 240ms 状态切换 / 380ms 反馈

**详细设计文档**: [设计视觉规范 v1.0](D:\EdgeDownload\preview (2).html)

---

## 开发流程

### Phase 当前状态
- ✅ Phase 0: 固化基线 (进行中)
- ⏸ Phase 1: Domain First (待开始)
- ⏸ Phase 2: Mock 黄金链路 (待开始)
- ⏸ Phase 3: 真实 AI 与重复检测 (待开始)
- ⏸ Phase 4: Demo 就绪 (待开始)

详见 [TASK.md](TASK.md)

---

## 关键约束 (必须遵守)

1. **AI 只能生成 Draft**,创建/关联/关闭 Case 必须由用户触发
2. **未知字段保持 null/UNKNOWN**,不自动补齐猜测
3. **Demo 数据必须明确标记**,不声称未验证的效率/准确率
4. **不提交密钥/真实居民数据/Token**
5. **不使用 pnpm workspace 时,先删掉 pnpm-workspace.yaml**

---

## 贡献指南

当前阶段为个人 MVP 开发,不接受外部贡献。

---

## 许可证

MIT (待确认)

---

**核心理念**: 让工作人员在 3 秒内知道——发生了什么、什么最急、下一步做什么。
