// lib/text-similarity.ts
// 纯文本相似度函数 (无 IO 依赖,可单测)
// 供 duplicate-service 评分使用

/**
 * 字符级相似度 (Levenshtein 归一化)
 */
export function calculateStringSimilarity(str1: string, str2: string): number {
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
export function tokenSimilarity(str1: string, str2: string): number {
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
export function buildingUnitMatch(loc1: string, loc2: string): boolean {
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

function levenshteinDistance(str1: string, str2: string): number {
  const matrix: number[][] = []

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i]
  }

  for (let j = 1; j <= str1.length; j++) {
    matrix[0][j] = j
  }

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // 替换
          matrix[i - 1][j] + 1,     // 删除
          matrix[i][j - 1] + 1      // 插入
        )
      }
    }
  }

  return matrix[str2.length][str1.length]
}
