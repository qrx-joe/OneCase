// domain/src/duplicate.ts
// 重复检测核心逻辑

export interface DuplicateCandidate {
  caseId: string
  caseNumber: string
  title: string
  score: number // 0-1
  matchReasons: string[]
  categoryMatch: boolean
  locationMatch: boolean
  semanticScore: number
}

/**
 * 重复检测评分 (未校准 heuristic)
 *
 * 权重分配:
 * - 0.55 语义相似度
 * - 0.20 地点相似度
 * - 0.15 类别匹配
 * - 0.10 时间相关 (近 30 天权重更高)
 *
 * 注意: 这是初始 heuristic,必须标注为"未校准"
 * 只能用于候选排序,不能自动合并
 */
export function calculateDuplicateScore(params: {
  semanticScore: number      // cosine similarity [0,1]
  locationMatch: boolean     // 地点是否匹配
  categoryMatch: boolean     // 类别是否匹配
  daysSinceCreated: number   // Case 创建天数
}): number {
  const { semanticScore, locationMatch, categoryMatch, daysSinceCreated } = params

  // 时间权重: 越近权重越高 (30 天内从 0.10 降到 0.05)
  const timeWeight = Math.max(0.05, 0.10 - (daysSinceCreated / 30) * 0.05)

  const score =
    0.55 * semanticScore +
    0.20 * (locationMatch ? 1.0 : 0.0) +
    0.15 * (categoryMatch ? 1.0 : 0.0) +
    timeWeight

  return Math.min(1.0, Math.max(0.0, score))
}

/**
 * 从候选中选择 Top N
 */
export function selectTopCandidates(
  candidates: DuplicateCandidate[],
  maxCount: number = 3
): DuplicateCandidate[] {
  return candidates
    .filter(c => c.score > 0.3) // 最小阈值
    .sort((a, b) => b.score - a.score)
    .slice(0, maxCount)
}

/**
 * 生成匹配原因描述
 */
export function generateMatchReasons(params: {
  locationMatch: boolean
  categoryMatch: boolean
  semanticScore: number
  daysSinceCreated: number
}): string[] {
  const reasons: string[] = []

  if (params.locationMatch) reasons.push('地点一致')
  if (params.categoryMatch) reasons.push('类别一致')
  if (params.semanticScore > 0.7) reasons.push('语义相关')
  if (params.daysSinceCreated <= 30) reasons.push('近期重复')
  if (params.semanticScore > 0.5 && params.semanticScore <= 0.7) reasons.push('描述相似')

  return reasons
}
