// components/DuplicateCandidateCard.tsx
// 相似 Case 候选卡片
'use client'

import { Badge } from './Badge'

interface DuplicateCandidate {
  caseId: string
  caseNumber: string
  title: string
  score: number
  matchReasons: string[]
}

interface DuplicateCandidateCardProps {
  candidate: DuplicateCandidate
  onLink?: () => void
  onDismiss?: () => void
}

export function DuplicateCandidateCard({
  candidate,
  onLink,
  onDismiss,
}: DuplicateCandidateCardProps) {
  const scorePercent = Math.round(candidate.score * 100)

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-gray-900">{candidate.caseNumber}</span>
          <Badge variant={scorePercent >= 70 ? 'orange' : 'gray'}>
            {scorePercent >= 70 ? '高相似' : '中相似'}
          </Badge>
        </div>
      </div>

      <div>
        <p className="text-sm font-semibold">{candidate.title}</p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {candidate.matchReasons.map((reason, i) => (
          <span key={i} className="text-xs px-2 py-0.5 bg-gray-50 border rounded text-gray-600">
            {reason}
          </span>
        ))}
      </div>

      <div className="flex gap-2 pt-2">
        <button onClick={onLink} className="px-3 py-1.5 text-xs bg-oc-blue text-white rounded-md hover:bg-oc-blue-hover">
          关联此 Case
        </button>
        <button onClick={onDismiss} className="px-3 py-1.5 text-xs border rounded-md hover:bg-gray-50">
          不是同一事项
        </button>
      </div>
    </div>
  )
}
