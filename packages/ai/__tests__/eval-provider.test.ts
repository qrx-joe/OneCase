// R5 回归: Eval 的 Provider 选择必须显式、可审计,不得静默落 Mock
import { describe, it, expect } from 'vitest'
import { resolveEvalProviderConfig } from '../src/eval-provider'

describe('resolveEvalProviderConfig (R5)', () => {
  it('缺省或 EVAL_PROVIDER=mock → Mock 基线 (null config)', () => {
    expect(resolveEvalProviderConfig({}).provider).toBe('mock')
    expect(resolveEvalProviderConfig({ EVAL_PROVIDER: 'mock' }).config).toBeNull()
    expect(resolveEvalProviderConfig({ EVAL_PROVIDER: '  MOCK  ' }).provider).toBe('mock') // 大小写/空白归一
  })

  it('EVAL_PROVIDER=stepfun + 密钥 → 走工厂配置,使用 StepFun 默认模型', () => {
    const sel = resolveEvalProviderConfig({
      EVAL_PROVIDER: 'stepfun',
      STEPFUN_API_KEY: 'k-test',
    })
    expect(sel.provider).toBe('stepfun')
    expect(sel.model).toBe('step-1o-turbo-vision')
    expect(sel.config).toMatchObject({ type: 'stepfun', apiKey: 'k-test' })
  })

  it('EVAL_PROVIDER=stepfun 缺密钥 → 显式报错,不得降级 Mock', () => {
    expect(() => resolveEvalProviderConfig({ EVAL_PROVIDER: 'stepfun' })).toThrow(
      /STEPFUN_API_KEY/
    )
    expect(() => resolveEvalProviderConfig({ EVAL_PROVIDER: 'qwen' })).toThrow(/QWEN_API_KEY/)
    expect(() => resolveEvalProviderConfig({ EVAL_PROVIDER: 'openai' })).toThrow(/OPENAI_API_KEY/)
  })

  it('不支持的 Provider 名 → 显式报错并列出支持项', () => {
    expect(() => resolveEvalProviderConfig({ EVAL_PROVIDER: 'chatgpt' })).toThrow(
      /不受支持[\s\S]*stepfun/
    )
  })

  it('StepFun 模型可经 STEPFUN_MODEL 覆盖', () => {
    const sel = resolveEvalProviderConfig({
      EVAL_PROVIDER: 'stepfun',
      STEPFUN_API_KEY: 'k-test',
      STEPFUN_MODEL: 'step-2-16k',
    })
    expect(sel.model).toBe('step-2-16k')
  })
})
