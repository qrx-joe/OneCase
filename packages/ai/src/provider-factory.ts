// AI Provider 工厂
import { ExtractionProvider } from './provider'
import { MockProvider } from './mock-provider'
import { QwenProvider } from './qwen-provider'
import { OpenAIProvider } from './openai-provider'

export type ProviderType = 'mock' | 'qwen' | 'openai'

export interface ProviderConfig {
  type: ProviderType
  apiKey?: string
  model?: string
}

export function createProvider(config: ProviderConfig): ExtractionProvider {
  switch (config.type) {
    case 'mock':
      return new MockProvider()

    case 'qwen':
      if (!config.apiKey) {
        throw new Error('Qwen API key is required')
      }
      return new QwenProvider(config.apiKey, config.model)

    case 'openai':
      if (!config.apiKey) {
        throw new Error('OpenAI API key is required')
      }
      return new OpenAIProvider(config.apiKey, config.model)

    default:
      throw new Error(`Unknown provider type: ${config.type}`)
  }
}
