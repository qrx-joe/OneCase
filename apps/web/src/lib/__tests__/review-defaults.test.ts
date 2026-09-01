import { describe, it, expect } from 'vitest'
import { prefillCreateForEmptyCandidates } from '../review-defaults'

const candidate = (n: number) => Array.from({ length: n }, (_, i) => ({ caseId: `c${i}` }))

describe('prefillCreateForEmptyCandidates (S1-T6)', () => {
  it('无候选的 Issue 预填 CREATE_CASE', () => {
    const result = prefillCreateForEmptyCandidates({}, [[], candidate(2)])
    expect(result[0]).toEqual({ decision: 'CREATE_CASE' })
  })

  it('有候选的 Issue 不预填 (人工主动选择,遵守 R2)', () => {
    const result = prefillCreateForEmptyCandidates({}, [candidate(1), candidate(3)])
    expect(result[0]).toBeUndefined()
    expect(result[1]).toBeUndefined()
  })

  it('已有决策不覆盖;skip (候选刷新在途) 不预填', () => {
    const result = prefillCreateForEmptyCandidates(
      { 1: { decision: 'REJECTED' } },
      [[], []],
      { skip: [1] }
    )
    expect(result[0]).toEqual({ decision: 'CREATE_CASE' })
    expect(result[1]).toEqual({ decision: 'REJECTED' })
  })

  it('全部已有决策时返回原引用 (无变化)', () => {
    const decisions = { 0: { decision: 'CREATE_CASE' } }
    const result = prefillCreateForEmptyCandidates(decisions, [[]])
    expect(result).toBe(decisions)
  })
})
