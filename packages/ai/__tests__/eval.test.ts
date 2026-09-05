// Mock 关键词路由的可执行规格,不是模型质量评估。
// 真实模型入口: apps/web/scripts/evaluate-model.mts (独立事实样本)。
import { describe, it, expect } from 'vitest'
import { AnalysisResultSchema } from '@onecase/contracts'
import { MockProvider } from '../src'
import { EVAL_CASES } from './eval-cases'

// 此文件期望值耦合 Mock 路由,不能用于真实质量验收。
if (process.env.EVAL_PROVIDER && process.env.EVAL_PROVIDER.trim().toLowerCase() !== 'mock') {
  throw new Error('旧 Eval 仅用于 Mock 回归。真实模型请运行 pnpm --filter @onecase/web eval:quality；先预检样本,获准后显式 --run。')
}
const SAMPLE_VERSION = 'eval-cases-v1 (Mock 关键词路由规格)'
const VERSIONS = {
  provider: 'mock', model: 'mock-v1', promptVersion: 'n/a (keyword router)',
  schemaVersion: 'contracts/AnalysisResultSchema v1',
}

describe(`合成 Eval (${EVAL_CASES.length} 条) — ${VERSIONS.provider}/${VERSIONS.model}`, () => {
  const provider = new MockProvider()
  const failures: string[] = []
  let passed = 0

  it.each(EVAL_CASES)('$name', async ({ name, text, expect: want }) => {
    const result = await provider.extractCaseDraft({ rawText: text })

    // Schema 契约永远必须满足 (无论 provider)
    const schema = AnalysisResultSchema.safeParse(result)
    if (!schema.success) {
      failures.push(`${name}: Schema 校验失败 ${schema.error.issues[0]?.message}`)
      return
    }

    const issues = result.issues
    const problems: string[] = []
    if (issues.length !== want.exactIssues) {
      problems.push(`Issue 数 ${issues.length} ≠ 期望 ${want.exactIssues}`)
    }

    for (let i = 0; i < Math.min(want.exactIssues, issues.length); i++) {
      const got = issues[i]
      const wantCat = want.categories[i]
      if (wantCat !== null && (got.categoryCode ?? null) !== wantCat) {
        problems.push(`[${i}] category ${got.categoryCode ?? 'null'} ≠ ${wantCat}`)
      }
      const wantPri = want.priorities[i]
      if (wantPri !== null && (got.suggestedPriority ?? null) !== wantPri) {
        problems.push(`[${i}] priority ${got.suggestedPriority ?? 'null'} ≠ ${wantPri}`)
      }
      const wantLoc = want.locationIncludes[i]
      if (wantLoc !== null && !(got.locationText ?? '').includes(wantLoc)) {
        problems.push(`[${i}] location "${got.locationText}" 不含 "${wantLoc}"`)
      }
      if (want.requireMissingInfo && (got.missingInformation?.length ?? 0) === 0) {
        problems.push(`[${i}] 缺失信息未标注`)
      }
    }

    if (problems.length > 0) {
      failures.push(`${name}: ${problems.join('; ')}`)
    } else {
      passed++
    }
  })

  it('Eval 总结: 通过率与版本记录', () => {
    const passRate = passed / EVAL_CASES.length
    console.log(
      `[eval] provider=${VERSIONS.provider} model=${VERSIONS.model} prompt=${VERSIONS.promptVersion} schema=${VERSIONS.schemaVersion} 样本=${SAMPLE_VERSION} 通过 ${passed}/${EVAL_CASES.length} (${(passRate * 100).toFixed(0)}%)`
    )
    expect(failures).toEqual([])
    expect(passed).toBe(EVAL_CASES.length)
  })
})
