// Domain Services: Phase 1 - 核心逻辑
// 注意: 数据库访问延后到 Phase 2 (需要解决包依赖顺序)
import { validateStatusTransition, calculatePriority } from './case-state'

// ============================================================
// Confirm Transaction (伪代码 - Phase 2 实现)
// ============================================================

export interface ConfirmIntakeParams {
  intakeId: string
  analysisId: string
  issueDecisions: Array<{
    issueIndex: number
    decision: 'CREATE_CASE' | 'LINK_EXISTING' | 'REJECTED'
    targetCaseId?: string
  }>
}

// Phase 2 实现:
// export async function confirmIntake(params: ConfirmIntakeParams) { ... }

// ============================================================
// Duplicate Detection (简化版)
// ============================================================

export async function findDuplicateCandidates(params: {
  caseId: string
  limit?: number
}): Promise<Array<{
  caseId: string
  caseNumber: string
  title: string
  score: number
  matchReasons: string[]
}>> {
  // Phase 2 实现数据库查询
  // 当前返回空数组
  return []
}
