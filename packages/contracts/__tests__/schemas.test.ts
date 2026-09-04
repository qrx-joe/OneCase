// AI 输出契约 Schema 测试: 锁定 provider 输出必须满足的结构约束
import { describe, it, expect } from 'vitest'
import { IssueDraftSchema, AnalysisResultSchema } from '../src/schemas'

const validIssue = {
  title: '3栋2单元楼道照明故障',
  summary: null,
  categoryCode: 'PUBLIC_FACILITIES',
  locationText: '3栋2单元',
  impact: 'HIGH',
  urgency: 'HIGH',
  affectedGroups: ['老人'],
  riskSignals: [],
  missingInformation: ['具体楼层'],
  evidenceConflict: false,
  suggestedPriority: 'P2',
  action: null,
}

describe('IssueDraftSchema', () => {
  it('合法 Issue 通过校验', () => {
    expect(IssueDraftSchema.safeParse(validIssue).success).toBe(true)
  })

  it('缺少 title 拒绝', () => {
    const { title: _title, ...noTitle } = validIssue
    expect(IssueDraftSchema.safeParse(noTitle).success).toBe(false)
  })

  it('impact 非法枚举拒绝', () => {
    expect(
      IssueDraftSchema.safeParse({ ...validIssue, impact: 'severe' }).success
    ).toBe(false)
  })

  it('suggestedPriority 非法值拒绝', () => {
    expect(
      IssueDraftSchema.safeParse({ ...validIssue, suggestedPriority: 'P0' })
        .success
    ).toBe(false)
  })

  it('数组/布尔字段为显式 null 时归一化 (提示词允许未知字段返回 null)', () => {
    const parsed = IssueDraftSchema.parse({
      ...validIssue,
      affectedGroups: null,
      riskSignals: null,
      missingInformation: null,
      evidenceConflict: null,
    })
    expect(parsed).toMatchObject({
      affectedGroups: [],
      riskSignals: [],
      missingInformation: [],
      evidenceConflict: false,
    })
  })
})

describe('AnalysisResultSchema', () => {
  it('单 Issue 通过', () => {
    expect(AnalysisResultSchema.safeParse({ issues: [validIssue] }).success).toBe(true)
  })

  it('空 issues 拒绝 (至少 1 个)', () => {
    expect(AnalysisResultSchema.safeParse({ issues: [] }).success).toBe(false)
  })

  it('超过 5 个 Issue 拒绝', () => {
    const issues = Array.from({ length: 6 }, () => validIssue)
    expect(AnalysisResultSchema.safeParse({ issues }).success).toBe(false)
  })
})
