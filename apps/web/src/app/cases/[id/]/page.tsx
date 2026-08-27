// Case Detail 页面
'use client'

import { useEffect, useState } from 'react'

interface CaseDetail {
  id: string
  caseNumber: string
  title: string
  status: string
  priority: string
  summary?: string
  sources: Array<{
    intake: {
      rawText: string
    }
  }>
}

export default function CaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [caseData, setCaseData] = useState<CaseDetail | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // TODO: 实现 GET /api/cases/[id]
    // 当前 Mock
    setTimeout(() => {
      setCaseData({
        id: '1',
        caseNumber: 'CASE-018',
        title: '3栋2单元楼道照明故障',
        status: 'IN_PROGRESS',
        priority: 'P2',
        summary: '3栋2单元楼道照明设施反复出现故障,多位居民反馈夜间通行较暗。',
        sources: [
          {
            intake: {
              rawText: '三栋楼道晚上特别黑,灯好像又坏了。',
            },
          },
        ],
      })
      setLoading(false)
    }, 500)
  }, [params])

  if (loading) {
    return <div className="p-8">加载中...</div>
  }

  if (!caseData) {
    return <div className="p-8">Case 不存在</div>
  }

  return (
    <div className="p-8">
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-sm bg-gray-100 px-2 py-1 rounded">{caseData.caseNumber}</span>
          <span className="text-sm bg-orange-100 text-orange-700 px-2 py-1 rounded">
            {caseData.status}
          </span>
        </div>
        <h1 className="text-3xl font-bold">{caseData.title}</h1>
        {caseData.summary && (
          <p className="text-gray-600 mt-2">{caseData.summary}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="border rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4">居民来源</h2>
          <div className="space-y-4">
            {caseData.sources.map((source, idx) => (
              <div key={idx} className="border-l-2 border-blue-500 pl-4">
                <p className="text-sm">"{source.intake.rawText}"</p>
              </div>
            ))}
          </div>
        </div>

        <div className="border rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4">Activity Timeline</h2>
          <div className="space-y-4">
            <div className="border-l-2 border-blue-500 pl-4">
              <div className="text-sm font-medium">Case 创建</div>
              <div className="text-xs text-gray-500 mt-1">2026-08-27</div>
            </div>
            <div className="border-l-2 border-gray-300 pl-4">
              <div className="text-sm">处理中</div>
              <div className="text-xs text-gray-500 mt-1">2026-08-27</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
