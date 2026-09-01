// POST /api/intakes - 创建 Intake
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { resolveOrgId } from '@/lib/demo-context'
import { CreateIntakeSchema } from '@onecase/contracts'
import { Prisma, type Intake } from '@prisma/client'
import { IntakeUploadError, parseImageIntake } from '@/lib/intake-upload'

export async function POST(request: NextRequest) {
  try {
    let data
    let attachment: Awaited<ReturnType<typeof parseImageIntake>>['attachment'] | undefined
    if (request.headers.get('content-type')?.startsWith('multipart/form-data')) {
      const upload = await parseImageIntake(request)
      data = upload.data
      attachment = upload.attachment
    } else {
      let body: unknown
      try { body = await request.json() }
      catch { return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 }) }
      const parsed = CreateIntakeSchema.safeParse(body)
      if (!parsed.success) {
        return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
      }
      data = parsed.data
    }
    const { rawText, sourceType, idempotencyKey, organizationId } = data
    const orgId = await resolveOrgId(organizationId)

    // key 仍为全局唯一: 不迁移 schema。跨组织或不同载荷复用同 key 返回冲突,
    // 不向调用方返回另一条请求的 Intake 内容;这不是认证/授权校验。
    const replay = async (existing: Intake) => {
      if (existing.organizationId !== orgId || existing.rawText !== rawText || existing.sourceType !== sourceType) {
        return NextResponse.json({ error: 'IDEMPOTENCY_KEY_CONFLICT' }, { status: 409 })
      }
      const saved = await prisma.attachment.findMany({ where: { intakeId: existing.id } })
      if (attachment ? saved.length !== 1 || saved[0].url !== attachment.url : saved.length !== 0) {
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
      const intake = await prisma.$transaction(async (tx) => {
        const created = await tx.intake.create({
          data: { organizationId: orgId, sourceType, rawText, idempotencyKey, status: 'PENDING' },
        })
        if (attachment) await tx.attachment.create({ data: { ...attachment, intakeId: created.id } })
        return created
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
    if (error instanceof IntakeUploadError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('Create intake failed:', error)
    return NextResponse.json(
      { error: 'Failed to create intake' },
      { status: 500 }
    )
  }
}
