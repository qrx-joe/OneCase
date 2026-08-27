// app/cases/[id]/page.tsx
// Case Detail 页面 (真实数据: GET /api/cases/[id])
'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { AppLayout } from '@/components/AppLayout'
import { Button, Badge } from '@/components'

interface SourceDetail {
  id: string
  issueIndex: number
  createdAt: string
  intake: {
    id: string
    rawText: string | null
    status: string
    createdAt: string
  } | null
}

interface TimelineEvent {
  id: string
  type: string
  title: string
  fromValue?: string | null
  toValue: string
  note?: string | null
  createdAt: string
}

interface CaseDetail {
  id: string
  caseNumber: string
  title: string
  status: string
  priority: string
  summary?: string | null
  categoryCode?: string | null
  locationText?: string | null
  assigneeId?: string | null
  version: number
  createdAt: string
  updatedAt: string
  sources: SourceDetail[]
  timeline: TimelineEvent[]
}

const STATUS_LABELS: Record<string, { label: string; variant: 'blue' | 'orange' | 'green' | 'gray' }> = {
  OPEN: { label: '待处理', variant: 'blue' },
  IN_PROGRESS: { label: '处理中', variant: 'orange' },
  WAITING: { label: '等待外部', variant: 'gray' },
  RESOLVED: { label: '已解决', variant: 'green' },
  CLOSED: { label: '已关闭', variant: 'gray' },
  CANCELED: { label: '已取消', variant: 'gray' },
}

const CATEGORY_LABELS: Record<string, string> = {
  PUBLIC_FACILITIES: '公共设施',
  ENVIRONMENT: '环境卫生',
  NOISE: '噪音邻里',
  SAFETY: '安全隐患',
  PARKING: '停车管理',
}

export default function CaseDetailPage() {
  const params = useParams()
  const id = params.id as string

  const [caseData, setCaseData] = useState<CaseDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/cases/${id}`)
        const data = await res.json()

        if (!res.ok || !data.data) {
          setError(data.error === 'CASE_NOT_FOUND' ? '事项不存在或已被删除' : data.error || '加载失败')
          return
        }
        setCaseData(data.data)
      } catch (e) {
        console.error('Load case failed:', e)
        setError('网络错误,请重试')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id])

  if (loading) {
    return (
      <AppLayout title="事项详情">
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
          <span className="spinner" style={{ display: 'inline-block', marginRight: 8 }}></span>
          正在加载事项...
        </div>
      </AppLayout>
    )
  }

  if (error || !caseData) {
    return (
      <AppLayout title="事项详情">
        <div style={{ padding: 60, textAlign: 'center' }}>
          <p style={{ color: 'var(--oc-red)', fontSize: 14, marginBottom: 16 }}>{error}</p>
          <Link href="/">
            <Button variant="secondary">返回今日工作</Button>
          </Link>
        </div>
      </AppLayout>
    )
  }

  const statusInfo = STATUS_LABELS[caseData.status] || { label: caseData.status, variant: 'gray' as const }

  return (
    <AppLayout title="事项详情">
      {/* 页头 */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <Badge variant="gray">{caseData.caseNumber}</Badge>
          <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
          <Badge variant="gray">v{caseData.version}</Badge>
        </div>
        <h2 style={{ fontSize: 25, letterSpacing: '-0.035em', marginBottom: 4 }}>
          {caseData.title}
        </h2>
        <p style={{ color: 'var(--text-3)', fontSize: 12 }}>
          {caseData.sources.length} 条居民反馈已关联 · 创建于{' '}
          {new Date(caseData.createdAt).toLocaleDateString('zh-CN')}
        </p>
      </div>

      <div className="detail-grid">
        {/* 左侧: 详情 */}
        <div className="detail-card">
          <div className="detail-section">
            <h3>事项摘要</h3>
            <p style={{ fontSize: 11, color: 'var(--text-2)', lineHeight: 1.65 }}>
              {caseData.summary || '暂无摘要'}
            </p>
          </div>

          <div className="detail-section">
            <h3>基本信息</h3>
            <div className="detail-meta">
              <div className="meta-item">
                <label>优先级</label>
                <div
                  style={{
                    color:
                      caseData.priority === 'P1'
                        ? 'var(--oc-red)'
                        : caseData.priority === 'P2'
                        ? '#C86C00'
                        : 'inherit',
                  }}
                >
                  {caseData.priority}
                </div>
              </div>
              <div className="meta-item">
                <label>类别</label>
                <div>
                  {caseData.categoryCode
                    ? CATEGORY_LABELS[caseData.categoryCode] || caseData.categoryCode
                    : '未分类'}
                </div>
              </div>
              <div className="meta-item">
                <label>地点</label>
                <div>{caseData.locationText || '未知'}</div>
              </div>
              <div className="meta-item">
                <label>负责人</label>
                <div>{caseData.assigneeId ? `用户 ${caseData.assigneeId.slice(0, 8)}…` : '待分派'}</div>
              </div>
            </div>
          </div>

          <div className="detail-section">
            <h3>居民来源 · {caseData.sources.length}</h3>
            {caseData.sources.length === 0 ? (
              <p style={{ fontSize: 10, color: 'var(--text-3)', padding: '12px 0' }}>
                暂无关联的居民反馈 (此 Case 由人工直接创建)
              </p>
            ) : (
              caseData.sources.map((source) => (
                <div key={source.id} className="source">
                  <p>"{source.intake?.rawText || '(无文字内容)'}"</p>
                  <small>
                    {new Date(source.createdAt).toLocaleDateString('zh-CN', {
                      month: '2-digit',
                      day: '2-digit',
                    })}{' '}
                    · 已脱敏文本 · 来自反馈 #{source.issueIndex + 1}
                  </small>
                </div>
              ))
            )}
          </div>
        </div>

        {/* 右侧: Timeline + AI 建议 */}
        <div className="detail-card">
          <div className="detail-section">
            <h3>Activity</h3>
            {caseData.timeline.length === 0 ? (
              <p style={{ fontSize: 10, color: 'var(--text-3)', padding: '8px 0' }}>
                暂无操作记录
              </p>
            ) : (
              <div className="timeline">
                {caseData.timeline.map((event) => (
                  <div key={event.id} className="event">
                    <span className="event-dot"></span>
                    <div>
                      <b>{event.title}</b>
                      <small>
                        {new Date(event.createdAt).toLocaleString('zh-CN', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </small>
                      {event.note ? (
                        <p>{event.note}</p>
                      ) : event.fromValue ? (
                        <p>
                          {event.fromValue} → {event.toValue}
                        </p>
                      ) : (
                        <p>{event.toValue}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="detail-section">
            <h3>AI 建议</h3>
            <div className="privacy-note">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 3l2.1 4.8L19 10l-4.9 2.2L12 17l-2.1-4.8L5 10l4.9-2.2z" />
              </svg>
              <span>
                {caseData.sources.length >= 2
                  ? `该事项已有 ${caseData.sources.length} 条反馈,处理完成后建议观察是否再次发生。`
                  : '建议跟进居民确认问题是否已解决,再关闭此事项。'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
