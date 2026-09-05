// components/AIDraftCard.tsx
// AI Draft 展示卡片
'use client'

import { IssueDraft } from '@onecase/contracts'
import { Badge } from './Badge'

interface AIDraftCardProps {
  issue: IssueDraft
  issueIndex: number
  totalIssues: number
  onConfirm?: () => void
  onEdit?: () => void
  onLink?: () => void
  onCreate?: () => void
}

export function AIDraftCard({
  issue,
  issueIndex,
  totalIssues,
  onConfirm,
  onEdit,
  onLink,
  onCreate,
}: AIDraftCardProps) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <h3 className="text-sm font-semibold">事项 {issueIndex + 1} / {totalIssues}</h3>
        <div className="flex items-center gap-2 text-purple-600">
          <span className="text-xs">✦</span>
          <span className="text-xs font-bold">AI 草稿 · 未写入事项</span>
        </div>
      </div>

      <div className="p-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-0.5">
            <label className="text-xs text-gray-400">标题</label>
            <p className="text-sm font-semibold">{issue.title}</p>
          </div>
          <div className="space-y-0.5">
            <label className="text-xs text-gray-400">类别</label>
            <p className="text-sm">{issue.categoryCode || '未识别'}</p>
          </div>
          <div className="space-y-0.5">
            <label className="text-xs text-gray-400">地点</label>
            <p className="text-sm">{issue.locationText || '未知'}</p>
          </div>
          <div className="space-y-0.5">
            <label className="text-xs text-gray-400">建议优先级</label>
            <p className={`text-sm font-bold ${issue.suggestedPriority === 'P1' ? 'text-red-600' : issue.suggestedPriority === 'P2' ? 'text-orange-600' : 'text-gray-600'}`}>
              {issue.suggestedPriority || 'UNKNOWN'}
            </p>
          </div>
        </div>

        {issue.summary && (
          <div>
            <label className="text-xs text-gray-400">摘要</label>
            <p className="text-xs text-gray-600 mt-0.5">{issue.summary}</p>
          </div>
        )}

        {issue.evidenceConflict && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-2.5">
            <label className="text-xs text-red-700 font-semibold">⚠ 信息冲突</label>
            <p className="text-xs text-red-600 mt-1">
              AI 检测到文字与图片/前后文之间存在矛盾,地点等字段请人工核对后再确认,以核对结果为准。
            </p>
          </div>
        )}

        {issue.missingInformation.length > 0 && (
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-2.5">
            <label className="text-xs text-orange-700 font-semibold">缺失信息</label>
            <ul className="text-xs text-orange-600 mt-1 space-y-0.5">
              {issue.missingInformation.map((info, i) => (
                <li key={i}>• {info}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="px-4 py-3 border-t border-gray-100 flex justify-end gap-2">
        <button onClick={onEdit} className="px-3 py-1.5 text-xs border rounded-md hover:bg-gray-50">
          编辑
        </button>
        <button onClick={onConfirm} className="px-3 py-1.5 text-xs bg-oc-blue text-white rounded-md hover:bg-oc-blue-hover">
          确认草稿
        </button>
      </div>
    </div>
  )
}
