import { describe, expect, it } from 'vitest'
import { MockProvider } from '../src/mock-provider'
import { OpenAIProvider } from '../src/openai-provider'
import { createProvider } from '../src/provider-factory'
import { QwenProvider } from '../src/qwen-provider'
import { StepFunProvider } from '../src/stepfun-provider'

describe('createProvider', () => {
  it('保留 mock/qwen/openai 并装配 stepfun', () => {
    expect(createProvider({ type: 'mock' })).toBeInstanceOf(MockProvider)
    expect(createProvider({ type: 'qwen', apiKey: 'test' })).toBeInstanceOf(QwenProvider)
    expect(createProvider({ type: 'openai', apiKey: 'test' })).toBeInstanceOf(OpenAIProvider)
    expect(createProvider({ type: 'stepfun', apiKey: 'test' })).toBeInstanceOf(StepFunProvider)
  })

  it('stepfun 缺少 API Key 时显式失败', () => {
    expect(() => createProvider({ type: 'stepfun' })).toThrow('StepFun API key is required')
  })
})
