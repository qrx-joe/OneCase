// OpenAI Provider
// 与 QwenProvider 共享 OpenAI 兼容实现 (超时/重试/Schema 校验见 openai-compatible.ts)
import { ExtractionProvider, ExtractionInput, ExtractionResult } from './provider'
import { extractViaOpenAICompatible } from './openai-compatible'

const OPENAI_API = 'https://api.openai.com/v1'

export class OpenAIProvider implements ExtractionProvider {
  constructor(
    private apiKey: string,
    private model: string = 'gpt-4o',
    private options: { timeoutMs?: number; maxRetries?: number } = {}
  ) {}

  async extractCaseDraft(input: ExtractionInput): Promise<ExtractionResult> {
    return extractViaOpenAICompatible({
      baseUrl: OPENAI_API,
      apiKey: this.apiKey,
      model: this.model,
      rawText: input.rawText,
      attachments: input.attachments,
      timeoutMs: this.options.timeoutMs ?? 30000,
      maxRetries: this.options.maxRetries ?? 1,
    })
  }
}
