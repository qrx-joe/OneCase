# ADR-001: 选择 Modular Monolith 而非微服务

**状态**: Accepted  
**日期**: 2026-08-27  
**决策者**: OneCase Team

## 背景

72h 黑客松时间窗口极短,需要在"可扩展架构"与"快速交付"之间做平衡。

**需求约束**:
- 快速验证产品假设,不先过度设计基础设施
- 保留未来拆分为服务的可能性
- 单人或小团队开发,运维复杂度必须低
- 核心边界清晰: Intake / Analysis / Case / Duplicate / Priority / AI

**可选方案**:
1. 单体应用 (Monolith)
2. Modular Monolith
3. 微服务 (Microservices)

## 决策

采用 **Modular Monolith (模块化单体)** 架构。

**具体实现**:
- 单个 Next.js App + 内部目录边界 (`packages/`)
- 模块间通过接口通信,不直接依赖实现
- 数据库共享,但按模块划分 Schema/Table 职责
- 后续可根据流量/团队规模拆分为独立服务

**目录结构**:
```
packages/
  domain/   # 纯业务逻辑,无框架依赖
  db/       # Prisma Schema + Migrations
  ai/       # Provider Abstraction
  contracts/# Zod Schemas
```

## 后果

### 正面
- ✅ **开发效率高**: 单进程/单数据库,调试/部署简单
- ✅ **模块边界清晰**: 未来拆服务成本低
- ✅ **性能损耗小**: 无 RPC/网络开销
- ✅ **测试成本低**: 单仓库 CI/CD

### 负面
- ⚠️ **耦合风险**: 需要开发纪律保持边界
- ⚠️ **部署粒度粗**: 无法独立部署某个模块
- ⚠️ **技术栈受限**: 全仓库统一语言/框架

## 替代方案

### 方案 A: 纯单体应用 (无模块边界)
**原因不采用**: 72h 后可维护性差,边界模糊会导致后续重构成本高。

### 方案 B: 微服务
**原因不采用**:
- 72h 内无法完成基础设施搭建
- 运维复杂度超出单人能力
- 过早优化,当前无真实吞吐/并发证据

---

**参考资料**:
- [TECH_SPEC.md §4 模块边界](docs/architecture/TECH_SPEC.md#4-模块边界)
- [TECH_SPEC.md §5 核心数据模型](docs/architecture/TECH_SPEC.md#5-核心数据模型)
