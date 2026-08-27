// app/intake/[id]/review/page.tsx
'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { AIDraftCard, Button, Badge } from '@/components'

interface Issue {
  id: string
  title: string
  summary?: string
  categoryCode?: string
  locationText?: string
  impact: string
  urgency: string
  affectedGroups: string[]
  riskSignals: string[]
  missingInfo: string[] // Prisma Schema 使用 missingInfo
  evidenceConflict: boolean
  suggestedPriority?: string
  action?: string
}

export default function IntakeReviewPage() {
  const params = useParams()
  const id = params.id as string

  const [issues, setIssues] = useState<Issue[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // 手动触发分析 (如果还没分析)
    fetch(`/api/intakes/${id}/analyze`, { method: 'POST' })
      .then((res) => res.json())
      .then((data) => {
        if (data.data?.issues) {
          setIssues(data.data.issues)
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [id])

  if (loading) {
    return <div className="p-8">加载中...</div>
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <h1 className="text-2xl font-bold">AI 草稿 · 待确认</h1>
          <Badge variant="purple">AI 建议</Badge>
        </div>
        <p className="text-sm text-gray-500">
          识别到 {issues.length} 个潜在事项,需要人工确认。
        </p>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 space-y-4">
          {issues.map((issue, idx) => (
            <AIDraftCard
              key={idx}
              issue={issue as any}
              issueIndex={idx}
              totalIssues={issues.length}
            />
          ))}
        </div>

        <div className="space-y-4">
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <h3 className="text-sm font-semibold mb-3">相似事项候选</h3>
            <p className="text-xs text-gray-400 mb-3">候选仅用于辅助判断,不会自动合并。</p>
            <div className="space-y-3">
              <p className="text-xs text-gray-400 text-center py-4">
                Demo Mode: 暂无真实相似候选
              </p>
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
            <p className="text-xs text-blue-700">
              <span className="font-bold">Demo 数据标识</span><br />
              当前展示为合成测试数据,不代表真实社区事项。
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
