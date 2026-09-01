// app/cases/page.tsx
// 全部事项 - Case 列表页 (真实数据)
'use client'

import { useEffect, useState } from 'react'
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
  createdAt: string
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

export default function CasesPage() {
  const [cases, setCases] = useState<CaseRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/cases')
        const data = await res.json()
        if (!res.ok) {
          setError(data.error || '加载失败')
          return
        }
        setCases(data.data || [])
      } catch (e) {
        console.error('Load cases failed:', e)
        setError('网络错误,请刷新重试')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const filtered = cases.filter((c) => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return true
    return (
      c.title.toLowerCase().includes(q) ||
      c.caseNumber.toLowerCase().includes(q) ||
      (c.locationText || '').toLowerCase().includes(q) ||
      (c.categoryCode ? (CATEGORY_LABELS[c.categoryCode] || c.categoryCode).toLowerCase().includes(q) : false)
    )
  })

  if (loading) {
    return (
      <AppLayout title="全部事项">
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
          <span className="spinner" style={{ display: 'inline-block', marginRight: 8 }}></span>
          正在加载事项列表...
        </div>
      </AppLayout>
    )
  }

  if (error) {
    return (
      <AppLayout title="全部事项">
        <div style={{ padding: 60, textAlign: 'center' }}>
          <p style={{ color: 'var(--oc-red)', fontSize: 14, marginBottom: 16 }}>{error}</p>
          <Button variant="secondary" onClick={() => window.location.reload()}>
            刷新重试
          </Button>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout title="全部事项">
      <div className="page-head">
        <div>
          <h2>全部事项</h2>
          <p>
            {filtered.length} / {cases.length} 项 · 活跃事项 (不含已关闭/已取消)
          </p>
        </div>
        <div className="actions">
          <input
            type="text"
            className="field"
            style={{ width: 240 }}
            placeholder="搜索编号、标题、地点、类别..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <Link href="/cases/new">
            <Button variant="secondary">+ 手动创建</Button>
          </Link>
        </div>
      </div>

      <div className="work-card">
        {filtered.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center' }}>
            <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 12 }}>
              {cases.length === 0 ? '暂无事项' : '没有符合搜索条件的事项'}
            </p>
            {cases.length > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setSearchQuery('')}>
                清除搜索
              </Button>
            )}
          </div>
        ) : (
          <table className="case-table">
            <thead>
              <tr>
                <th>编号</th>
                <th>事项</th>
                <th>类别</th>
                <th>地点</th>
                <th>优先级</th>
                <th>状态</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const badge = STATUS_BADGES[c.status] || { label: c.status, variant: 'gray' as const }
                return (
                  <tr
                    key={c.id}
                    onClick={() => (window.location.href = `/cases/${c.caseNumber}`)}
                  >
                    <td style={{ fontFamily: 'monospace', fontSize: 10 }}>{c.caseNumber}</td>
                    <td>
                      <div className="case-title">{c.title}</div>
                      <div className="case-sub">
                        {new Date(c.createdAt).toLocaleDateString('zh-CN')}
                      </div>
                    </td>
                    <td>
                      {c.categoryCode ? CATEGORY_LABELS[c.categoryCode] || c.categoryCode : '-'}
                    </td>
                    <td>{c.locationText || '-'}</td>
                    <td>
                      <span className={`priority ${c.priority.toLowerCase()}`}>{c.priority}</span>
                    </td>
                    <td>
                      <Badge variant={badge.variant}>{badge.label}</Badge>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </AppLayout>
  )
}
