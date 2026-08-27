// POST /api/intakes - 创建 Intake
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { rawText, sourceType = 'text', idempotencyKey, organizationId } = body

    if (!rawText || !organizationId) {
      return NextResponse.json(
        { error: 'rawText and organizationId are required' },
        { status: 400 }
      )
    }

    // 检查 Idempotency Key
    if (idempotencyKey) {
      const existing = await prisma.intake.findUnique({
        where: { idempotencyKey },
      })
      if (existing) {
        return NextResponse.json({ data: existing })
      }
    }

    const intake = await prisma.intake.create({
      data: {
        organizationId,
        sourceType,
        rawText,
        idempotencyKey,
        status: 'PENDING',
      },
    })

    return NextResponse.json({ data: intake })
  } catch (error) {
    console.error('Create intake failed:', error)
    return NextResponse.json(
      { error: 'Failed to create intake' },
      { status: 500 }
    )
  }
}
