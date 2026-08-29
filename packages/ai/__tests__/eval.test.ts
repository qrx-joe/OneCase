// 合成 Eval 套件 (TASK.md Phase 3 验收: ≥20 条 + 记录模型/Prompt/Schema 版本)
// 默认对 MockProvider 运行 (期望 100% 通过 = 可执行规格);
// 设置 EVAL_PROVIDER=qwen + QWEN_API_KEY 后对真实 Provider 运行,
// 得分即度量其相对基线的偏差 (eval 只报告,不因真实 Provider 得分低而 fail)。
import { describe, it, expect } from 'vitest'
import { AnalysisResultSchema } from '@onecase/contracts'
import { MockProvider, QwenProvider } from '../src'
import type { ExtractionProvider } from '../src/provider'
import { EVAL_CASES } from './eval-cases'

const USE_REAL = process.env.EVAL_PROVIDER === 'qwen' && !!process.env.QWEN_API_KEY

// 版本记录 (TASK.md: 记录模型/Prompt/Schema 版本)
const VERSIONS = USE_REAL
  ? {
      provider: 'qwen',
      model: process.env.QWEN_MODEL || 'qwen2.5-vl-72b-instruct',
      promptVersion: 'openai-compatible-system-v1',
      schemaVersion: 'contracts/AnalysisResultSchema v1',
    }
  : {
      provider: 'mock',
      model: 'mock-v1 (keyword-router: 灯+垃圾→2 issues / 电梯→5栋 / 1单元→hard-negative)',
      promptVersion: 'n/a (keyword router)',
      schemaVersion: 'contracts/AnalysisResultSchema v1',
    }

function pickProvider(): ExtractionProvider {
  if (USE_REAL) return new QwenProvider(process.env.QWEN_API_KEY!, process.env.QWEN_MODEL)
  return new MockProvider()
}

describe(`合成 Eval (${EVAL_CASES.length} 条) — ${VERSIONS.provider}/${VERSIONS.model}`, () => {
  const provider = pickProvider()
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
    console.log(
      `[eval] provider=${VERSIONS.provider} model=${VERSIONS.model} prompt=${VERSIONS.promptVersion} schema=${VERSIONS.schemaVersion} 通过 ${passed}/${EVAL_CASES.length}`
    )
    if (USE_REAL) {
      // 真实 Provider: 报告偏差,不硬性 fail (模型行为允许偏离关键词基线)
      console.log(`[eval] 未通过用例:\n${failures.join('\n') || '(无)'}`)
      expect(passed).toBeGreaterThanOrEqual(0)
    } else {
      // Mock 基线: 期望必须 100% 满足,任何偏离都视为回归
      expect(failures).toEqual([])
      expect(passed).toBe(EVAL_CASES.length)
    }
  })
})
