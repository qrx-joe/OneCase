// domain/src/case-state.ts
// Case 状态机与迁移规则

export type CaseStatus =
  | 'OPEN'
  | 'IN_PROGRESS'
  | 'WAITING'
  | 'RESOLVED'
  | 'CLOSED'
  | 'CANCELED'

export type CasePriority = 'P1' | 'P2' | 'P3' | 'UNKNOWN'

// 状态迁移矩阵 (允许的迁移)
export const CASE_STATUS_TRANSITIONS: Record<CaseStatus, CaseStatus[]> = {
  OPEN:        ['IN_PROGRESS', 'WAITING', 'CANCELED'],
  IN_PROGRESS: ['OPEN', 'WAITING', 'RESOLVED', 'CANCELED'],
  WAITING:     ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CANCELED'],
  RESOLVED:    ['OPEN', 'IN_PROGRESS', 'WAITING', 'CLOSED'],
  CLOSED:      ['OPEN'], // 可以重新打开
  CANCELED:    ['OPEN'], // 可以重新激活
}

/**
 * 验证状态迁移是否合法
 * @throws Error 如果迁移不合法
 */
export function validateStatusTransition(
  from: CaseStatus,
  to: CaseStatus
): void {
  const allowed = CASE_STATUS_TRANSITIONS[from]
  if (!allowed?.includes(to)) {
    throw new Error(
      `ILLEGAL_STATUS_TRANSITION: ${from} → ${to} is not allowed. ` +
      `Allowed transitions from ${from}: ${allowed?.join(', ') || 'none'}`
    )
  }
}

/**
 * 根据影响与紧急程度确定建议优先级 (确定性规则)
 */
export function calculatePriority(
  impact: 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN',
  urgency: 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN'
): CasePriority {
  if (impact === 'HIGH' || urgency === 'HIGH') return 'P1'
  if (impact === 'MEDIUM' || urgency === 'MEDIUM') return 'P2'
  if (impact === 'LOW' && urgency === 'LOW') return 'P3'
  return 'UNKNOWN'
}
