// 今日工作页面 (Dashboard)
'use client'

import { useEffect, useState } from 'react'

interface Case {
  id: string
  caseNumber: string
  title: string
  priority: string
  status: string
  categoryCode?: string
}

export default function HomePage() {
  const [cases, setCases] = useState<Case[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // TODO: 实现 GET /api/cases
    // 当前使用 Mock 数据
    setTimeout(() => {
      setCases([
        {
          id: '1',
          caseNumber: 'CASE-018',
          title: '3栋2单元楼道照明故障',
          priority: 'P2',
          status: 'IN_PROGRESS',
          categoryCode: 'PUBLIC_FACILITIES',
        },
        {
          id: '2',
          caseNumber: 'CASE-016',
          title: '5栋电梯运行异常',
          priority: 'P2',
          status: 'IN_PROGRESS',
          categoryCode: 'PUBLIC_FACILITIES',
        },
        {
          id: '3',
          caseNumber: 'CASE-021',
          title: '西门口垃圾未及时清运',
          priority: 'P3',
          status: 'OPEN',
          categoryCode: 'ENVIRONMENT',
        },
      ])
      setLoading(false)
    }, 500)
  }, [])

  if (loading) {
    return <div className="p-8">加载中...</div>
  }

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-6">今日工作</h1>

      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="border rounded-lg p-4">
          <div className="text-sm text-gray-500">待处理</div>
          <div className="text-3xl font-bold mt-2">{cases.length}</div>
        </div>
        <div className="border rounded-lg p-4">
          <div className="text-sm text-gray-500">高优先级</div>
          <div className="text-3xl font-bold mt-2">
            {cases.filter((c) => c.priority === 'P1' || c.priority === 'P2').length}
          </div>
        </div>
        <div className="border rounded-lg p-4">
          <div className="text-sm text-gray-500">处理中</div>
          <div className="text-3xl font-bold mt-2">
            {cases.filter((c) => c.status === 'IN_PROGRESS').length}
          </div>
        </div>
        <div className="border rounded-lg p-4">
          <div className="text-sm text-gray-500">本周解决</div>
          <div className="text-3xl font-bold mt-2">27</div>
          <div className="text-xs text-gray-400 mt-1">Demo 数据 · 仅示意</div>
        </div>
      </div>

      <div className="border rounded-lg">
        <div className="p-4 border-b">
          <h2 className="text-lg font-semibold">最近事项</h2>
        </div>
        <div className="divide-y">
          {cases.map((c) => (
            <div key={c.id} className="p-4 hover:bg-gray-50 cursor-pointer">
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-medium">{c.title}</div>
                  <div className="text-sm text-gray-500 mt-1">
                    {c.caseNumber}
                  </div>
                </div>
                <span
                  className={`text-xs px-2 py-1 rounded ${
                    c.priority === 'P1'
                      ? 'bg-red-100 text-red-700'
                      : c.priority === 'P2'
                      ? 'bg-orange-100 text-orange-700'
                      : 'bg-gray-100 text-gray-700'
                  }`}
                >
                  {c.priority}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6">
        <a
          href="/intake"
          className="inline-block px-6 py-3 bg-blue-500 text-white rounded-lg"
        >
          ＋ 新建 Intake
        </a>
      </div>
    </div>
  )
}
