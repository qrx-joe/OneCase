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
 * 楼栋/单元号匹配: 归一化后提取地点中的数字序列对比
 * - 中文数字、全角数字先归一化为阿拉伯数字:
 *   "三栋二单元"→"3栋2单元"、"十二栋"→"12栋"、"３栋"→"3栋"
 *   (归一化只用于对比,原始地址仍原样展示和审计)
 * - "3栋2单元" → ["3","2"], "3栋1单元" → ["3","1"] → 数字不一致 → false
 * - "3栋2单元" vs "3栋" → ["3","2"] vs ["3"] → 前缀一致,长度不同 → 仍视为同楼 (true, 由相似度决定权重)
 * - 无数字 ("西门口") → 无法判定,返回 true 交由相似度处理 (保持不确定性,不误报一致)
 */
export function buildingUnitMatch(loc1: string, loc2: string): boolean {
  const nums1 = extractLocationNumbers(loc1)
  const nums2 = extractLocationNumbers(loc2)

  // 任一方无数字信息,不做 Hard Negative 判定
  if (nums1.length === 0 || nums2.length === 0) return true

  // 逐位对比公共前缀长度内的数字
  const len = Math.min(nums1.length, nums2.length)
  for (let i = 0; i < len; i++) {
    if (nums1[i] !== nums2[i]) return false
  }
  return true
}

/** 归一化后提取数字序列: 全角数字与常见中文数字统一转为阿拉伯数字再提取 */
export function extractLocationNumbers(loc: string): string[] {
  return normalizeNumerals(loc).match(/\d+/g) || []
}

const FULLWIDTH_DIGITS = '０１２３４５６７８９'
const CN_DIGITS: Record<string, number> = {
  零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4,
  五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
}
const CN_UNIT_CHARS: Record<string, number> = { 十: 10, 百: 100 }

// 把地址中的中文数字串与全角数字归一化为阿拉伯数字字符串
function normalizeNumerals(loc: string): string {
  let out = ''
  let cnRun = ''
  const flushRun = () => {
    if (cnRun) {
      out += String(parseCnNumeralRun(cnRun))
      cnRun = ''
    }
  }
  for (const ch of loc) {
    const fullwidth = FULLWIDTH_DIGITS.indexOf(ch)
    if (fullwidth >= 0) {
      flushRun()
      out += String(fullwidth)
    } else if (ch in CN_DIGITS || ch in CN_UNIT_CHARS) {
      cnRun += ch
    } else {
      flushRun()
      out += ch
    }
  }
  flushRun()
  return out
}

// 解析连续中文数字串 (覆盖楼栋/单元常见范围,如 十=10、二十三=23、一百零三=103)
function parseCnNumeralRun(run: string): number {
  let total = 0
  let current = 0
  for (const ch of run) {
    if (ch in CN_DIGITS) {
      current = CN_DIGITS[ch]
    } else if (ch in CN_UNIT_CHARS) {
      total += (current || 1) * CN_UNIT_CHARS[ch]
      current = 0
    }
  }
  return total + current
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
