// Eval Provider 选择 (R5)
// 统一走 Provider 工厂;显式指定不支持的 Provider 或缺少密钥时直接报错,
// 绝不静默降级为 Mock (静默降级会让"评估通过"变成 Mock 自测)。
// EVAL_PROVIDER 缺省或 'mock' → 返回 null (Mock 基线,期望 100% 通过)。
import type { ProviderConfig, ProviderType } from './provider-factory'

const REAL_PROVIDER_ENV: Record<
  Exclude<ProviderType, 'mock'>,
  { keyEnv: string; modelEnv: string; defaultModel: string }
> = {
  qwen: { keyEnv: 'QWEN_API_KEY', modelEnv: 'QWEN_MODEL', defaultModel: 'qwen2.5-vl-72b-instruct' },
  openai: { keyEnv: 'OPENAI_API_KEY', modelEnv: 'OPENAI_MODEL', defaultModel: 'gpt-4o' },
  stepfun: { keyEnv: 'STEPFUN_API_KEY', modelEnv: 'STEPFUN_MODEL', defaultModel: 'step-1o-turbo-vision' },
}

export interface EvalProviderSelection {
  /** null = Mock 基线 */
  config: ProviderConfig | null
  provider: 'mock' | ProviderType
  model: string
}

export function resolveEvalProviderConfig(
  env: NodeJS.ProcessEnv = process.env
): EvalProviderSelection {
  const raw = env.EVAL_PROVIDER?.trim().toLowerCase()

  if (!raw || raw === 'mock') {
    return {
      config: null,
      provider: 'mock',
      model: 'mock-v1 (keyword-router: 灯+垃圾→2 issues / 电梯→5栋 / 1单元→hard-negative)',
    }
  }

  const entry = REAL_PROVIDER_ENV[raw as Exclude<ProviderType, 'mock'>]
  if (!entry) {
    throw new Error(
      `EVAL_PROVIDER=${raw} 不受支持。支持: mock (缺省) / qwen / openai / stepfun。` +
        `拒绝静默降级为 Mock——那会让评估结果失去意义。`
    )
  }

  if (!env[entry.keyEnv]) {
    throw new Error(
      `EVAL_PROVIDER=${raw} 需要设置 ${entry.keyEnv},当前缺失。` +
        `拒绝静默降级为 Mock;如需 Mock 基线请显式设置 EVAL_PROVIDER=mock 或移除 EVAL_PROVIDER。`
    )
  }

  const model = env[entry.modelEnv] || entry.defaultModel
  return {
    config: { type: raw as Exclude<ProviderType, 'mock'>, apiKey: env[entry.keyEnv], model },
    provider: raw as Exclude<ProviderType, 'mock'>,
    model,
  }
}
