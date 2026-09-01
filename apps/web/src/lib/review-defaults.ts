// Review 决策默认值 (S1-T6)
// 规则 (遵守红线 R2): 仅当某 Issue 的候选查询已返回且确实无候选时,预填"新建事项";
// 有候选的 Issue 一律人工主动选择;LINK_EXISTING 在任何情况下都不预选 (评分未校准)。

export interface PrefillDecision {
  decision: 'CREATE_CASE'
}

/**
 * 为无候选的 Issue 预填 CREATE_CASE。
 * - 已有决策的 Issue 不覆盖 (含用户手动选择/已处置)
 * - skip 中的 Issue 不预填 (候选刷新在途等未定状态)
 * - 返回原对象引用表示无变化 (减少无效渲染)
 */
export function prefillCreateForEmptyCandidates(
  decisions: Record<number, { decision: string } | undefined>,
  candidatesByIssue: unknown[][],
  options: { skip?: number[] } = {}
): Record<number, PrefillDecision> {
  const skip = new Set(options.skip ?? [])
  let changed = false
  const next: Record<number, PrefillDecision> = { ...decisions }

  candidatesByIssue.forEach((candidates, idx) => {
    // 稀疏数组中未提供的下标视为"未定",不预填 (如单个 Issue 的候选刷新)
    if (!Array.isArray(candidates)) return
    if (decisions[idx] || skip.has(idx)) return
    if (candidates.length === 0) {
      next[idx] = { decision: 'CREATE_CASE' }
      changed = true
    }
  })

  return changed ? next : (decisions as Record<number, PrefillDecision>)
}
