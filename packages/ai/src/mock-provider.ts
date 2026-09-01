// Mock AI Provider
// 用于 Demo 和测试,断网/无 API Key 时可用
import { ExtractionProvider, ExtractionInput, ExtractionResult } from './provider'

// Mock 场景预设
const MOCK_SCENARIOS: Record<string, ExtractionResult> = {
  // 场景 1: 多事项识别 (楼道照明 + 垃圾清运)
  'multi-issue': {
    issues: [
      {
        title: '3栋2单元楼道照明故障',
        summary: '3栋2单元楼道照明设施损坏,居民反映夜间通行困难,存在老人摔倒风险。',
        categoryCode: 'PUBLIC_FACILITIES',
        locationText: '3栋2单元',
        impact: 'HIGH',
        urgency: 'HIGH',
        affectedGroups: ['老人', '儿童'],
        riskSignals: ['老人差点摔倒', '夜间通行风险'],
        missingInformation: ['具体楼层', '损坏时长'],
        evidenceConflict: false,
        suggestedPriority: 'P2',
      },
      {
        title: '3栋楼下垃圾未及时清运',
        summary: '3栋楼下垃圾桶满溢,垃圾清运不及时。',
        categoryCode: 'ENVIRONMENT',
        locationText: '3栋楼下',
        impact: 'MEDIUM',
        urgency: 'MEDIUM',
        affectedGroups: [],
        riskSignals: [],
        missingInformation: ['满溢时长', '异味程度'],
        evidenceConflict: false,
        suggestedPriority: 'P3',
      },
    ],
    processingNotes: '识别到 2 个潜在独立事项',
  },

  // 场景 2: 单事项 (电梯异常)
  'single-issue': {
    issues: [
      {
        title: '5栋电梯运行异常',
        summary: '5栋电梯出现异响和偶尔停靠不准的情况。',
        categoryCode: 'PUBLIC_FACILITIES',
        locationText: '5栋',
        impact: 'HIGH',
        urgency: 'HIGH',
        affectedGroups: ['老人', '残疾人'],
        riskSignals: ['异响', '停靠不准'],
        missingInformation: ['具体楼层', '发生频率'],
        evidenceConflict: false,
        suggestedPriority: 'P2',
      },
    ],
    processingNotes: '识别到 1 个事项',
  },

  // 场景 3: Hard Negative (相似但不同地点)
  'hard-negative': {
    issues: [
      {
        title: '3栋1单元楼道照明故障',
        summary: '3栋1单元楼道灯损坏,与 2 单元不同位置。',
        categoryCode: 'PUBLIC_FACILITIES',
        locationText: '3栋1单元',
        impact: 'MEDIUM',
        urgency: 'MEDIUM',
        affectedGroups: [],
        riskSignals: [],
        missingInformation: [],
        evidenceConflict: false,
        suggestedPriority: 'P3',
      },
    ],
    processingNotes: '识别到 1 个事项 (不同地点)',
  },
}

export class MockProvider implements ExtractionProvider {
  async extractCaseDraft(input: ExtractionInput): Promise<ExtractionResult> {
    if (input.attachments?.length) {
      throw new Error('当前为 Mock 演示模式，不能识别图片。请配置支持视觉的 Qwen/OpenAI 模型，或改为手动创建事项。')
    }
    // 模拟网络延迟 (300-800ms)
    await this.delay(300 + Math.random() * 500)

    // 根据关键词选择场景
    const text = input.rawText.toLowerCase()
    if (text.includes('灯') && text.includes('垃圾')) {
      return MOCK_SCENARIOS['multi-issue']
    }
    if (text.includes('电梯')) {
      return MOCK_SCENARIOS['single-issue']
    }
    if (text.includes('1单元') || text.includes('一单元')) {
      return MOCK_SCENARIOS['hard-negative']
    }

    // 默认返回单事项
    return {
      issues: [
        {
          title: '未分类事项',
          summary: input.rawText.slice(0, 100),
          impact: 'UNKNOWN',
          urgency: 'UNKNOWN',
          affectedGroups: [],
          riskSignals: [],
          missingInformation: ['地点', '类别', '影响范围'],
          evidenceConflict: false,
        },
      ],
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
