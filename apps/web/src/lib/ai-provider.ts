// lib/ai-provider.ts
// Provider 装配: 通过 AI_PROVIDER 环境变量选择 mock | qwen | openai (packages/ai 工厂)
// 边界约束: 真实 Provider 配置缺失/非法时降级 Mock —— 黄金链路不依赖外部服务 (TASK.md Phase 4)
// 审计: getProviderInfo 返回实际生效的 provider/model,降级时如实记录为 mock
import { createProvider, MockProvider, type ExtractionProvider } from '@onecase/ai'

export type ProviderType = 'mock' | 'qwen' | 'openai'

interface AssembledProvider {
  client: ExtractionProvider
  /** 实际生效的 provider (配置降级时为 mock) */
  actual: ProviderType
}

let cached: AssembledProvider | null = null

function assemble(): AssembledProvider {
  const raw = (process.env.AI_PROVIDER || 'mock').toLowerCase()
  const requested: ProviderType =
    raw === 'qwen' || raw === 'openai' ? raw : 'mock'

  if (requested === 'mock') {
    return { client: new MockProvider(), actual: 'mock' }
  }

  try {
    const client = createProvider({
      type: requested,
      apiKey: requested === 'qwen' ? process.env.QWEN_API_KEY : process.env.OPENAI_API_KEY,
      model:
        (requested === 'qwen' ? process.env.QWEN_MODEL : process.env.OPENAI_MODEL) || undefined,
      timeoutMs: Number(process.env.AI_TIMEOUT_MS) || 30000,
      maxRetries: Number(process.env.AI_MAX_RETRIES ?? 1),
    })
    return { client, actual: requested }
  } catch (e) {
    console.warn(
      `[ai-provider] ${requested} 配置不可用 (${e instanceof Error ? e.message : e}),降级为 MockProvider`
    )
    return { client: new MockProvider(), actual: 'mock' }
  }
}

function getAssembled(): AssembledProvider {
  if (!cached) cached = assemble()
  return cached
}

export function getExtractionProvider(): ExtractionProvider {
  return getAssembled().client
}

/** 写入 IntakeAnalysis 审计: 记录实际生效的 provider/model,而非环境变量的期望值 */
export function getProviderInfo(): { provider: ProviderType; modelVersion: string } {
  const actual = getAssembled().actual
  const modelVersion =
    actual === 'qwen'
      ? process.env.QWEN_MODEL || 'qwen2.5-vl-72b-instruct'
      : actual === 'openai'
      ? process.env.OPENAI_MODEL || 'gpt-4o'
      : 'mock-v1'
  return { provider: actual, modelVersion }
}

export async function analyzeIntake(rawText: string) {
  return getExtractionProvider().extractCaseDraft({ rawText })
}
