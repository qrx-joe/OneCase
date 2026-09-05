import { NextResponse } from 'next/server'
import { getExtractionProvider, getProviderInfo, isVisionCapableModel } from '@/lib/ai-provider'

export const dynamic = 'force-dynamic'

export async function GET() {
  // 仅检查本地装配，不调用外部模型，也不返回密钥或配置错误详情。
  try {
    getExtractionProvider()
    const { provider, modelVersion } = getProviderInfo()
    return NextResponse.json({
      data: {
        provider,
        model: modelVersion,
        imageProviderConfigured: provider !== 'mock',
        // 模型级判断: 非 Mock 但配置了纯文本模型时为 false,UI 如实提示而不是冒认视觉能力
        imageModelSupported: isVisionCapableModel(provider, modelVersion),
      },
    }, {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch {
    return NextResponse.json({ data: { provider: null, imageProviderConfigured: false, imageModelSupported: false } }, {
      headers: { 'Cache-Control': 'no-store' },
    })
  }
}
