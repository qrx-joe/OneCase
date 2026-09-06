# Architecture Decision Records (ADR)

本目录记录 OneCase 项目的关键架构决策。

## 格式

每个 ADR 文件遵循 [Michael Nygard 格式](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions):

```markdown
# ADR-XXX: 标题

**状态**: Proposed | Accepted | Deprecated | Superseded
**日期**: YYYY-MM-DD
**决策者**: 姓名/团队

## 背景
问题与上下文

## 决策
具体决策内容

## 后果
正面/负面影响

## 替代方案
考虑但未采用的方案
```

## 已记录决策

| ADR | 标题 | 状态 |
|---|---|---|
| [001](001-modular-monolith.md) | Modular Monolith 工程边界 | Accepted |
| [002](002-mock-provider-first.md) | MockProvider First,后接真实 AI | Accepted |
| [003](003-sqlite-postgresql-timing.md) | SQLite→PostgreSQL 迁移时机——参赛阶段不迁移 | Accepted |
| [004](004-channel-integration-layer.md) | 消息渠道接入层——飞书/钉钉/企业微信入站 webhook | Accepted |

---

**核心理念**: 记录"为什么",而非"是什么"。代码说明"是什么",注释说明"为什么",ADR 记录"为什么选择这个而不是那个"。
