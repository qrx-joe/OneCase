import type { ExtractionResult, IssueDraft } from '../src/provider'
import type { ExpectedIssue, QualityCase } from './cases'

export function normalizeLocation(value: string): string {
  const digits: Record<string, number> = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 }
  return value.normalize('NFKC').replace(/[零一二两三四五六七八九十]+/g, token => {
    if (!token.includes('十')) return [...token].map(c => digits[c]).join('')
    const [tens, units] = token.split('十')
    return String((tens ? digits[tens] : 1) * 10 + (units ? digits[units] : 0))
  }).replace(/号楼|幢/g, '栋').replace(/\s/g, '')
}

function locationMatches(expected: string | null, actual?: string) {
  if (expected === null) return !actual?.trim() || /^(未知|不详|未提供|无法确认)$/.test(actual.trim())
  if (!actual) return false
  const wanted = normalizeLocation(expected), got = normalizeLocation(actual)
  // 不允许 3栋 匹配 13栋,也不接受额外编造的单元/楼层信息。
  const parts = (s: string) => s.match(/\d+(?:栋|单元|层|室)/g) ?? []
  const wantedParts = parts(wanted), gotParts = parts(got)
  return got.includes(wanted) && JSON.stringify(wantedParts) === JSON.stringify(gotParts)
}

function checks(expected: ExpectedIssue, actual: IssueDraft) {
  return {
    topic: expected.topic.some(word => `${actual.title} ${actual.summary ?? ''}`.includes(word)),
    category: expected.category === actual.categoryCode,
    location: locationMatches(expected.location, actual.locationText),
  }
}

export function scoreCase(sample: QualityCase, output: ExtractionResult) {
  if (sample.manualOnly) return { passed: null, missing: 0, extra: 0, categoryErrors: 0, locationErrors: 0, notes: ['需要人工检查原图与输出，未纳入自动质量分母'], conflictMarked: output.issues.some(i => i.evidenceConflict) }
  // 最多 5 个草稿,穷举一对一匹配,避免输出顺序影响分数。
  let best: Array<number | null> = [], bestScore = -Infinity
  function visit(index: number, used: Set<number>, matches: Array<number | null>, total: number) {
    if (index === sample.expected.length) { if (total > bestScore) { bestScore = total; best = [...matches] }; return }
    visit(index + 1, used, [...matches, null], total)
    output.issues.forEach((actual, actualIndex) => {
      if (used.has(actualIndex)) return
      const c = checks(sample.expected[index], actual)
      if (!c.topic) return
      used.add(actualIndex)
      visit(index + 1, used, [...matches, actualIndex], total + 10 + Number(c.category) + Number(c.location))
      used.delete(actualIndex)
    })
  }
  visit(0, new Set(), [], 0)
  const matched = best.filter(i => i !== null).length
  let categoryErrors = 0, locationErrors = 0
  best.forEach((actualIndex, index) => {
    if (actualIndex === null) return
    const c = checks(sample.expected[index], output.issues[actualIndex])
    categoryErrors += Number(!c.category); locationErrors += Number(!c.location)
  })
  const missing = sample.expected.length - matched, extra = output.issues.length - matched
  return { passed: missing + extra + categoryErrors + locationErrors === 0, missing, extra, categoryErrors, locationErrors, notes: [] as string[] }
}
