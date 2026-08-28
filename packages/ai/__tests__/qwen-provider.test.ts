// packages/ai/__tests__/qwen-provider.test.ts
// Qwen Provider Unit Tests (Mocked fetch)
// 关键: mock 使用 DashScope compatible-mode 的真实响应形状 { choices } (OpenAI 兼容)
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { QwenProvider } from '../src/qwen-provider'

const VALID_CONTENT = JSON.stringify({
  issues: [
    {
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
    },
  ],
})

function okResponse(content: string) {
  return {
    ok: true,
    json: () => Promise.resolve({ choices: [{ message: { content } }] }),
  }
}

describe('QwenProvider (Mocked)', () => {
  let provider: QwenProvider

  beforeEach(() => {
    provider = new QwenProvider('test-api-key', 'qwen2.5-vl-72b-instruct', {
      timeoutMs: 500,
      maxRetries: 0,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('应该请求 compatible-mode 并解析真实响应形状', async () => {
    const fetchMock = vi.fn((_url: string) =>
      Promise.resolve(okResponse(VALID_CONTENT) as Response)
    )
    global.fetch = fetchMock as unknown as typeof fetch

    const result = await provider.extractCaseDraft({ rawText: '测试文本' })

    expect(result.issues).toHaveLength(1)
    expect(result.issues[0].title).toBe('测试问题')
    expect(result.issues[0].categoryCode).toBe('PUBLIC_FACILITIES')
    // DashScope OpenAI 兼容端点 (非 native /api/v1/services/...)
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'
    )
  })

  it('缺失的可选字段应归一化为 undefined,数组缺省为空', async () => {
    const minimal = JSON.stringify({
      issues: [{ title: '只有标题', impact: 'UNKNOWN', urgency: 'UNKNOWN' }],
    })
    global.fetch = vi.fn(() => Promise.resolve(okResponse(minimal))) as unknown as typeof fetch

    const result = await provider.extractCaseDraft({ rawText: '测试' })

    expect(result.issues[0].summary).toBeUndefined()
    expect(result.issues[0].suggestedPriority).toBeUndefined()
    expect(result.issues[0].affectedGroups).toEqual([])
    expect(result.issues[0].missingInformation).toEqual([])
  })

  it('```json 围栏包裹的输出也能解析', async () => {
    const fenced = '```json\n' + VALID_CONTENT + '\n```'
    global.fetch = vi.fn(() => Promise.resolve(okResponse(fenced))) as unknown as typeof fetch

    const result = await provider.extractCaseDraft({ rawText: '测试' })
    expect(result.issues).toHaveLength(1)
  })

  it('429 应该重试并在成功后返回', async () => {
    const retryProvider = new QwenProvider('test-api-key', 'qwen2.5-vl-72b-instruct', {
      timeoutMs: 500,
      maxRetries: 1,
    })
    const fetchMock = vi.fn((_url: string) =>
      Promise.resolve({ ok: false, status: 429, text: () => Promise.resolve('Rate limit') } as Response)
    )
      .mockResolvedValueOnce({ ok: false, status: 429, text: () => Promise.resolve('Rate limit') } as Response)
      .mockResolvedValueOnce(okResponse(VALID_CONTENT) as Response)
    global.fetch = fetchMock as unknown as typeof fetch

    const result = await retryProvider.extractCaseDraft({ rawText: 'test' })

    expect(result.issues).toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('401 不应重试,直接抛出', async () => {
    const retryProvider = new QwenProvider('test-api-key', 'qwen2.5-vl-72b-instruct', {
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

  it('超时应触发 AbortController 并在重试耗尽后抛出', async () => {
    const retryProvider = new QwenProvider('test-api-key', 'qwen2.5-vl-72b-instruct', {
      timeoutMs: 50,
      maxRetries: 1,
    })
    // 模拟一个只在 abort 时才 reject 的挂起请求
    global.fetch = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new Error('This operation was aborted'))
          )
        })
    ) as unknown as typeof fetch

    await expect(retryProvider.extractCaseDraft({ rawText: 'test' })).rejects.toThrow(
      /AI request failed/
    )
  })

  it('非法 Schema 输出 (impact 非枚举) 应该抛出而不是入库', async () => {
    const badSchema = JSON.stringify({
      issues: [{ title: 'x', impact: 'severe', urgency: 'LOW' }],
    })
    const fetchMock = vi.fn(() => Promise.resolve(okResponse(badSchema)))
    global.fetch = fetchMock as unknown as typeof fetch

    await expect(provider.extractCaseDraft({ rawText: 'test' })).rejects.toThrow(
      /schema validation/
    )
  })

  it('非 JSON 输出应该抛出', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve(okResponse('抱歉,我无法回答。'))
    ) as unknown as typeof fetch

    await expect(provider.extractCaseDraft({ rawText: 'test' })).rejects.toThrow(
      /not valid JSON/
    )
  })
})
