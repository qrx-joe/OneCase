// Duplicate Detection Service
// 草稿 (Draft) 直接对库内 Cases 评分,不要求草稿已入库
// 权重与 TECH_SPEC §8 对齐: 0.55 语义 + 0.20 地点 + 0.15 类别 + 0.10 时间
// 注意: 未校准 heuristic,仅用于候选排序,不自动合并
import { prisma } from '@/lib/prisma'
import { resolveOrgId } from '@/lib/demo-context'

export interface DuplicateCandidate {
  caseId: string
  caseNumber: string
  title: string
  score: number
  matchReasons: string[]
}

export interface FindDuplicatesParams {
  /** 草稿标题 (必填) */
  title: string
  /** 草稿类别编码 */
  categoryCode?: string | null
  /** 草稿地点 */
  locationText?: string | null
  /** 组织范围 (默认 demo-org) */
  organizationId?: string
  /** 需要排除的 Case id (如草稿已生成的 Case) */
  excludeCaseId?: string
  limit?: number
}

/**
 * 对库内未关闭 Cases 评分,返回 Top N 相似候选
 * 评分公式 (未校准):
 *   0.55 * 标题相似度
 *   0.20 * 地点相似度
 *   0.15 * 类别一致
 *   0.10 * 时间新近度
 */
export async function findDuplicates(params: FindDuplicatesParams): Promise<DuplicateCandidate[]> {
  const {
    title,
    categoryCode,
    locationText,
    organizationId,
    excludeCaseId,
    limit = 3,
  } = params

  if (!title?.trim()) {
    return []
  }

  // 解析组织 (demo-org 别名 → seed 组织真实 cuid)
  const orgId = await resolveOrgId(organizationId)

  // 1. 拉取同组织、未关闭的候选池 (不限定类别,让 Hard Negative 也能出现)
  const candidates = await prisma.case.findMany({
    where: {
      organizationId: orgId,
      status: { notIn: ['CLOSED', 'CANCELED'] },
      ...(excludeCaseId ? { id: { not: excludeCaseId } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 50, // 候选池上限,MVP 规模足够
  })

  // 2. 评分
  const scored = candidates.map((c) => {
    let score = 0.0
    const reasons: string[] = []

    // 标题语义近似 (0.55) — 字符 + 词元双重相似度取高者
    const titleSimilar = Math.max(
      calculateStringSimilarity(title, c.title),
      tokenSimilarity(title, c.title)
    )
    score += 0.55 * titleSimilar
    if (titleSimilar >= 0.6) {
      reasons.push('语义相关')
    }

    // 地点匹配 (0.20)
    if (locationText && c.locationText) {
      const locSimilar = Math.max(
        calculateStringSimilarity(locationText, c.locationText),
        tokenSimilarity(locationText, c.locationText)
      )
      // Hard Negative 保护: 提取楼栋/单元号对比,数字不同则视为不同地点
      // ("3栋1单元" vs "3栋2单元" 字符相似度 0.8,但单元号不同 = 不同位置)
      const sameBuilding = buildingUnitMatch(locationText, c.locationText)
      if (!sameBuilding) {
        reasons.push('位置不同')
      } else if (locSimilar >= 0.5) {
        score += 0.20 * locSimilar
        reasons.push(locSimilar >= 0.8 ? '地点一致' : '地点相近')
      }
    }

    // 类别一致 (0.15)
    if (categoryCode && c.categoryCode === categoryCode) {
      score += 0.15
      reasons.push('类别一致')
    }

    // 时间新近度 (0.10) — 30 天内线性衰减到 0.05
    const daysSinceCreated = (Date.now() - c.createdAt.getTime()) / (1000 * 60 * 60 * 24)
    const timeWeight = Math.max(0.05, 0.10 - (daysSinceCreated / 30) * 0.05)
    score += timeWeight
    if (daysSinceCreated <= 7) {
      reasons.push('近期活跃')
    }

    return {
      caseId: c.id,
      caseNumber: c.caseNumber,
      title: c.title,
      score: Math.min(1.0, Math.max(0.0, score)),
      matchReasons: reasons,
    }
  })

  // 3. Top N (阈值 0.3)
  return scored
    .filter((c) => c.score > 0.3)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

/**
 * 字符级相似度 (Levenshtein 归一化)
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
 * 词元级相似度: 2-gram 重叠率 (对中文短句比 Levenshtein 更稳)
 */
function tokenSimilarity(str1: string, str2: string): number {
  const grams1 = bigrams(str1)
  const grams2 = bigrams(str2)
  if (grams1.length === 0 || grams2.length === 0) return 0

  let hits = 0
  const pool = [...grams2]
  for (const g of grams1) {
    const idx = pool.indexOf(g)
    if (idx >= 0) {
      hits++
      pool.splice(idx, 1)
    }
  }
  return (2 * hits) / (grams1.length + grams2.length)
}

function bigrams(s: string): string[] {
  const normalized = s.replace(/[\s,。,.、;；!！?？]/g, '')
  const grams: string[] = []
  for (let i = 0; i < normalized.length - 1; i++) {
    grams.push(normalized.slice(i, i + 2))
  }
  return grams
}

/**
 * 楼栋/单元号匹配: 提取地点中的数字序列对比
 * - "3栋2单元" → ["3","2"], "3栋1单元" → ["3","1"] → 数字不一致 → false
 * - "3栋2单元" vs "3栋" → ["3","2"] vs ["3"] → 前缀一致,长度不同 → 仍视为同楼 (true, 由相似度决定权重)
 * - 无数字 ("西门口") → 无法判定,返回 true 交由相似度处理
 */
function buildingUnitMatch(loc1: string, loc2: string): boolean {
  const nums1 = loc1.match(/\d+/g) || []
  const nums2 = loc2.match(/\d+/g) || []

  // 任一方无数字信息,不做 Hard Negative 判定
  if (nums1.length === 0 || nums2.length === 0) return true

  // 逐位对比公共前缀长度内的数字
  const len = Math.min(nums1.length, nums2.length)
  for (let i = 0; i < len; i++) {
    if (nums1[i] !== nums2[i]) return false
  }
  return true
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
