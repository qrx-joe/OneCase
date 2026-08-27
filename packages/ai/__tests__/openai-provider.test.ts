// packages/ai/__tests__/openai-provider.test.ts
// OpenAI Provider Unit Tests (Mocked)
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { OpenAIProvider } from '../src/openai-provider'

describe('OpenAIProvider (Mocked)', () => {
  let provider: OpenAIProvider

  beforeEach(() => {
    provider = new OpenAIProvider('test-api-key', 'gpt-4o')
  })

  it('应该正确解析 OpenAI 响应格式', async () => {
    const mockResponse = {
      choices: [{
        message: {
          content: JSON.stringify({
            issues: [{
              title: 'OpenAI 测试',
              impact: 'MEDIUM',
              urgency: 'LOW',
              affectedGroups: [],
              riskSignals: [],
              missingInformation: [],
              evidenceConflict: false,
            }],
          }),
        },
      }],
    }

    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      } as Response)
    )

    const result = await provider.extractCaseDraft({
      rawText: 'OpenAI 测试',
    })

    expect(result.issues).toHaveLength(1)
    expect(result.issues[0].title).toBe('OpenAI 测试')
  })

  it('API 401 应该抛出认证错误', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Invalid API key'),
      } as Response)
    )

    await expect(
      provider.extractCaseDraft({ rawText: 'test' })
    ).rejects.toThrow('OpenAI API error 401')
  })
})
