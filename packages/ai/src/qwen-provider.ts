// Qwen AI Provider (通义千问)
// API 文档: https://help.aliyun.com/zh/dashscope/developer-reference/api-details
import { ExtractionProvider, ExtractionInput, ExtractionResult, IssueDraft } from './provider'

interface QwenMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface QwenResponse {
  output: {
    text: string
    choices?: Array<{
      message: {
        content: string
      }
    }>
  }
}

export class QwenProvider implements ExtractionProvider {
  constructor(
    private apiKey: string,
    private model: string = 'qwen2.5-vl-72b-instruct'
  ) {}

  async extractCaseDraft(input: ExtractionInput): Promise<ExtractionResult> {
    const systemPrompt = `你是一个社区事项结构化提取助手。请从居民反馈中提取独立的问题事项。

规则:
1. 一条消息可能包含多个独立问题,需要拆分
2. 提取: 标题、摘要、类别、地点、影响、紧急程度
3. 未知字段返回 null
4. 只提取事实,不做业务判断
5. 缺失信息需要标注

输出 JSON 格式:
{
  "issues": [
    {
      "title": "问题标题",
      "summary": "问题描述",
      "categoryCode": "PUBLIC_FACILITIES|ENVIRONMENT|NOISE|SAFETY|PARKING|null",
      "locationText": "地点描述或null",
      "impact": "LOW|MEDIUM|HIGH|UNKNOWN",
      "urgency": "LOW|MEDIUM|HIGH|UNKNOWN",
      "affectedGroups": ["老人", "儿童"],
      "riskSignals": ["摔倒风险", "安全隐患"],
      "missingInformation": ["具体楼层", "损坏时长"],
      "evidenceConflict": false,
      "suggestedPriority": "P1|P2|P3|UNKNOWN|null"
    }
  ]
}`

    const messages: QwenMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: input.rawText },
    ]

    try {
      const response = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          temperature: 0.3,
          response_format: { type: 'json_object' },
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Qwen API error ${response.status}: ${errorText}`)
      }

      const data: QwenResponse = await response.json()
      const content = data.output.choices?.[0]?.message?.content || data.output.text

      // 解析 JSON
      const parsed = JSON.parse(content)

      // 验证结构
      if (!parsed.issues || !Array.isArray(parsed.issues)) {
        throw new Error('Invalid response format: missing issues array')
      }

      return {
        issues: parsed.issues.map((issue: any) => ({
          title: issue.title || '未分类事项',
          summary: issue.summary || null,
          categoryCode: issue.categoryCode || null,
          locationText: issue.locationText || null,
          impact: issue.impact || 'UNKNOWN',
          urgency: issue.urgency || 'UNKNOWN',
          affectedGroups: issue.affectedGroups || [],
          riskSignals: issue.riskSignals || [],
          missingInformation: issue.missingInformation || [],
          evidenceConflict: issue.evidenceConflict || false,
          suggestedPriority: issue.suggestedPriority || null,
        })),
      }
    } catch (error) {
      console.error('Qwen API failed:', error)
      throw error
    }
  }
}
