// Provider 装配单元测试 (整改简报 §6)
// 不变量: 未知 provider 不得静默当 Mock;配置失败只有明确 Demo 双开关才降级
import { describe, it, expect } from 'vitest'
import { resolveProviderConfig, assembleProvider, isVisionCapableModel } from '../ai-provider'

const DEMO_FALLBACK_ENV = {
  AI_PROVIDER: 'qwen',
  DEMO_MODE: 'true',
  AI_ALLOW_MOCK_FALLBACK: 'true',
}

describe('resolveProviderConfig', () => {
  it('未知 AI_PROVIDER 必须抛错,不得静默使用 Mock', () => {
    expect(() => resolveProviderConfig({ AI_PROVIDER: 'chatgpt' })).toThrow(/AI_PROVIDER 配置错误/)
    expect(() => resolveProviderConfig({ AI_PROVIDER: 'MOCK' })).not.toThrow() // 大小写归一
    expect(resolveProviderConfig({}).type).toBe('mock') // 缺省 mock
  })

  it('qwen/openai/stepfun 缺 Key 时保留类型,由装配层决定降级或抛错', () => {
    expect(resolveProviderConfig({ AI_PROVIDER: 'qwen' }).type).toBe('qwen')
    expect(resolveProviderConfig({ AI_PROVIDER: 'openai' }).apiKey).toBeUndefined()
    expect(resolveProviderConfig({ AI_PROVIDER: 'stepfun' })).toMatchObject({
      type: 'stepfun',
      apiKey: undefined,
      model: 'step-1o-turbo-vision',
    })
  })

  it('stepfun 解析独立 Key/Model,不串用 OpenAI 配置', () => {
    expect(resolveProviderConfig({
      AI_PROVIDER: 'stepfun',
      STEPFUN_API_KEY: 'stepfun-key',
      STEPFUN_MODEL: 'step-1v-8k',
      OPENAI_API_KEY: 'openai-key',
      OPENAI_MODEL: 'gpt-4o',
    })).toMatchObject({
      type: 'stepfun',
      apiKey: 'stepfun-key',
      model: 'step-1v-8k',
    })
  })

  it('Mock 降级双开关: 必须同时满足 DEMO_MODE=true 与 AI_ALLOW_MOCK_FALLBACK=true', () => {
    expect(resolveProviderConfig({ AI_PROVIDER: 'qwen' }).allowMockFallback).toBe(false)
    expect(resolveProviderConfig({ ...DEMO_FALLBACK_ENV, DEMO_MODE: 'true' }).allowMockFallback).toBe(true)
    expect(resolveProviderConfig({ ...DEMO_FALLBACK_ENV, AI_ALLOW_MOCK_FALLBACK: 'false' }).allowMockFallback).toBe(false)
  })

  it('AI_MAX_RETRIES/AI_TIMEOUT_MS 非法值回退默认,不产生负数/NaN', () => {
    expect(resolveProviderConfig({ AI_MAX_RETRIES: 'abc' }).maxRetries).toBe(1)
    expect(resolveProviderConfig({ AI_MAX_RETRIES: '-3' }).maxRetries).toBe(1)
    expect(resolveProviderConfig({ AI_MAX_RETRIES: '2.9' }).maxRetries).toBe(2)
    expect(resolveProviderConfig({ AI_TIMEOUT_MS: 'abc' }).timeoutMs).toBe(30000)
    expect(resolveProviderConfig({ AI_TIMEOUT_MS: '5000' }).timeoutMs).toBe(5000)
  })
})

describe('assembleProvider', () => {
  it('mock 正常装配', () => {
    const assembled = assembleProvider({ AI_PROVIDER: 'mock' })
    expect(assembled.actual).toBe('mock')
    expect(assembled.degraded).toBe(false)
  })

  it('qwen 无 Key 且非 Demo: 抛出配置错误 (不静默降级 Mock)', () => {
    expect(() => assembleProvider({ AI_PROVIDER: 'qwen' })).toThrow(/AI Provider 配置不可用/)
    expect(() => assembleProvider({ AI_PROVIDER: 'openai' })).toThrow(/AI Provider 配置不可用/)
    expect(() => assembleProvider({ AI_PROVIDER: 'stepfun' })).toThrow(/AI Provider 配置不可用/)
  })

  it('明确 Demo 双开关开启时才降级 Mock,且 actual 如实记录为 mock', () => {
    const assembled = assembleProvider(DEMO_FALLBACK_ENV)
    expect(assembled.actual).toBe('mock')
    expect(assembled.degraded).toBe(true)
    expect(assembled.modelVersion).toBe('mock-v1')
  })

  it('stepfun 成功装配时审计实际 provider/model', () => {
    const assembled = assembleProvider({
      AI_PROVIDER: 'stepfun',
      STEPFUN_API_KEY: 'test-key',
      STEPFUN_MODEL: 'step-1v-8k',
    })
    expect(assembled.actual).toBe('stepfun')
    expect(assembled.modelVersion).toBe('step-1v-8k')
    expect(assembled.degraded).toBe(false)
  })

  it('stepfun 配置失败只在 Demo 双开关下降级并审计 mock', () => {
    const assembled = assembleProvider({
      AI_PROVIDER: 'stepfun',
      DEMO_MODE: 'true',
      AI_ALLOW_MOCK_FALLBACK: 'true',
    })
    expect(assembled.actual).toBe('mock')
    expect(assembled.modelVersion).toBe('mock-v1')
    expect(assembled.degraded).toBe(true)
  })
})

describe('isVisionCapableModel (保守白名单,宁缺勿冒认)', () => {
  it('Mock 永远不宣称视觉能力', () => {
    expect(isVisionCapableModel('mock', 'mock-v1')).toBe(false)
    expect(isVisionCapableModel('mock', '')).toBe(false)
  })

  it('qwen: vl/omni 系列为视觉,纯文本系列不算', () => {
    expect(isVisionCapableModel('qwen', 'qwen2.5-vl-72b-instruct')).toBe(true)
    expect(isVisionCapableModel('qwen', 'qwen-vl-plus')).toBe(true)
    expect(isVisionCapableModel('qwen', 'qwen-omni-turbo')).toBe(true)
    expect(isVisionCapableModel('qwen', 'qwen-turbo')).toBe(false)
    expect(isVisionCapableModel('qwen', 'qwen2.5-72b-instruct')).toBe(false)
    expect(isVisionCapableModel('qwen', 'qwen-long')).toBe(false)
  })

  it('openai: 4o/4.1/turbo/o 系为视觉,gpt-3.5 与基础 gpt-4 不算', () => {
    expect(isVisionCapableModel('openai', 'gpt-4o')).toBe(true)
    expect(isVisionCapableModel('openai', 'gpt-4o-mini')).toBe(true)
    expect(isVisionCapableModel('openai', 'gpt-4.1')).toBe(true)
    expect(isVisionCapableModel('openai', 'gpt-4-turbo')).toBe(true)
    expect(isVisionCapableModel('openai', 'gpt-3.5-turbo')).toBe(false)
    expect(isVisionCapableModel('openai', 'gpt-4')).toBe(false)
  })

  it('stepfun: 1o/1v/3v 系列为视觉,纯文本系列不算', () => {
    expect(isVisionCapableModel('stepfun', 'step-1o-turbo-vision')).toBe(true)
    expect(isVisionCapableModel('stepfun', 'step-1v-8k')).toBe(true)
    expect(isVisionCapableModel('stepfun', 'step-2-16k')).toBe(false)
    expect(isVisionCapableModel('stepfun', 'step-1-8k')).toBe(false)
  })

  it('未知模型名一律 false,不冒认', () => {
    expect(isVisionCapableModel('qwen', 'unknown-model-x')).toBe(false)
    expect(isVisionCapableModel('stepfun', '')).toBe(false)
  })
})
