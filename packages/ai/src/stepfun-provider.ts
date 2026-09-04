// StepFun Provider (阶跃星辰, OpenAI 兼容协议)
// 超时/重试/Schema 校验及图片消息封装复用 openai-compatible.ts
import { ExtractionProvider, ExtractionInput, ExtractionResult } from './provider'
import { extractViaOpenAICompatible } from './openai-compatible'

const STEPFUN_API = 'https://api.stepfun.com/v1'

export class StepFunProvider implements ExtractionProvider {
  constructor(
    private apiKey: string,
    private model: string = 'step-1o-turbo-vision',
    private options: { timeoutMs?: number; maxRetries?: number } = {}
  ) {}

  async extractCaseDraft(input: ExtractionInput): Promise<ExtractionResult> {
    return extractViaOpenAICompatible({
      baseUrl: STEPFUN_API,
      apiKey: this.apiKey,
      model: this.model,
      rawText: input.rawText,
      attachments: input.attachments,
      timeoutMs: this.options.timeoutMs ?? 30000,
      maxRetries: this.options.maxRetries ?? 1,
    })
  }
}
