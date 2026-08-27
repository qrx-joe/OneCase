# ADR-002: MockProvider First,后接真实 AI

**状态**: Accepted  
**日期**: 2026-08-27  
**决策者**: OneCase Team

## 背景

产品核心流程依赖 AI 结构化提取,但:

1. 72h Demo 期间网络/API Key 不可控
2. 真实多模态模型需要付费账号与调试时间
3. 产品/UI/交互流程应在 AI 可用前可验证
4. 必须证明"AI 故障时仍可手动完成"

**可选方案**:
1. 直接接入真实 Provider (Qwen/OpenAI)
2. Mock Provider 先,真实 Provider 后
3. 先完成 UI 壳,AI 延迟到后期

## 决策

采用 **MockProvider First,后接真实 AI** 策略。

**具体实现**:
1. 定义 `CaseExtractionProvider` 接口
2. 实现 `MockProvider` (返回预设结构化数据,可配置场景)
3. 业务层只依赖接口,不直接调用真实 Provider
4. Phase 2(黄金链路) 全流程使用 MockProvider
5. Phase 3 实现真实 Provider,保留 MockProvider 作为 fallback

**MockProvider 能力**:
- 返回符合 Schema 的 Draft (支持多事项、缺失字段)
- 可模拟超时/错误场景
- 支持 Hard Negative 重复检测场景

## 后果

### 正面
- ✅ **产品验证与 AI 解耦**: 不依赖 Provider 可用性
- ✅ **可重复 Demo**: 断网仍可演示核心链路
- ✅ **测试可控**: 可注入边缘场景 (超时/Schema 错误)
- ✅ **调试高效**: 无需等待真实 API 响应

### 负面
- ⚠️ **Mock 数据需人工维护**: 新增场景需更新 Mock
- ⚠️ **真实 Provider 特性可能遗漏**: 如多模态实际效果

## 替代方案

### 方案 A: 直接接真实 Provider
**原因不采用**: 72h 内网络/账号问题会阻塞演示,无法保证 Demo 稳定性。

### 方案 C: 先做 UI 壳,AI 延迟
**原因不采用**: 业务逻辑与 UI 无法分离验证,黄金链路无法独立测试。

---

**核心理念**: "先完成 Mock 黄金链路,再接真实 AI。" (TASK.md §5)
