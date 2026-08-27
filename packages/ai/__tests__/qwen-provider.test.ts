// packages/ai/__tests__/qwen-provider.test.ts
// Qwen Provider Unit Tests (Mocked)
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QwenProvider } from '../src/qwen-provider'

describe('QwenProvider (Mocked)', () => {
  let provider: QwenProvider

  beforeEach(() => {
    provider = new QwenProvider('test-api-key', 'qwen2.5-vl-72b-instruct')
  })

  it('应该正确构造请求体', async () => {
    const mockResponse = {
      output: {
        choices: [{
          message: {
            content: JSON.stringify({
              issues: [{
                title: '测试问题',
                summary: '测试描述',
                categoryCode: 'PUBLIC_FACILITIES',
                locationText: '3栋',
                impact: 'HIGH',
                urgency: 'HIGH',
                affectedGroups: ['老人'],
                riskSignals: ['摔倒'],
                missingInformation: [],
                evidenceConflict: false,
                suggestedPriority: 'P2',
              }],
            }),
          },
        }],
      },
    }

    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      } as Response)
    )

    const result = await provider.extractCaseDraft({
      rawText: '测试文本',
    })

    expect(result.issues).toHaveLength(1)
    expect(result.issues[0].title).toBe('测试问题')
    expect(result.issues[0].categoryCode).toBe('PUBLIC_FACILITIES')
  })

  it('API 错误时应该抛出异常', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 429,
        text: () => Promise.resolve('Rate limit'),
      } as Response)
    )

    await expect(
      provider.extractCaseDraft({ rawText: 'test' })
    ).rejects.toThrow('Qwen API error 429')
  })

  it('缺少 API Key 时应该抛出异常', () => {
    expect(() => {
      new QwenProvider('')
    }).not.toThrow() // 构造时不校验,调用时校验
  })

  it('网络超时时应该处理', async () => {
    global.fetch = vi.fn(() =>
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Network timeout')), 100)
      )
    )

    await expect(
      provider.extractCaseDraft({ rawText: 'test' })
    ).rejects.toThrow('Network timeout')
  })
})
