// app/cases/new/page.tsx
// 手动创建 Case: AI 不可用时的兜底路径 (TASK.md: 异常情况下仍可手动创建 Case)
// 携带 ?intakeId= 时,把 AI 失败前已保存的原始反馈关联为本 Case 的居民来源
'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { AppLayout } from '@/components/AppLayout'
import { Button } from '@/components'

const CATEGORY_OPTIONS = [
  { code: '', label: '未分类' },
  { code: 'PUBLIC_FACILITIES', label: '公共设施' },
  { code: 'ENVIRONMENT', label: '环境卫生' },
  { code: 'NOISE', label: '噪音邻里' },
  { code: 'SAFETY', label: '安全隐患' },
  { code: 'PARKING', label: '停车管理' },
]

const PRIORITY_OPTIONS = ['P1', 'P2', 'P3', 'UNKNOWN']

function ManualCaseForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const sourceIntakeId = searchParams.get('intakeId') || ''

  const [title, setTitle] = useState('')
  const [locationText, setLocationText] = useState('')
  const [categoryCode, setCategoryCode] = useState('')
  const [priority, setPriority] = useState('P2')
  const [summary, setSummary] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSubmit = title.trim().length > 0 && !submitting

  const handleSubmit = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          locationText: locationText || undefined,
          categoryCode: categoryCode || undefined,
          priority,
          summary: summary || undefined,
          sourceIntakeId: sourceIntakeId || undefined,
          userId: 'demo-user',
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.data?.caseNumber) {
        throw new Error(data.details?.join(', ') || data.error || '创建失败')
      }
      router.push(`/cases/${data.data.caseNumber}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : '创建失败,请重试')
      setSubmitting(false)
    }
  }

  return (
    <AppLayout title="手动创建 Case">
      <div className="page-head">
        <div>
          <h2>手动创建 Case</h2>
          <p>AI 不可用或信息已明确时,人工直接登记事项。创建即为业务事实。</p>
        </div>
      </div>

      {sourceIntakeId && (
        <div className="privacy-note" style={{ marginBottom: 16 }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 16V4M7 9l5-5 5 5" />
            <path d="M5 14v5h14v-5" />
          </svg>
          <span>
            将把 AI 分析失败前保存的原始反馈关联为本 Case 的居民来源 (原始信息不丢失)。
          </span>
        </div>
      )}

      <div className="detail-grid" style={{ gridTemplateColumns: '1fr' }}>
        <div className="detail-card">
          <div className="detail-section">
            <label className="field-label" htmlFor="manual-title">
              事项标题 *
            </label>
            <input
              id="manual-title"
              className="field"
              placeholder="一句话概括问题,如: 南门路灯杆倾斜"
              value={title}
              maxLength={200}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="detail-section">
            <h3>基本信息</h3>
            <div className="detail-meta">
              <div className="meta-item">
                <label className="field-label" htmlFor="manual-location">地点</label>
                <input
                  id="manual-location"
                  className="field"
                  placeholder="如: 3栋2单元 / 西门口"
                  value={locationText}
                  onChange={(e) => setLocationText(e.target.value)}
                />
              </div>
              <div className="meta-item">
                <label className="field-label" htmlFor="manual-category">类别</label>
                <select
                  id="manual-category"
                  className="field"
                  value={categoryCode}
                  onChange={(e) => setCategoryCode(e.target.value)}
                >
                  {CATEGORY_OPTIONS.map((opt) => (
                    <option key={opt.code} value={opt.code}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="meta-item">
                <label className="field-label" htmlFor="manual-priority">优先级</label>
                <select
                  id="manual-priority"
                  className="field"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                >
                  {PRIORITY_OPTIONS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="detail-section">
            <label className="field-label" htmlFor="manual-summary">事项摘要</label>
            <textarea
              id="manual-summary"
              className="field"
              rows={4}
              placeholder="补充背景、影响范围、居民诉求..."
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
            />
          </div>

          {error && (
            <div
              style={{
                margin: '0 20px 16px',
                padding: '10px 14px',
                borderRadius: 11,
                background: 'var(--oc-red-soft)',
                color: '#C92F27',
                fontSize: 12,
              }}
            >
              ⚠ {error}
            </div>
          )}

          <div className="detail-section" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => router.back()} disabled={submitting}>
              取消
            </Button>
            <Button variant="primary" onClick={handleSubmit} disabled={!canSubmit}>
              {submitting ? '创建中...' : '创建 Case'}
            </Button>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}

export default function NewCasePage() {
  return (
    <Suspense
      fallback={
        <AppLayout title="手动创建 Case">
          <div />
        </AppLayout>
      }
    >
      <ManualCaseForm />
    </Suspense>
  )
}
