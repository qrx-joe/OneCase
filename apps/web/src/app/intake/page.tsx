// 新建 Intake 页面
'use client'

import { useState } from 'react'

export default function NewIntakePage() {
  const [rawText, setRawText] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)

  const handleAnalyze = async () => {
    if (!rawText.trim()) return

    setLoading(true)
    try {
      // 1. 创建 Intake
      const intakeRes = await fetch('/api/intakes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rawText,
          sourceType: 'text',
          organizationId: 'demo-org', // Demo Mode
        }),
      })
      const intakeData = await intakeRes.json()
      const intakeId = intakeData.data.id

      // 2. 触发 AI 分析
      const analyzeRes = await fetch(`/api/intakes/${intakeId}/analyze`, {
        method: 'POST',
      })
      const analyzeData = await analyzeRes.json()

      setResult(analyzeData.data)
    } catch (error) {
      console.error('Failed:', error)
      alert('分析失败,请重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-8">
      <h1 className="text-3xl font-bold mb-6">新建居民信息</h1>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-2">居民原始信息</label>
          <textarea
            className="w-full p-4 border rounded-lg min-h-[200px]"
            placeholder="粘贴居民反馈..."
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
          />
        </div>

        <button
          onClick={handleAnalyze}
          disabled={loading || !rawText.trim()}
          className="px-6 py-3 bg-blue-500 text-white rounded-lg disabled:opacity-50"
        >
          {loading ? 'AI 整理中...' : 'AI 整理为事项'}
        </button>
      </div>

      {result && (
        <div className="mt-8 space-y-4">
          <h2 className="text-2xl font-bold">AI 草稿 · 待确认</h2>
          <p className="text-sm text-gray-500">
            识别到 {result.issues.length} 个潜在事项
          </p>

          {result.issues.map((issue: any, idx: number) => (
            <div key={idx} className="border rounded-lg p-6">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-lg font-semibold">事项 {idx + 1} / {result.issues.length}</h3>
                <span className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded">
                  AI 草稿 · 未写入 Case
                </span>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-xs text-gray-500">标题</label>
                  <p className="font-medium">{issue.title}</p>
                </div>

                {issue.summary && (
                  <div>
                    <label className="text-xs text-gray-500">摘要</label>
                    <p className="text-sm text-gray-700">{issue.summary}</p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-gray-500">类别</label>
                    <p>{issue.categoryCode || '未识别'}</p>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">地点</label>
                    <p>{issue.locationText || '未知'}</p>
                  </div>
                </div>

                {issue.missingInformation.length > 0 && (
                  <div className="bg-orange-50 border border-orange-200 rounded p-3">
                    <label className="text-xs text-orange-700 font-medium">缺失信息</label>
                    <ul className="text-sm text-orange-600 mt-1">
                      {issue.missingInformation.map((info: string, i: number) => (
                        <li key={i}>• {info}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <button className="px-4 py-2 bg-blue-500 text-white rounded text-sm">
                    确认草稿
                  </button>
                  <button className="px-4 py-2 border rounded text-sm">
                    编辑
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
