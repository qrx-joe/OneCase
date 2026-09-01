// Qwen AI Provider (通义千问, DashScope OpenAI 兼容模式)
// API 文档: https://help.aliyun.com/zh/dashscope/developer-reference/compatibility-of-openai-with-dashscope
// 超时/重试/Schema 校验及图片消息封装见 openai-compatible.ts
import { ExtractionProvider, ExtractionInput, ExtractionResult } from './provider'
import { extractViaOpenAICompatible } from './openai-compatible'

const DASHSCOPE_COMPATIBLE_MODE = 'https://dashscope.aliyuncs.com/compatible-mode/v1'

export class QwenProvider implements ExtractionProvider {
  constructor(
    private apiKey: string,
    private model: string = 'qwen2.5-vl-72b-instruct',
    private options: { timeoutMs?: number; maxRetries?: number } = {}
  ) {}

  async extractCaseDraft(input: ExtractionInput): Promise<ExtractionResult> {
    return extractViaOpenAICompatible({
      baseUrl: DASHSCOPE_COMPATIBLE_MODE,
      apiKey: this.apiKey,
      model: this.model,
      rawText: input.rawText,
      attachments: input.attachments,
      timeoutMs: this.options.timeoutMs ?? 30000,
      maxRetries: this.options.maxRetries ?? 1,
    })
  }
}
