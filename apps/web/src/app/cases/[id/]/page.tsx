// app/cases/[id]/page.tsx
// Case Detail 页面
'use client'

import { useEffect, useState } from 'react'
import { AppLayout } from '@/components/AppLayout'
import { Button, Badge } from '@/components'

interface Source {
  intake: {
    rawText: string
    createdAt: string
  }
}

interface Action {
  action: string
  fromValue?: string
  toValue: string
  note?: string
  createdAt: string
}

interface CaseDetail {
  id: string
  caseNumber: string
  title: string
  status: string
  priority: string
  summary?: string
  categoryCode?: string
  locationText?: string
  assigneeId?: string
  sources: Source[]
  actions: Action[]
}

export default function CaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [caseData, setCaseData] = useState<CaseDetail | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // TODO: 实现 GET /api/cases/:id
    // 当前 Mock
    setTimeout(() => {
      setCaseData({
        id: '1',
        caseNumber: 'CASE-018',
        title: '3栋2单元楼道照明故障',
        status: 'IN_PROGRESS',
        priority: 'P2',
        summary: '3栋2单元楼道照明设施反复出现故障,多位居民反馈夜间通行较暗,存在老人通行安全风险。',
        categoryCode: 'PUBLIC_FACILITIES',
        locationText: '3栋2单元',
        assigneeId: '1',
        sources: [
          {
            intake: {
              rawText: '三栋楼道晚上特别黑,灯好像又坏了。',
              createdAt: '2026-08-24T09:22:00Z',
            },
          },
          {
            intake: {
              rawText: '三栋二单元那个灯又坏了,我妈昨天晚上回来差点摔倒。',
              createdAt: '2026-08-27T16:42:00Z',
            },
          },
        ],
        actions: [
          {
            action: 'STATUS_CHANGE',
            fromValue: 'OPEN',
            toValue: 'IN_PROGRESS',
            createdAt: '2026-08-25T14:08:00Z',
          },
          {
            action: 'ASSIGN',
            fromValue: '待分派',
            toValue: '物业协调',
            createdAt: '2026-08-26T10:16:00Z',
          },
        ],
      })
      setLoading(false)
    }, 500)
  }, [params])

  if (loading) {
    return (
      <AppLayout title="事项详情">
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }}>
          加载中...
        </div>
      </AppLayout>
    )
  }

  if (!caseData) {
    return (
      <AppLayout title="事项详情">
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }}>
          Case 不存在
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout title="事项详情">
      <div style={{ marginBottom: 24 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 8,
          }}
        >
          <Badge variant="gray">{caseData.caseNumber}</Badge>
          <Badge
            variant={
              caseData.status === 'OPEN'
                ? 'blue'
                : caseData.status === 'IN_PROGRESS'
                ? 'orange'
                : caseData.status === 'RESOLVED'
                ? 'green'
                : 'gray'
            }
          >
            {caseData.status === 'OPEN'
              ? '待处理'
              : caseData.status === 'IN_PROGRESS'
              ? '处理中'
              : caseData.status === 'RESOLVED'
              ? '已解决'
              : caseData.status}
          </Badge>
        </div>
        <h2
          style={{
            fontSize: 25,
            letterSpacing: -0.035,
            marginBottom: 4,
          }}
        >
          {caseData.title}
        </h2>
        <p style={{ color: 'var(--text-3)', fontSize: 12 }}>
          {caseData.sources.length} 条居民反馈已关联到同一事项。
        </p>
      </div>

      <div className="detail-grid">
        {/* 左侧: 详情 */}
        <div className="detail-card">
          <div className="detail-section">
            <h3>事项摘要</h3>
            <p
              style={{
                fontSize: 11,
                color: 'var(--text-2)',
                lineHeight: 1.65,
              }}
            >
              {caseData.summary}
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
                <div>{caseData.categoryCode || '-'}</div>
              </div>
              <div className="meta-item">
                <label>地点</label>
                <div>{caseData.locationText || '未知'}</div>
              </div>
              <div className="meta-item">
                <label>负责人</label>
                <div>{caseData.assigneeId ? '物业协调' : '待分派'}</div>
              </div>
            </div>
          </div>

          <div className="detail-section">
            <h3>居民来源 · {caseData.sources.length}</h3>
            {caseData.sources.map((source, idx) => (
              <div key={idx} className="source">
                <p>"{source.intake.rawText}"</p>
                <small>
                  {new Date(source.intake.createdAt).toLocaleDateString('zh-CN')} · 已脱敏文本
                </small>
              </div>
            ))}
          </div>
        </div>

        {/* 右侧: Activity + AI 建议 */}
        <div className="detail-card">
          <div className="detail-section">
            <h3>Activity</h3>
            <div className="timeline">
              {caseData.actions.map((action, idx) => (
                <div key={idx} className="event">
                  <span className="event-dot"></span>
                  <div>
                    <b>
                      {action.action === 'STATUS_CHANGE'
                        ? '状态变更'
                        : action.action === 'ASSIGN'
                        ? '负责人调整'
                        : '操作'}
                    </b>
                    <small>
                      {new Date(action.createdAt).toLocaleString('zh-CN', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </small>
                    {action.fromValue && action.toValue && (
                      <p>
                        {action.fromValue} → {action.toValue}
                      </p>
                    )}
                    {action.note && <p>{action.note}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="detail-section">
            <h3>AI 建议</h3>
            <div className="privacy-note">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 3l2.1 4.8L19 10l-4.9 2.2L12 17l-2.1-4.8L5 10l4.9-2.2z" />
              </svg>
              <span>
                建议确认具体故障楼层；由于已存在多次反馈,处理完成后可观察是否再次发生。
              </span>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
