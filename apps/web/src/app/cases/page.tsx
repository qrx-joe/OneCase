// app/cases/page.tsx
// 全部事项 - Case 列表页 (真实数据)
// 支持 URL 参数初始化筛选 (S1-T4: 顶栏搜索/通知铃铛跳转目标):
//   ?q=关键词  ?status=OPEN|IN_PROGRESS  ?stalled=7 (超N天未更新)
'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { AppLayout } from '@/components/AppLayout'
import { Button, Badge } from '@/components'
import { CATEGORY_LABELS } from '@/lib/category-labels'

interface CaseRow {
  id: string
  caseNumber: string
  title: string
  priority: string
  status: string
  categoryCode?: string | null
  locationText?: string | null
  createdAt: string
  updatedAt: string
}

const STATUS_BADGES: Record<string, { label: string; variant: 'blue' | 'orange' | 'green' | 'gray' }> = {
  OPEN: { label: '待处理', variant: 'blue' },
  IN_PROGRESS: { label: '处理中', variant: 'orange' },
  WAITING: { label: '等待物业/街道', variant: 'gray' },
  RESOLVED: { label: '已解决', variant: 'green' },
  CLOSED: { label: '已关闭', variant: 'gray' },
  CANCELED: { label: '已取消', variant: 'gray' },
}

function CasesView() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const statusFilter = searchParams.get('status') || ''
  const stalledDays = Number(searchParams.get('stalled')) || 0

  const [cases, setCases] = useState<CaseRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '')

  // 顶栏搜索在已停留在 /cases 时只变更查询参数 (组件不重挂载),
  // 用 effect 同步 URL q → 页内搜索框,保证两处状态一致;前进/后退同样生效
  useEffect(() => {
    setSearchQuery(searchParams.get('q') || '')
  }, [searchParams])

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

  const stalledBefore = useMemo(
    () => Date.now() - stalledDays * 24 * 60 * 60 * 1000,
    [stalledDays]
  )

  const filtered = cases.filter((c) => {
    if (statusFilter && c.status !== statusFilter) return false
    if (stalledDays > 0 && new Date(c.updatedAt).getTime() > stalledBefore) return false

    const q = searchQuery.trim().toLowerCase()
    if (!q) return true
    return (
      c.title.toLowerCase().includes(q) ||
      c.caseNumber.toLowerCase().includes(q) ||
      (c.locationText || '').toLowerCase().includes(q) ||
      (c.categoryCode ? (CATEGORY_LABELS[c.categoryCode] || c.categoryCode).toLowerCase().includes(q) : false)
    )
  })

  const hasUrlFilter = Boolean(statusFilter || stalledDays > 0 || searchParams.get('q'))
  const filterChips: Array<{ label: string }> = []
  if (statusFilter) {
    filterChips.push({ label: `状态：${STATUS_BADGES[statusFilter]?.label || statusFilter}` })
  }
  if (stalledDays > 0) {
    filterChips.push({ label: `超过 ${stalledDays} 天未更新` })
  }

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
            aria-label="搜索事项"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <Link href="/cases/new">
            <Button variant="secondary">+ 手动创建</Button>
          </Link>
        </div>
      </div>

      {hasUrlFilter && (
        <div className="filter-row" style={{ marginBottom: 12 }}>
          {filterChips.map((chip) => (
            <span key={chip.label} className="chip active" aria-label="当前筛选">
              {chip.label}
            </span>
          ))}
          <button
            className="chip"
            onClick={() => {
              setSearchQuery('')
              router.replace('/cases')
            }}
          >
            清除筛选 ×
          </button>
        </div>
      )}

      <div className="work-card">
        {filtered.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center' }}>
            <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 12 }}>
              {cases.length === 0 ? '暂无事项' : '没有符合筛选条件的事项'}
            </p>
            {cases.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearchQuery('')
                  if (hasUrlFilter) router.replace('/cases')
                }}
              >
                清除筛选
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
                    <td data-label="编号" style={{ fontFamily: 'monospace', fontSize: 10 }}>{c.caseNumber}</td>
                    <td>
                      <div className="case-title">{c.title}</div>
                      <div className="case-sub">
                        {new Date(c.createdAt).toLocaleDateString('zh-CN')}
                      </div>
                    </td>
                    <td data-label="类别">
                      {c.categoryCode ? CATEGORY_LABELS[c.categoryCode] || c.categoryCode : '-'}
                    </td>
                    <td data-label="地点">{c.locationText || '-'}</td>
                    <td data-label="优先级">
                      <span className={`priority ${c.priority.toLowerCase()}`}>{c.priority}</span>
                    </td>
                    <td data-label="状态">
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

export default function CasesPage() {
  return (
    <Suspense
      fallback={
        <AppLayout title="全部事项">
          <div />
        </AppLayout>
      }
    >
      <CasesView />
    </Suspense>
  )
}
