// Duplicate Detection Service
// 使用简单的关键词匹配 + 分类过滤 (MVP 版本)
import { prisma } from '@/lib/prisma'

export interface DuplicateCandidate {
  caseId: string
  caseNumber: string
  title: string
  score: number
  matchReasons: string[]
}

/**
 * 查找相似 Case (MVP: 基于关键词 + 分类)
 * 后续版本替换为 embedding cosine similarity
 */
export async function findDuplicates(params: {
  caseId: string
  title: string
  categoryCode?: string
  locationText?: string
  limit?: number
}): Promise<DuplicateCandidate[]> {
  const { caseId, title, categoryCode, locationText, limit = 3 } = params

  // 1. 获取当前 Case
  const currentCase = await prisma.case.findUnique({
    where: { id: caseId },
  })

  if (!currentCase) {
    return []
  }

  // 2. 查找候选 (排除已关闭/已取消 + 排除自己)
  const whereClause: any = {
    id: { not: caseId },
    status: { notIn: ['CLOSED', 'CANCELED'] },
    organizationId: currentCase.organizationId,
  }

  // 如果当前 Case 有分类,优先匹配同分类
  if (categoryCode) {
    whereClause.categoryCode = categoryCode
  }

  const candidates = await prisma.case.findMany({
    where: whereClause,
    take: limit * 2, // 多取一些,后续评分排序
  })

  // 3. 评分与排序
  const scored = candidates.map((c) => {
    let score = 0.0
    const reasons: string[] = []

    // 分类匹配 (0.15)
    if (c.categoryCode === categoryCode) {
      score += 0.15
      reasons.push('类别一致')
    }

    // 地点匹配 (0.20)
    if (locationText && c.locationText) {
      const locationSimilar = calculateStringSimilarity(locationText, c.locationText)
      if (locationSimilar > 0.6) {
        score += 0.20 * locationSimilar
        reasons.push('地点相似')
      }
    }

    // 标题关键词匹配 (0.55)
    const titleSimilar = calculateStringSimilarity(title, c.title)
    score += 0.55 * titleSimilar
    if (titleSimilar > 0.7) {
      reasons.push('标题相似')
    } else if (titleSimilar > 0.5) {
      reasons.push('描述相近')
    }

    // 时间因素 (0.10) - 越新权重越高
    const daysSinceCreated = (Date.now() - c.createdAt.getTime()) / (1000 * 60 * 60 * 24)
    const timeWeight = Math.max(0.05, 0.10 - (daysSinceCreated / 30) * 0.05)
    score += timeWeight

    return {
      caseId: c.id,
      caseNumber: c.caseNumber,
      title: c.title,
      score: Math.min(1.0, Math.max(0.0, score)),
      matchReasons: reasons,
    }
  })

  // 4. 排序 + 取 Top N
  return scored
    .filter((c) => c.score > 0.3) // 最小阈值
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

/**
 * 计算字符串相似度 (简化版 Levenshtein)
 */
function calculateStringSimilarity(str1: string, str2: string): number {
  const longer = str1.length > str2.length ? str1 : str2
  const shorter = str1.length > str2.length ? str2 : str1

  if (longer.length === 0) {
    return 1.0
  }

  const distance = levenshteinDistance(longer, shorter)
  return (longer.length - distance) / longer.length
}

/**
 * Levenshtein 距离算法
 */
function levenshteinDistance(str1: string, str2: string): number {
  const matrix: number[][] = []

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i]
  }

  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j
  }

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // 替换
          matrix[i][j - 1] + 1,     // 插入
          matrix[i - 1][j] + 1      // 删除
        )
      }
    }
  }

  return matrix[str2.length][str1.length]
}
