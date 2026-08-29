// 合成 Eval 用例集 (TASK.md Phase 3: 至少 20 条小型合成 Eval)
// 期望值锁定 MockProvider 的关键词路由行为 = 可执行的规格说明;
// 通过 EVAL_PROVIDER 切换真实 Provider 时,同一期望用于度量其与基线的偏差。
// 注意分组与 mock 路由的耦合: multi 需同时含"灯+垃圾";电梯组不得混入灯+垃圾;
// 1单元组不得含"电梯"且不得同时含灯+垃圾;默认组不含任何路由关键词。

export interface EvalExpectation {
  /** 期望的 Issue 数量 (按顺序校验后续数组) */
  exactIssues: number
  /** 每个 Issue 的 categoryCode (null = 期望未识别) */
  categories: Array<string | null>
  /** 每个 Issue 的 suggestedPriority (null = 期望未给出) */
  priorities: Array<string | null>
  /** 每个 Issue 的 locationText 需包含的子串 (null = 不校验) */
  locationIncludes: Array<string | null>
  /** 是否要求标注缺失信息 (缺失保持未知,不猜测) */
  requireMissingInfo?: boolean
}

export interface EvalCase {
  name: string
  text: string
  expect: EvalExpectation
}

export const EVAL_CASES: EvalCase[] = [
  // ---- A 组: 多事项拆分 (灯 + 垃圾 → 2 issues) ----
  {
    name: 'A1 典型多事项 (Demo 主文本)',
    text: '王主任,我们三栋二单元那个灯又坏了,我妈昨天晚上回来差点摔倒。另外楼下垃圾今天也没人清。',
    expect: {
      exactIssues: 2,
      categories: ['PUBLIC_FACILITIES', 'ENVIRONMENT'],
      priorities: ['P2', 'P3'],
      locationIncludes: ['3栋', '3栋'],
    },
  },
  {
    name: 'A2 多事项 (语气更急)',
    text: '三栋二单元楼道的灯坏了,垃圾也堆了好几天没人管,路过都难受。',
    expect: {
      exactIssues: 2,
      categories: ['PUBLIC_FACILITIES', 'ENVIRONMENT'],
      priorities: ['P2', 'P3'],
      locationIncludes: ['3栋', '3栋'],
    },
  },
  {
    name: 'A3 多事项 (口语化)',
    text: '楼道灯不亮了,另外楼下垃圾桶都满了,没人清。',
    expect: {
      exactIssues: 2,
      categories: ['PUBLIC_FACILITIES', 'ENVIRONMENT'],
      priorities: ['P2', 'P3'],
      locationIncludes: ['3栋', '3栋'],
    },
  },
  {
    name: 'A4 多事项 (范围更大)',
    text: '小区好几处楼道灯坏了,而且垃圾清运也停了,居民很有意见。',
    expect: {
      exactIssues: 2,
      categories: ['PUBLIC_FACILITIES', 'ENVIRONMENT'],
      priorities: ['P2', 'P3'],
      locationIncludes: ['3栋', '3栋'],
    },
  },

  // ---- B 组: 单事项-电梯 (含"电梯",不含灯+垃圾组合) ----
  {
    name: 'B1 电梯异响',
    text: '五栋电梯最近总是有怪声,有时候还会停在楼层中间不动,挺吓人的。',
    expect: {
      exactIssues: 1,
      categories: ['PUBLIC_FACILITIES'],
      priorities: ['P2'],
      locationIncludes: ['5栋'],
    },
  },
  {
    name: 'B2 电梯按钮失灵',
    text: '我们单元的电梯按钮失灵,好几天了没人修。',
    expect: {
      exactIssues: 1,
      categories: ['PUBLIC_FACILITIES'],
      priorities: ['P2'],
      locationIncludes: ['5栋'],
    },
  },
  {
    name: 'B3 电梯困人',
    text: '电梯经常困人,物业电话也打不通,太危险了。',
    expect: {
      exactIssues: 1,
      categories: ['PUBLIC_FACILITIES'],
      priorities: ['P2'],
      locationIncludes: ['5栋'],
    },
  },
  {
    name: 'B4 电梯超龄',
    text: '高层住户反映电梯超龄服役,建议尽快检修。',
    expect: {
      exactIssues: 1,
      categories: ['PUBLIC_FACILITIES'],
      priorities: ['P2'],
      locationIncludes: ['5栋'],
    },
  },
  {
    name: 'B5 电梯通风',
    text: '电梯里的风扇坏了,闷得很,老人坐一趟出一身汗。',
    expect: {
      exactIssues: 1,
      categories: ['PUBLIC_FACILITIES'],
      priorities: ['P2'],
      locationIncludes: ['5栋'],
    },
  },

  // ---- C 组: Hard Negative 语义 (含 1单元/一单元 的照明问题,不含电梯、不含灯+垃圾组合) ----
  {
    name: 'C1 一单元照明 (与 2单元 Case 同楼不同单元)',
    text: '三栋一单元的楼道灯坏了,晚上黑得看不见路。',
    expect: {
      exactIssues: 1,
      categories: ['PUBLIC_FACILITIES'],
      priorities: ['P3'],
      locationIncludes: ['1单元'],
    },
  },
  {
    name: 'C2 一单元灯闪烁',
    text: '一单元楼道灯闪烁了半个月,一直没人来修。',
    expect: {
      exactIssues: 1,
      categories: ['PUBLIC_FACILITIES'],
      priorities: ['P3'],
      locationIncludes: ['1单元'],
    },
  },
  {
    name: 'C3 1单元入口照明',
    text: '1单元门口的照明灯被雨淋坏了,晚上出门要打手电。',
    expect: {
      exactIssues: 1,
      categories: ['PUBLIC_FACILITIES'],
      priorities: ['P3'],
      locationIncludes: ['1单元'],
    },
  },
  {
    name: 'C4 一单元整层照明',
    text: '我们一单元每层的灯都不亮,反映过两次了。',
    expect: {
      exactIssues: 1,
      categories: ['PUBLIC_FACILITIES'],
      priorities: ['P3'],
      locationIncludes: ['1单元'],
    },
  },
  {
    name: 'C5 1单元地下室照明 (带风险信号)',
    text: '1单元地下室灯线老化,有时候打火,有点吓人。',
    expect: {
      exactIssues: 1,
      categories: ['PUBLIC_FACILITIES'],
      priorities: ['P3'],
      locationIncludes: ['1单元'],
    },
  },

  // ---- D 组: 默认/未分类 (不含任何路由关键词 → 缺失信息必须标注) ----
  {
    name: 'D1 噪音投诉',
    text: '中心广场晚上广场舞音响太大声,孩子没法写作业。',
    expect: {
      exactIssues: 1,
      categories: [null],
      priorities: [null],
      locationIncludes: [null],
      requireMissingInfo: true,
    },
  },
  {
    name: 'D2 消防通道',
    text: '南门消防通道又被私家车堵住了,真出事消防车都进不来。',
    expect: {
      exactIssues: 1,
      categories: [null],
      priorities: [null],
      locationIncludes: [null],
      requireMissingInfo: true,
    },
  },
  {
    name: 'D3 流浪动物',
    text: '小区里面流浪狗越来越多,孩子放学都不敢自己走。',
    expect: {
      exactIssues: 1,
      categories: [null],
      priorities: [null],
      locationIncludes: [null],
      requireMissingInfo: true,
    },
  },
  {
    name: 'D4 下水道 (含"三栋"但无单元号)',
    text: '三栋下水道堵了,一楼反水,希望尽快疏通。',
    expect: {
      exactIssues: 1,
      categories: [null],
      priorities: [null],
      locationIncludes: [null],
      requireMissingInfo: true,
    },
  },
  {
    name: 'D5 房屋渗漏',
    text: '楼顶防水层漏水,顶楼住户家里墙面都发霉了。',
    expect: {
      exactIssues: 1,
      categories: [null],
      priorities: [null],
      locationIncludes: [null],
      requireMissingInfo: true,
    },
  },
  {
    name: 'D6 群内推销',
    text: '有人在楼栋群里卖三无保健品,老人们容易上当。',
    expect: {
      exactIssues: 1,
      categories: [null],
      priorities: [null],
      locationIncludes: [null],
      requireMissingInfo: true,
    },
  },
]
