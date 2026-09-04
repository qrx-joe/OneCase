// AI Provider 工厂
import { ExtractionProvider } from './provider'
import { MockProvider } from './mock-provider'
import { QwenProvider } from './qwen-provider'
import { OpenAIProvider } from './openai-provider'
import { StepFunProvider } from './stepfun-provider'

export type ProviderType = 'mock' | 'qwen' | 'openai' | 'stepfun'

export interface ProviderConfig {
  type: ProviderType
  apiKey?: string
  model?: string
  /** 单次请求超时 (毫秒),默认 30000 */
  timeoutMs?: number
  /** 失败后的额外重试次数,默认 1 */
  maxRetries?: number
}

export function createProvider(config: ProviderConfig): ExtractionProvider {
  switch (config.type) {
    case 'mock':
      return new MockProvider()

    case 'qwen':
      if (!config.apiKey) {
        throw new Error('Qwen API key is required')
      }
      return new QwenProvider(config.apiKey, config.model ?? 'qwen2.5-vl-72b-instruct', {
        timeoutMs: config.timeoutMs,
        maxRetries: config.maxRetries,
      })

    case 'openai':
      if (!config.apiKey) {
        throw new Error('OpenAI API key is required')
      }
      return new OpenAIProvider(config.apiKey, config.model ?? 'gpt-4o', {
        timeoutMs: config.timeoutMs,
        maxRetries: config.maxRetries,
      })

    case 'stepfun':
      if (!config.apiKey) {
        throw new Error('StepFun API key is required')
      }
      return new StepFunProvider(config.apiKey, config.model ?? 'step-1o-turbo-vision', {
        timeoutMs: config.timeoutMs,
        maxRetries: config.maxRetries,
      })

    default:
      throw new Error(`Unknown provider type: ${config.type}`)
  }
}
