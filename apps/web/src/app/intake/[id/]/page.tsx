// app/intake/[id]/page.tsx
// Intake 编辑页面
import { notFound } from 'next/navigation'
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

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">新建居民信息</h1>

      <form action="/api/intakes" method="POST" className="space-y-4">
        <input type="hidden" name="organizationId" value="demo-org" />
        <input type="hidden" name="sourceType" value="text" />

        <div>
          <label className="block text-sm font-medium mb-2">居民原始信息</label>
          <textarea
            name="rawText"
            className="w-full p-4 border border-gray-300 rounded-lg min-h-[200px]"
            placeholder="粘贴居民反馈..."
            defaultValue={intake.rawText || ''}
          />
        </div>

        <div className="flex gap-3">
          <button
            type="submit"
            className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
          >
            保存草稿
          </button>
          <a
            href="/"
            className="px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 inline-block"
          >
            取消
          </a>
        </div>
      </form>
    </div>
  )
}
