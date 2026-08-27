// AI Contract Tests - 验证 Provider 输出符合 Schema
import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { MockProvider } from '../src/mock-provider'

// Issue Draft Schema (与 contracts 包保持一致)
const IssueDraftSchema = z.object({
  title: z.string().min(1).max(200),
  summary: z.string().max(500).nullable(),
  categoryCode: z.string().nullable(),
  locationText: z.string().nullable(),
  impact: z.enum(['LOW', 'MEDIUM', 'HIGH', 'UNKNOWN']),
  urgency: z.enum(['LOW', 'MEDIUM', 'HIGH', 'UNKNOWN']),
  affectedGroups: z.array(z.string()).default([]),
  riskSignals: z.array(z.string()).default([]),
  missingInformation: z.array(z.string()).default([]),
  evidenceConflict: z.boolean().default(false),
  suggestedPriority: z.enum(['P1', 'P2', 'P3', 'UNKNOWN']).nullable(),
})

const ExtractionResultSchema = z.object({
  issues: z.array(IssueDraftSchema).min(1).max(5),
  processingNotes: z.string().optional(),
})

describe('AI Contract Tests - Provider Output Validation', () => {
  const provider = new MockProvider()

  it('MockProvider 输出应该符合 Schema', async () => {
    const result = await provider.extractCaseDraft({
      rawText: '三栋二单元那个灯又坏了,另外垃圾也没人清。',
    })

    // Zod Schema 验证
    const validation = ExtractionResultSchema.safeParse(result)
    expect(validation.success).toBe(true)

    if (validation.success) {
      expect(validation.data.issues.length).toBeGreaterThan(0)
      expect(validation.data.issues.length).toBeLessThanOrEqual(5)
    }
  })

  it('所有 Issue 必须包含 title', async () => {
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

  it('建议优先级必须是 P1/P2/P3/UNKNOWN/null', async () => {
    const result = await provider.extractCaseDraft({ rawText: '测试' })

    const validPriorities = ['P1', 'P2', 'P3', 'UNKNOWN', null, undefined]
    result.issues.forEach((issue) => {
      expect(validPriorities).toContain(issue.suggestedPriority)
    })
  })

  it('至少识别出一个 Issue', async () => {
    const result = await provider.extractCaseDraft({ rawText: '任何文本' })

    expect(result.issues.length).toBeGreaterThanOrEqual(1)
  })

  it('最多识别 5 个 Issue', async () => {
    const result = await provider.extractCaseDraft({
      rawText: '问题1。问题2。问题3。问题4。问题5。问题6。',
    })

    expect(result.issues.length).toBeLessThanOrEqual(5)
  })
})

describe('AI Contract Tests - Error Handling', () => {
  it('空文本应该返回至少一个 Issue', async () => {
    const provider = new MockProvider()
    const result = await provider.extractCaseDraft({ rawText: '' })

    expect(result.issues.length).toBeGreaterThanOrEqual(1)
  })

  it('超长文本应该被截断或处理', async () => {
    const provider = new MockProvider()
    const longText = 'a'.repeat(10000)

    const result = await provider.extractCaseDraft({ rawText: longText })
    expect(result.issues).toBeDefined()
    expect(Array.isArray(result.issues)).toBe(true)
  })
})
