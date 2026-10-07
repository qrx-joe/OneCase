// packages/ai/__tests__/openai-provider.test.ts
// OpenAI Provider Unit Tests (Mocked fetch)
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { OpenAIProvider } from '../src/openai-provider'

const VALID_CONTENT = JSON.stringify({
  issues: [
    {
      title: 'OpenAI 测试',
      impact: 'MEDIUM',
      urgency: 'LOW',
    },
  ],
})

describe('OpenAIProvider (Mocked)', () => {
  let provider: OpenAIProvider

  beforeEach(() => {
    provider = new OpenAIProvider('test-api-key', 'gpt-4o', {
      timeoutMs: 500,
      maxRetries: 0,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('应该正确解析 OpenAI 响应格式', async () => {
    const fetchMock = vi.fn((_url: string) =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({ choices: [{ message: { content: VALID_CONTENT } }] }),
      } as Response)
    )
    global.fetch = fetchMock as unknown as typeof fetch

    const result = await provider.extractCaseDraft({
      rawText: 'OpenAI 测试',
    })

    expect(result.issues).toHaveLength(1)
    expect(result.issues[0].title).toBe('OpenAI 测试')
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.openai.com/v1/chat/completions')
  })

  it('API 401 应该抛出认证错误且不重试', async () => {
    const retryProvider = new OpenAIProvider('bad-key', 'gpt-4o', {
      timeoutMs: 500,
      maxRetries: 3,
    })
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Invalid API key'),
      })
    )
    global.fetch = fetchMock as unknown as typeof fetch

    await expect(retryProvider.extractCaseDraft({ rawText: 'test' })).rejects.toThrow(
      /AI API error 401/
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it.each([
    null,
    'invalid envelope',
    { choices: null },
    { choices: { 0: { message: { content: VALID_CONTENT } } } },
    { choices: [null] },
    { choices: [{ message: null }] },
    { choices: [{ message: { content: 123 } }] },
  ])('未知响应结构 %j 应返回 ProviderError', async (body) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(body)))
    global.fetch = fetchMock as typeof fetch

    await expect(provider.extractCaseDraft({ rawText: '合成测试' })).rejects.toMatchObject({
      name: 'ProviderError', message: 'AI response has no content', retryable: true,
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('500 应该重试', async () => {
    const retryProvider = new OpenAIProvider('test-api-key', 'gpt-4o', {
      timeoutMs: 500,
      maxRetries: 1,
    })
    const fetchMock = vi.fn((_url: string) =>
      Promise.resolve({ ok: false, status: 500, text: () => Promise.resolve('Internal error') } as Response)
    )
      .mockResolvedValueOnce({ ok: false, status: 500, text: () => Promise.resolve('Internal error') } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ choices: [{ message: { content: VALID_CONTENT } }] }),
      } as Response)
    global.fetch = fetchMock as unknown as typeof fetch

    const result = await retryProvider.extractCaseDraft({ rawText: 'test' })
    expect(result.issues).toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
