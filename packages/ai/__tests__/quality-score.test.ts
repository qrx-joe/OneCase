import { describe, it, expect } from 'vitest'
import { QUALITY_CASES } from '../evaluation/cases'
import { scoreCase } from '../evaluation/score'
import type { IssueDraft } from '../src/provider'
const draft = (title: string, categoryCode: string, locationText?: string): IssueDraft => ({ title, categoryCode, locationText, impact: 'UNKNOWN', urgency: 'UNKNOWN', affectedGroups: [], riskSignals: [], missingInformation: [], evidenceConflict: false })
describe('事实评估评分', () => {
  it('按事项匹配而非输出顺序', () => {
    expect(scoreCase(QUALITY_CASES[0], { issues: [draft('垃圾桶满了', 'ENVIRONMENT', '三栋'), draft('灯坏了', 'PUBLIC_FACILITIES', '3栋2单元')] }).passed).toBe(true)
  })
  it('原文缺少地点时拒绝编造楼栋', () => {
    expect(scoreCase(QUALITY_CASES[1], { issues: [draft('灯坏了', 'PUBLIC_FACILITIES', '3栋')] }).locationErrors).toBe(1)
    expect(scoreCase(QUALITY_CASES[1], { issues: [draft('灯坏了', 'PUBLIC_FACILITIES')] }).passed).toBe(true)
  })
  it('不同单元与额外楼层均不能通过', () => {
    for (const location of ['3栋1单元', '13栋2单元', '3栋2单元5层']) {
      expect(scoreCase(QUALITY_CASES[5], { issues: [draft('灯闪烁', 'PUBLIC_FACILITIES', location)] }).passed).toBe(false)
    }
  })
  it('漏项和多余事项计入失败', () => {
    expect(scoreCase(QUALITY_CASES[0], { issues: [draft('灯坏了', 'PUBLIC_FACILITIES', '3栋2单元')] }).missing).toBe(1)
    expect(scoreCase(QUALITY_CASES[1], { issues: [draft('灯坏了', 'PUBLIC_FACILITIES'), draft('垃圾满了', 'ENVIRONMENT')] }).extra).toBe(1)
  })
  it('人工样本不伪计为自动通过', () => {
    expect(scoreCase(QUALITY_CASES[19], { issues: [] }).passed).toBeNull()
    expect(QUALITY_CASES).toHaveLength(30)
    expect(new Set(QUALITY_CASES.map(c => c.id)).size).toBe(30)
    expect(QUALITY_CASES.filter(c => c.imageText)).toHaveLength(10)
  })
})
