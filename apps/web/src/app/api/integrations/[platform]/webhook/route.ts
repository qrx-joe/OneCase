// POST/GET /api/integrations/[platform]/webhook - 消息渠道入站回调 (ADR-004)
// 未配置凭据时如实 503 (不冒充可用);配置后才走签名校验与建件。
// 建件复用 /api/intakes 的创建契约: 同一份 zod 校验 + 幂等键 replay/P2002 语义,
// 幂等键 = `${platform}:${externalMessageId}` → 平台重推天然去重。
import { NextRequest, NextResponse } from 'next/server'
import { getIntegrationAdapter } from '@/lib/integrations'
import { POST as createIntakeRoute } from '../../../intakes/route'

// 与 contracts CreateIntakeSchema 的 rawText 上限一致;平台长消息按此截断入库
const RAW_TEXT_LIMIT = 10000

export async function POST(request: NextRequest, ctx: { params: Promise<{ platform: string }> }) {
  const { platform } = await ctx.params
  const adapter = getIntegrationAdapter(platform)
  if (!adapter) return NextResponse.json({ error: 'UNKNOWN_PLATFORM' }, { status: 404 })
  if (!adapter.isConfigured(process.env)) {
    return NextResponse.json(
      {
        error: 'INTEGRATION_NOT_CONFIGURED',
        platform,
        missing: adapter.requiredEnv.filter((key) => !process.env[key]),
      },
      { status: 503 }
    )
  }

  const rawBody = await request.text()
  const verdict = adapter.handle({
    env: process.env,
    method: 'POST',
    rawBody,
    query: request.nextUrl.searchParams,
    header: (name) => request.headers.get(name),
  })

  if (verdict.kind === 'reject') {
    return NextResponse.json({ error: verdict.reason }, { status: verdict.status })
  }
  if (verdict.kind === 'challenge') {
    if (typeof verdict.payload === 'string') {
      return new Response(verdict.payload, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
    }
    return NextResponse.json(verdict.payload)
  }
  if (verdict.kind === 'ignore') {
    return NextResponse.json({ data: { ignored: true, reason: verdict.reason } })
  }

  const rawText = verdict.message.text.trim().slice(0, RAW_TEXT_LIMIT)
  if (!rawText) {
    return NextResponse.json({ data: { ignored: true, reason: 'EMPTY_TEXT' } })
  }
  const forward = await createIntakeRoute(
    new NextRequest('http://localhost/api/intakes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rawText,
        sourceType: platform,
        idempotencyKey: `${platform}:${verdict.message.externalMessageId}`,
      }),
    })
  )
  if (forward.status === 200) {
    const body = (await forward.json()) as { data?: { id?: string } }
    return NextResponse.json({ data: { accepted: true, intakeId: body.data?.id } })
  }
  const error = (await forward.json().catch(() => ({}))) as { error?: string }
  console.error(`Integration forward failed (${platform}):`, forward.status, error.error)
  return NextResponse.json(
    { error: 'INTEGRATION_FORWARD_FAILED', detail: error.error ?? forward.status },
    { status: 502 }
  )
}

export async function GET(request: NextRequest, ctx: { params: Promise<{ platform: string }> }) {
  const { platform } = await ctx.params
  const adapter = getIntegrationAdapter(platform)
  if (!adapter) return NextResponse.json({ error: 'UNKNOWN_PLATFORM' }, { status: 404 })
  if (!adapter.isConfigured(process.env)) {
    return NextResponse.json(
      { error: 'INTEGRATION_NOT_CONFIGURED', platform, missing: adapter.requiredEnv.filter((key) => !process.env[key]) },
      { status: 503 }
    )
  }
  // 目前只有企业微信用 GET 做「验证 URL」握手;其余平台 GET 无意义
  if (platform !== 'wecom') {
    return NextResponse.json({ error: 'METHOD_NOT_SUPPORTED' }, { status: 405 })
  }
  const verdict = adapter.handle({
    env: process.env,
    method: 'GET',
    rawBody: '',
    query: request.nextUrl.searchParams,
    header: (name) => request.headers.get(name),
  })
  if (verdict.kind === 'challenge' && typeof verdict.payload === 'string') {
    return new Response(verdict.payload, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
  }
  if (verdict.kind === 'reject') {
    return NextResponse.json({ error: verdict.reason }, { status: verdict.status })
  }
  return NextResponse.json({ error: 'UNEXPECTED_VERDICT' }, { status: 500 })
}
