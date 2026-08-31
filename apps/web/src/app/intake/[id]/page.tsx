// app/intake/[id]/page.tsx
// 历史 Intake URL 兼容入口,复用当前恢复/Review 流程。
import { notFound, redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function IntakePage({ params }: PageProps) {
  const { id } = await params

  const intake = await prisma.intake.findUnique({
    where: { id },
  })

  if (!intake) {
    notFound()
  }

  if (intake.status === 'CONFIRMED') redirect('/cases')
  if (intake.status === 'ANALYZED') redirect(`/intake/${encodeURIComponent(id)}/review`)
  redirect(`/intake?intakeId=${encodeURIComponent(id)}`)
}
