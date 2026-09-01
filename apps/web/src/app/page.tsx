// app/page.tsx
// 今日工作 - Dashboard (真实数据: /api/dashboard + /api/cases)
'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { AppLayout } from '@/components/AppLayout'
import { Button, Badge } from '@/components'

interface CaseRow {
  id: string
  caseNumber: string
  title: string
  priority: string
  status: string
  categoryCode?: string | null
  locationText?: string | null
  updatedAt: string
}

interface DashboardData {
  kpis: {
    open: number
    highPriority: number
    inProgress: number
    resolvedThisWeek: number
  }
  topCategories: Array<{ code: string; name: string; count: number }>
  meta: { demoMode: boolean; note: string }
}

const STATUS_BADGES: Record<string, { label: string; variant: 'blue' | 'orange' | 'green' | 'gray' }> = {
  OPEN: { label: '待处理', variant: 'blue' },
  IN_PROGRESS: { label: '处理中', variant: 'orange' },
  WAITING: { label: '等待物业/街道', variant: 'gray' },
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

export default function HomePage() {
  const [cases, setCases] = useState<CaseRow[]>([])
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'p2' | 'open' | 'progress'>('all')
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    async function load() {
      try {
        const [casesRes, dashRes] = await Promise.all([
          fetch('/api/cases'),
          fetch('/api/dashboard'),
        ])
        const casesData = await casesRes.json()
        const dashData = await dashRes.json()

        if (!casesRes.ok) {
          setError(casesData.error || '加载事项失败')
          return
        }
        setCases(casesData.data || [])
        if (dashRes.ok && dashData.data) {
          setDashboard(dashData.data)
        }
      } catch (e) {
        console.error('Load home failed:', e)
        setError('网络错误,请刷新重试')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const filteredCases = cases.filter((c) => {
    const matchesFilter =
      filter === 'all' ||
      (filter === 'p2' && (c.priority === 'P1' || c.priority === 'P2')) ||
      (filter === 'open' && c.status === 'OPEN') ||
      (filter === 'progress' && c.status === 'IN_PROGRESS')

    const q = searchQuery.trim().toLowerCase()
    const matchesSearch =
      !q ||
      c.title.toLowerCase().includes(q) ||
      c.caseNumber.toLowerCase().includes(q) ||
      (c.locationText || '').toLowerCase().includes(q)

    return matchesFilter && matchesSearch
  })

  if (loading) {
    return (
      <AppLayout title="今日工作">
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
          <span className="spinner" style={{ display: 'inline-block', marginRight: 8 }}></span>
          正在加载今日工作...
        </div>
      </AppLayout>
    )
  }

  if (error) {
    return (
      <AppLayout title="今日工作">
        <div style={{ padding: 60, textAlign: 'center' }}>
          <p style={{ color: 'var(--oc-red)', fontSize: 14, marginBottom: 16 }}>{error}</p>
          <Button variant="secondary" onClick={() => window.location.reload()}>
            刷新重试
          </Button>
        </div>
      </AppLayout>
    )
  }

  const k = dashboard?.kpis

  const kpis = [
    { label: '待处理', value: k?.open ?? '—', sub: '未分派的已确认事项', icon: 'clipboard', color: 'blue' },
    { label: '高优先级', value: k?.highPriority ?? '—', sub: 'P1 / P2 未解决事项', icon: 'alert', color: 'red' },
    { label: '处理中', value: k?.inProgress ?? '—', sub: '正在跟进的事项', icon: 'clock', color: 'orange' },
    { label: '本周解决', value: k?.resolvedThisWeek ?? '—', sub: 'Demo 数据 · 仅示意', icon: 'check', color: 'green' },
  ]

  // 高频类别条形图宽度按最大次数归一
  const maxCatCount = Math.max(1, ...(dashboard?.topCategories || []).map((c) => c.count))

  return (
    <AppLayout title="今日工作">
      <div className="page-head">
        <div>
          <h2>今日工作</h2>
          <p>优先处理高风险事项，再清理待确认信息。</p>
        </div>
        <div className="actions">
          <Link href="/intake">
            <Button variant="primary">+ 居民来件</Button>
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="kpi-grid">
        {kpis.map((kpi, idx) => (
          <div key={idx} className="kpi">
            <div className="kpi-top">
              <span className="kpi-label">{kpi.label}</span>
              <span className={`kpi-icon ${kpi.color}`}>
                {kpi.icon === 'clipboard' && (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M5 4h14v16H5z" />
                    <path d="M8 9h8M8 13h6" />
                  </svg>
                )}
                {kpi.icon === 'alert' && (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 3l9 16H3z" />
                    <path d="M12 9v4M12 17h.01" />
                  </svg>
                )}
                {kpi.icon === 'clock' && (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 7v5l3 2" />
                  </svg>
                )}
                {kpi.icon === 'check' && (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M5 12l4 4L19 6" />
                  </svg>
                )}
              </span>
            </div>
            <div className="kpi-value">{kpi.value}</div>
            <div className="kpi-sub">{kpi.sub}</div>
          </div>
        ))}
      </div>

      {/* Work grid */}
      <div className="work-grid">
        {/* Case list */}
        <div className="work-card">
          <div className="card-head">
            <div>
              <h3>最近事项</h3>
              <span className="meta">
                {filteredCases.length} / {cases.length} 项 · 按创建时间排序
              </span>
            </div>
          </div>

          <div className="filter-row">
            {[
              { key: 'all', label: '全部' },
              { key: 'p2', label: 'P1/P2' },
              { key: 'open', label: '待处理' },
              { key: 'progress', label: '处理中' },
            ].map((f) => (
              <button
                key={f.key}
                className={`chip ${filter === f.key ? 'active' : ''}`}
                onClick={() => setFilter(f.key as any)}
              >
                {f.label}
              </button>
            ))}
          </div>

          {filteredCases.length === 0 ? (
            <div style={{ padding: '36px 15px', textAlign: 'center' }}>
              <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 12 }}>
                {cases.length === 0 ? '暂无事项，从居民来件开始' : '没有符合筛选条件的事项'}
              </p>
              {cases.length > 0 && (
                <Button variant="ghost" size="sm" onClick={() => { setFilter('all'); setSearchQuery('') }}>
                  清除筛选
                </Button>
              )}
            </div>
          ) : (
            <table className="case-table">
              <thead>
                <tr>
                  <th>优先级</th>
                  <th>事项</th>
                  <th>类别</th>
                  <th>状态</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredCases.map((c) => {
                  const badge = STATUS_BADGES[c.status] || { label: c.status, variant: 'gray' as const }
                  return (
                    <tr
                      key={c.id}
                      tabIndex={0}
                      aria-label={`${c.caseNumber} ${c.title}`}
                      onClick={() => (window.location.href = `/cases/${c.caseNumber}`)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          window.location.href = `/cases/${c.caseNumber}`
                        }
                      }}
                    >
                      <td data-label="优先级">
                        <span className={`priority ${c.priority.toLowerCase()}`}>{c.priority}</span>
                      </td>
                      <td>
                        <div className="case-title">{c.title}</div>
                        <div className="case-sub">
                          {c.caseNumber}
                          {c.locationText ? ` · ${c.locationText}` : ''}
                        </div>
                      </td>
                      <td data-label="类别">
                        {c.categoryCode ? CATEGORY_LABELS[c.categoryCode] || c.categoryCode : '-'}
                      </td>
                      <td data-label="状态">
                        <Badge variant={badge.variant}>{badge.label}</Badge>
                      </td>
                      <td className="cell-actions">
                        <button
                          className="row-action"
                          onClick={(e) => {
                            e.stopPropagation()
                            window.location.href = `/cases/${c.caseNumber}`
                          }}
                        >
                          ···
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Insights: 高频类别 (真实 groupBy 数据) */}
        <div className="work-card">
          <div className="card-head">
            <div>
              <h3>高频类别</h3>
              <span className="meta">活跃事项统计</span>
            </div>
          </div>
          {(dashboard?.topCategories || []).length === 0 ? (
            <div style={{ padding: '36px 15px', textAlign: 'center' }}>
              <p style={{ fontSize: 12, color: 'var(--text-3)' }}>暂无数据</p>
            </div>
          ) : (
            <div className="insight-list">
              {dashboard!.topCategories.map((cat) => (
                <div key={cat.code} className="insight">
                  <div className="insight-top">
                    <b>{cat.name}</b>
                    <Badge variant={cat.count >= 3 ? 'orange' : 'gray'}>{cat.count} 项</Badge>
                  </div>
                  <small>当前活跃事项中的高频类别</small>
                  <div className="bar">
                    <span style={{ width: `${(cat.count / maxCatCount) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="privacy-note" style={{ margin: 12, marginTop: 0 }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 3l2.1 4.8L19 10l-4.9 2.2L12 17l-2.1-4.8L5 10l4.9-2.2z" />
            </svg>
            <span>{dashboard?.meta?.note || 'Demo 数据 · 仅统计已确认事项'}</span>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
