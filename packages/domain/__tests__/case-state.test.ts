// packages/domain/__tests__/case-state.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { validateStatusTransition, calculatePriority } from '../src/case-state'

describe('Case State Machine', () => {
  describe('合法状态迁移', () => {
    it('OPEN → IN_PROGRESS 应该成功', () => {
      expect(() => validateStatusTransition('OPEN', 'IN_PROGRESS')).not.toThrow()
    })

    it('IN_PROGRESS → RESOLVED 应该成功', () => {
      expect(() => validateStatusTransition('IN_PROGRESS', 'RESOLVED')).not.toThrow()
    })

    it('CLOSED → OPEN (重开) 应该成功', () => {
      expect(() => validateStatusTransition('CLOSED', 'OPEN')).not.toThrow()
    })

    it('WAITING → RESOLVED 应该成功', () => {
      expect(() => validateStatusTransition('WAITING', 'RESOLVED')).not.toThrow()
    })
  })

  describe('非法状态迁移', () => {
    it('OPEN → CLOSED 应该失败', () => {
      expect(() => validateStatusTransition('OPEN', 'CLOSED')).toThrow(
        'ILLEGAL_STATUS_TRANSITION'
      )
    })

    it('RESOLVED → CANCELED 应该失败', () => {
      expect(() => validateStatusTransition('RESOLVED', 'CANCELED')).toThrow(
        'ILLEGAL_STATUS_TRANSITION'
      )
    })

    it('CLOSED → CANCELED 应该失败', () => {
      expect(() => validateStatusTransition('CLOSED', 'CANCELED')).toThrow(
        'ILLEGAL_STATUS_TRANSITION'
      )
    })
  })
})

describe('Priority Calculation', () => {
  it('HIGH impact + UNKNOWN urgency → P1', () => {
    expect(calculatePriority('HIGH', 'UNKNOWN')).toBe('P1')
  })

  it('UNKNOWN impact + HIGH urgency → P1', () => {
    expect(calculatePriority('UNKNOWN', 'HIGH')).toBe('P1')
  })

  it('MEDIUM + MEDIUM → P2', () => {
    expect(calculatePriority('MEDIUM', 'MEDIUM')).toBe('P2')
  })

  it('LOW + LOW → P3', () => {
    expect(calculatePriority('LOW', 'LOW')).toBe('P3')
  })

  it('UNKNOWN + UNKNOWN → UNKNOWN', () => {
    expect(calculatePriority('UNKNOWN', 'UNKNOWN')).toBe('UNKNOWN')
  })
})
