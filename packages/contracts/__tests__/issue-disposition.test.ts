import { describe, it, expect } from 'vitest'
import {
  ISSUE_DISPOSITIONS,
  IssueDispositionSchema,
  DISPOSITION_LABELS,
  ConfirmIssueDecisionSchema,
} from '../src/schemas'

describe('IssueDisposition (S1-T5 不建事项业务出口)', () => {
  it('四个业务出口枚举完整且各有中文标签', () => {
    expect([...ISSUE_DISPOSITIONS]).toEqual(['ANSWERED', 'NOTE_ONLY', 'INVALID', 'DEFERRED'])
    for (const d of ISSUE_DISPOSITIONS) {
      expect(DISPOSITION_LABELS[d]).toBeTruthy()
    }
  })

  it('接受合法枚举,拒绝未知值', () => {
    expect(IssueDispositionSchema.parse('NOTE_ONLY')).toBe('NOTE_ONLY')
    expect(IssueDispositionSchema.safeParse('跳过').success).toBe(false)
    expect(IssueDispositionSchema.safeParse('').success).toBe(false)
  })

  it('Confirm 决策: REJECTED 可带处置与原因,原因限 200 字', () => {
    const parsed = ConfirmIssueDecisionSchema.parse({
      issueIndex: 0,
      decision: 'REJECTED',
      disposition: 'DEFERRED',
      dispositionNote: '已现场答复，观察一周',
    })
    expect(parsed.disposition).toBe('DEFERRED')

    expect(
      ConfirmIssueDecisionSchema.safeParse({
        issueIndex: 0,
        decision: 'REJECTED',
        disposition: 'DEFERRED',
        dispositionNote: '长'.repeat(201),
      }).success
    ).toBe(false)
  })

  it('Confirm 决策: 处置字段必须合法枚举,未知值被拒', () => {
    expect(
      ConfirmIssueDecisionSchema.safeParse({
        issueIndex: 0,
        decision: 'REJECTED',
        disposition: 'WHATEVER',
      }).success
    ).toBe(false)
  })
})
