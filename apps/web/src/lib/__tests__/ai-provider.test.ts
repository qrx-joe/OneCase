// Provider 装配单元测试 (整改简报 §6)
// 不变量: 未知 provider 不得静默当 Mock;配置失败只有明确 Demo 双开关才降级
import { describe, it, expect } from 'vitest'
import { resolveProviderConfig, assembleProvider } from '../ai-provider'

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

  it('qwen/openai 缺 Key 时保留类型,由装配层决定降级或抛错', () => {
    expect(resolveProviderConfig({ AI_PROVIDER: 'qwen' }).type).toBe('qwen')
    expect(resolveProviderConfig({ AI_PROVIDER: 'openai' }).apiKey).toBeUndefined()
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
  })

  it('明确 Demo 双开关开启时才降级 Mock,且 actual 如实记录为 mock', () => {
    const assembled = assembleProvider(DEMO_FALLBACK_ENV)
    expect(assembled.actual).toBe('mock')
    expect(assembled.degraded).toBe(true)
  })
})
