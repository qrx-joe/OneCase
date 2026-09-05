// 能力接口测试: 装配层与模型层两级视觉判断必须如实暴露
// 不变量: Mock 不宣称视觉;非 Mock 纯文本模型不得冒认视觉能力 (StepFun 闭环审查 P1)
import { describe, it, expect, vi } from 'vitest'

const holder = vi.hoisted(() => ({
  info: { provider: 'mock', modelVersion: 'mock-v1' } as { provider: string; modelVersion: string },
  throwOnAssemble: false,
}))

// 部分替换: isVisionCapableModel 用真实实现 (路由与纯函数的接线一并覆盖)
vi.mock('@/lib/ai-provider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/ai-provider')>()
  return {
    ...actual,
    getExtractionProvider: vi.fn(() => {
      if (holder.throwOnAssemble) throw new Error('AI Provider 配置不可用: API key is required')
      return {}
    }),
    getProviderInfo: () => holder.info,
  }
})

import { GET } from './route'

describe('GET /api/intakes/capabilities', () => {
  it('mock 装配: provider 如实为 mock,两层视觉判断均为 false', async () => {
    holder.throwOnAssemble = false
    holder.info = { provider: 'mock', modelVersion: 'mock-v1' }
    const body = await (await GET()).json()
    expect(body.data).toEqual({
      provider: 'mock',
      model: 'mock-v1',
      imageProviderConfigured: false,
      imageModelSupported: false,
    })
  })

  it('非 Mock 视觉模型 (step-1o-turbo-vision): 两层判断均为 true', async () => {
    holder.throwOnAssemble = false
    holder.info = { provider: 'stepfun', modelVersion: 'step-1o-turbo-vision' }
    const body = await (await GET()).json()
    expect(body.data.imageProviderConfigured).toBe(true)
    expect(body.data.imageModelSupported).toBe(true)
  })

  it('非 Mock 但配置纯文本模型: 装配 true、模型级 false,不冒认', async () => {
    holder.throwOnAssemble = false
    holder.info = { provider: 'stepfun', modelVersion: 'step-2-16k' }
    const body = await (await GET()).json()
    expect(body.data.imageProviderConfigured).toBe(true)
    expect(body.data.imageModelSupported).toBe(false)
  })

  it('装配失败 (如缺 Key 且未授权降级): provider=null,视觉能力均 false,不泄露配置错误详情', async () => {
    holder.throwOnAssemble = true
    const body = await (await GET()).json()
    expect(body.data).toEqual({
      provider: null,
      imageProviderConfigured: false,
      imageModelSupported: false,
    })
  })
})
