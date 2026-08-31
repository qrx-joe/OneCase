// POST /api/intakes - 创建 Intake
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveOrgId } from '@/lib/demo-context'
import { CreateIntakeSchema } from '@onecase/contracts'
import { Prisma, type Intake } from '@prisma/client'

export async function POST(request: NextRequest) {
  try {
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 })
    }
    const parsed = CreateIntakeSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      )
    }
    const { rawText, sourceType, idempotencyKey, organizationId } = parsed.data
    const orgId = await resolveOrgId(organizationId)

    // key 仍为全局唯一: 不迁移 schema。跨组织或不同载荷复用同 key 返回冲突,
    // 不向调用方返回另一条请求的 Intake 内容;这不是认证/授权校验。
    const replay = (existing: Intake) => {
      if (existing.organizationId !== orgId || existing.rawText !== rawText || existing.sourceType !== sourceType) {
        return NextResponse.json({ error: 'IDEMPOTENCY_KEY_CONFLICT' }, { status: 409 })
      }
      return NextResponse.json({ data: existing })
    }

    // 检查 Idempotency Key
    if (idempotencyKey) {
      const existing = await prisma.intake.findUnique({
        where: { idempotencyKey },
      })
      if (existing) {
        return replay(existing)
      }
    }

    try {
      const intake = await prisma.intake.create({
        data: { organizationId: orgId, sourceType, rawText, idempotencyKey, status: 'PENDING' },
      })
      return NextResponse.json({ data: intake })
    } catch (error) {
      if (idempotencyKey && error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await prisma.intake.findUnique({ where: { idempotencyKey } })
        if (existing) return replay(existing)
      }
      throw error
    }
  } catch (error) {
    console.error('Create intake failed:', error)
    return NextResponse.json(
      { error: 'Failed to create intake' },
      { status: 500 }
    )
  }
}
