// lib/ai-provider.ts
// Provider 装配: 通过 AI_PROVIDER 环境变量选择 mock | qwen | openai (packages/ai 工厂)
// 降级边界 (业务不变量): 真实 Provider 配置失败时,只有明确的 Demo 双开关才允许切换
// Mock (DEMO_MODE=true 且 AI_ALLOW_MOCK_FALLBACK=true);其他环境必须抛错,
// 让 analyze 写入 FAILED Analysis 并允许重试/手动兜底,不得把配置错误伪装成分析成功。
// 审计: getProviderInfo 返回实际生效的 provider/model,降级时如实记录为 mock
import { createProvider, MockProvider, type ExtractionProvider, type ExtractionInput } from '@onecase/ai'

export type ProviderType = 'mock' | 'qwen' | 'openai'

export interface ProviderEnvShape {
  AI_PROVIDER?: string
  QWEN_API_KEY?: string
  OPENAI_API_KEY?: string
  QWEN_MODEL?: string
  OPENAI_MODEL?: string
  DEMO_MODE?: string
  AI_ALLOW_MOCK_FALLBACK?: string
  AI_TIMEOUT_MS?: string
  AI_MAX_RETRIES?: string
}

export interface ResolvedProviderConfig {
  type: ProviderType
  apiKey?: string
  model?: string
  timeoutMs: number
  maxRetries: number
  /** 仅当明确 Demo 双开关开启时才允许配置失败降级 Mock */
  allowMockFallback: boolean
}

/** 纯函数: 环境变量 → Provider 配置。未知 provider 直接抛错,不静默当 mock。 */
export function resolveProviderConfig(
  env: Record<string, string | undefined> = process.env
): ResolvedProviderConfig {
  const raw = (env.AI_PROVIDER || 'mock').trim().toLowerCase()
  if (raw !== 'mock' && raw !== 'qwen' && raw !== 'openai') {
    throw new Error(
      `AI_PROVIDER 配置错误: "${env.AI_PROVIDER}" (仅支持 mock | qwen | openai)`
    )
  }

  const timeoutRaw = Number(env.AI_TIMEOUT_MS)
  const retriesRaw = Number(env.AI_MAX_RETRIES)

  return {
    type: raw,
    apiKey: raw === 'qwen' ? env.QWEN_API_KEY : env.OPENAI_API_KEY,
    model: (raw === 'qwen' ? env.QWEN_MODEL : env.OPENAI_MODEL) || undefined,
    timeoutMs: Number.isFinite(timeoutRaw) && timeoutRaw > 0 ? timeoutRaw : 30000,
    maxRetries: Number.isFinite(retriesRaw) && retriesRaw >= 0 ? Math.floor(retriesRaw) : 1,
    allowMockFallback: env.DEMO_MODE === 'true' && env.AI_ALLOW_MOCK_FALLBACK === 'true',
  }
}

interface AssembledProvider {
  client: ExtractionProvider
  /** 实际生效的 provider (Demo 降级时为 mock) */
  actual: ProviderType
  /** 是否发生了配置降级 (真实 provider 想用但失败,被 Demo 开关放行到 Mock) */
  degraded: boolean
}

/** 纯函数: 环境变量 → 实际装配结果。非 Demo 环境的配置失败会抛错。 */
export function assembleProvider(env: Record<string, string | undefined> = process.env): AssembledProvider {
  const config = resolveProviderConfig(env)

  if (config.type === 'mock') {
    return { client: new MockProvider(), actual: 'mock', degraded: false }
  }

  try {
    return { client: createProvider(config), actual: config.type, degraded: false }
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e)
    if (config.allowMockFallback) {
      console.warn(`[ai-provider] ${config.type} 配置不可用 (${reason}),Demo Mode 降级为 MockProvider`)
      return { client: new MockProvider(), actual: 'mock', degraded: true }
    }
    throw new Error(
      `AI Provider 配置不可用: ${reason}。修复配置,或在 Demo 环境设置 DEMO_MODE=true 与 AI_ALLOW_MOCK_FALLBACK=true 以允许 Mock 降级`
    )
  }
}

let cached: AssembledProvider | null = null

export function getExtractionProvider(): ExtractionProvider {
  if (!cached) cached = assembleProvider()
  return cached.client
}

/** 写入 IntakeAnalysis 审计: 记录实际生效的 provider/model,而非环境变量的期望值 */
export function getProviderInfo(): { provider: ProviderType; modelVersion: string } {
  const { actual } = cached ?? assembleProvider()
  const modelVersion =
    actual === 'qwen'
      ? process.env.QWEN_MODEL || 'qwen2.5-vl-72b-instruct'
      : actual === 'openai'
      ? process.env.OPENAI_MODEL || 'gpt-4o'
      : 'mock-v1'
  return { provider: actual, modelVersion }
}

export async function analyzeIntake(rawText: string, attachments?: ExtractionInput['attachments']) {
  return getExtractionProvider().extractCaseDraft({ rawText, attachments })
}
