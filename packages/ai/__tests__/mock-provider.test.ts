// packages/ai/__tests__/mock-provider.test.ts
import { describe, it, expect } from 'vitest'
import { MockProvider } from '../src/mock-provider'

describe('MockProvider', () => {
  const provider = new MockProvider()

  it('应该识别多事项 (楼道照明 + 垃圾清运)', async () => {
    const result = await provider.extractCaseDraft({
      rawText: '三栋二单元那个灯又坏了,我妈昨天晚上回来差点摔倒。另外楼下垃圾今天也没人清。',
    })

    expect(result.issues).toHaveLength(2)
    expect(result.issues[0].title).toContain('照明')
    expect(result.issues[1].title).toContain('垃圾')
    expect(result.processingNotes).toContain('2 个')
  })

  it('应该识别单事项 (电梯异常)', async () => {
    const result = await provider.extractCaseDraft({
      rawText: '五栋电梯最近总是有怪声,有时候还会停在楼层中间不动,挺吓人的。',
    })

    expect(result.issues).toHaveLength(1)
    expect(result.issues[0].title).toContain('电梯')
  })

  it('应该返回 Hard Negative (相似但不同地点)', async () => {
    const result = await provider.extractCaseDraft({
      rawText: '3栋1单元楼道灯坏了,老人晚上走路不方便。',
    })

    expect(result.issues).toHaveLength(1)
    expect(result.issues[0].locationText).toBe('3栋1单元')
    expect(result.issues[0].title).toContain('1单元')
  })

  it('缺失信息应该标记为 unknown', async () => {
    const result = await provider.extractCaseDraft({
      rawText: '有个问题需要处理。',
    })

    expect(result.issues[0].impact).toBe('UNKNOWN')
    expect(result.issues[0].urgency).toBe('UNKNOWN')
    expect(result.issues[0].missingInformation.length).toBeGreaterThan(0)
  })

  it('应该模拟网络延迟 (300-800ms)', async () => {
    const start = Date.now()
    await provider.extractCaseDraft({ rawText: '测试' })
    const elapsed = Date.now() - start

    expect(elapsed).toBeGreaterThanOrEqual(300)
    expect(elapsed).toBeLessThan(1000)
  })
})
