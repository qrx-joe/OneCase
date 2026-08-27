// packages/domain/__tests__/duplicate.test.ts
import { describe, it, expect } from 'vitest'
import { calculateDuplicateScore, selectTopCandidates, generateMatchReasons } from '../src/duplicate'

describe('Duplicate Detection', () => {
  describe('calculateDuplicateScore', () => {
    it('地点 + 类别 + 语义都匹配时分数应该最高', () => {
      const score = calculateDuplicateScore({
        semanticScore: 0.9,
        locationMatch: true,
        categoryMatch: true,
        daysSinceCreated: 5,
      })
      // 0.55 * 0.9 + 0.20 * 1.0 + 0.15 * 1.0 + 0.10 * (1 - 5/30)
      // = 0.495 + 0.20 + 0.15 + 0.083
      // ≈ 0.928
      expect(score).toBeGreaterThan(0.9)
    })

    it('语义相似但地点类别都不匹配时分数应该较低', () => {
      const score = calculateDuplicateScore({
        semanticScore: 0.8,
        locationMatch: false,
        categoryMatch: false,
        daysSinceCreated: 10,
      })
      // 0.55 * 0.8 + 0 + 0 + 0.10 * (1 - 10/30)
      // = 0.44 + 0 + 0 + 0.067
      // ≈ 0.507
      expect(score).toBeLessThan(0.6)
    })

    it('完全无匹配时分数应该接近 0', () => {
      const score = calculateDuplicateScore({
        semanticScore: 0.1,
        locationMatch: false,
        categoryMatch: false,
        daysSinceCreated: 60,
      })
      expect(score).toBeLessThan(0.2)
    })
  })

  describe('selectTopCandidates', () => {
    it('应该只返回前 3 个候选', () => {
      const candidates = [
        { caseId: '1', score: 0.9, matchReasons: [] },
        { caseId: '2', score: 0.8, matchReasons: [] },
        { caseId: '3', score: 0.7, matchReasons: [] },
        { caseId: '4', score: 0.6, matchReasons: [] },
        { caseId: '5', score: 0.5, matchReasons: [] },
      ]

      const top3 = selectTopCandidates(candidates as any, 3)
      expect(top3).toHaveLength(3)
      expect(top3[0].caseId).toBe('1')
      expect(top3[2].caseId).toBe('3')
    })

    it('应该过滤分数低于 0.3 的候选', () => {
      const candidates = [
        { caseId: '1', score: 0.9, matchReasons: [] },
        { caseId: '2', score: 0.2, matchReasons: [] },
      ]

      const top = selectTopCandidates(candidates as any, 3)
      expect(top).toHaveLength(1)
      expect(top[0].caseId).toBe('1')
    })
  })

  describe('generateMatchReasons', () => {
    it('应该生成正确的中文匹配原因', () => {
      const reasons = generateMatchReasons({
        locationMatch: true,
        categoryMatch: true,
        semanticScore: 0.8,
        daysSinceCreated: 5,
      })

      expect(reasons).toContain('地点一致')
      expect(reasons).toContain('类别一致')
      expect(reasons).toContain('语义相关')
      expect(reasons).toContain('近期重复')
    })
  })
})
