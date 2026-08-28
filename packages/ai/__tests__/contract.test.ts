// AI Contract Tests - MockProvider 全部场景输出必须符合 contracts 包的真实 Schema
// 此前本文件维护了一份与 contracts 重复的本地 Schema,已改为直接依赖 @onecase/contracts
import { describe, it, expect } from 'vitest'
import { AnalysisResultSchema } from '@onecase/contracts'
import { MockProvider } from '../src/mock-provider'

describe('AI Contract Tests - MockProvider 输出符合 contracts Schema', () => {
  const provider = new MockProvider()

  const scenarios = [
    { name: '多事项场景 (照明+垃圾)', text: '三栋二单元那个灯又坏了,另外垃圾也没人清。' },
    { name: '单事项场景 (电梯)', text: '五栋电梯最近总是有怪声' },
    { name: 'Hard Negative 场景 (1单元)', text: '三栋一单元楼道灯坏了' },
    { name: '默认场景 (无法分类)', text: '随便说点什么' },
    { name: '空文本', text: '' },
    { name: '超长文本', text: 'a'.repeat(10000) },
  ]

  for (const { name, text } of scenarios) {
    it(`${name} 应通过 AnalysisResultSchema 校验`, async () => {
      const result = await provider.extractCaseDraft({ rawText: text })
      const validation = AnalysisResultSchema.safeParse(result)
      expect(validation.success).toBe(true)
    })
  }

  it('所有 Issue 必须包含非空 title', async () => {
    const result = await provider.extractCaseDraft({ rawText: '测试' })
    result.issues.forEach((issue) => {
      expect(issue.title).toBeDefined()
      expect(issue.title.length).toBeGreaterThan(0)
    })
  })

  it('impact 和 urgency 必须是有效枚举值', async () => {
    const result = await provider.extractCaseDraft({ rawText: '测试' })
    const validValues = ['LOW', 'MEDIUM', 'HIGH', 'UNKNOWN']
    result.issues.forEach((issue) => {
      expect(validValues).toContain(issue.impact)
      expect(validValues).toContain(issue.urgency)
    })
  })

  it('建议优先级必须是 P1/P2/P3/UNKNOWN/空', async () => {
    const result = await provider.extractCaseDraft({ rawText: '测试' })
    const validPriorities = ['P1', 'P2', 'P3', 'UNKNOWN', null, undefined]
    result.issues.forEach((issue) => {
      expect(validPriorities).toContain(issue.suggestedPriority)
    })
  })

  it('至少识别出一个 Issue,最多 5 个', async () => {
    const result = await provider.extractCaseDraft({ rawText: '问题1。问题2。问题3。' })
    expect(result.issues.length).toBeGreaterThanOrEqual(1)
    expect(result.issues.length).toBeLessThanOrEqual(5)
  })
})
