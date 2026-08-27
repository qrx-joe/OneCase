// app/page.tsx
// 今日工作 - Dashboard
'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { AppLayout } from '@/components/AppLayout'
import { Button, Badge } from '@/components'

interface Case {
  id: string
  caseNumber: string
  title: string
  priority: string
  status: string
  categoryCode?: string
  updatedAt: string
}

export default function HomePage() {
  const [cases, setCases] = useState<Case[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'p2' | 'open' | 'progress'>('all')
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    // TODO: 从 API 加载
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
          updatedAt: '2小时前',
        },
        {
          id: '2',
          caseNumber: 'CASE-016',
          title: '5栋电梯运行异常',
          priority: 'P2',
          status: 'IN_PROGRESS',
          categoryCode: 'PUBLIC_FACILITIES',
          updatedAt: '5小时前',
        },
        {
          id: '3',
          caseNumber: 'CASE-021',
          title: '西门口垃圾未及时清运',
          priority: 'P3',
          status: 'OPEN',
          categoryCode: 'ENVIRONMENT',
          updatedAt: '1天前',
        },
        {
          id: '4',
          caseNumber: 'CASE-024',
          title: '中心广场夜间噪音反馈',
          priority: 'P3',
          status: 'OPEN',
          categoryCode: 'NOISE',
          updatedAt: '2天前',
        },
      ])
      setLoading(false)
    }, 500)
  }, [])

  const filteredCases = cases.filter((c) => {
    const matchesFilter =
      filter === 'all' ||
      (filter === 'p2' && (c.priority === 'P1' || c.priority === 'P2')) ||
      (filter === 'open' && c.status === 'OPEN') ||
      (filter === 'progress' && c.status === 'IN_PROGRESS')

    const matchesSearch =
      !searchQuery ||
      c.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.caseNumber.toLowerCase().includes(searchQuery.toLowerCase())

    return matchesFilter && matchesSearch
  })

  const kpis = [
    {
      label: '待处理',
      value: cases.filter((c) => c.status === 'OPEN').length,
      sub: '其中 4 条待人工确认',
      icon: 'clipboard',
      color: 'blue',
    },
    {
      label: '高优先级',
      value: cases.filter((c) => c.priority === 'P1' || c.priority === 'P2').length,
      sub: 'P1 / P2 未解决事项',
      icon: 'alert',
      color: 'red',
    },
    {
      label: '处理中',
      value: cases.filter((c) => c.status === 'IN_PROGRESS').length,
      sub: '2 条超过 48 小时',
      icon: 'clock',
      color: 'orange',
    },
    {
      label: '本周解决',
      value: 27,
      sub: 'Demo 数据 · 仅示意',
      icon: 'check',
      color: 'green',
    },
  ]

  const insights = [
    { title: '楼道照明', count: 6, location: '主要集中在 3 栋、5 栋', percent: 78 },
    { title: '垃圾清运', count: 4, location: '西门口附近重复出现', percent: 54 },
    { title: '电梯故障', count: 3, location: '5 栋本周重复报告', percent: 42, critical: true },
  ]

  return (
    <AppLayout title="今日工作">
      <div className="page-head">
        <div>
          <h2>今日工作</h2>
          <p>优先处理高风险事项,再清理待确认信息。</p>
        </div>
        <div className="actions">
          <Link href="/intake">
            <Button variant="primary">+ 新建 Intake</Button>
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
              <span className="meta">按优先级与更新时间排序</span>
            </div>
            <Button variant="ghost" size="sm">
              查看全部
            </Button>
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
              {filteredCases.map((c) => (
                <tr key={c.id}>
                  <td>
                    <span className={`priority ${c.priority.toLowerCase()}`}>
                      {c.priority}
                    </span>
                  </td>
                  <td>
                    <div className="case-title">{c.title}</div>
                    <div className="case-sub">
                      {c.caseNumber} · {c.updatedAt}
                    </div>
                  </td>
                  <td>{c.categoryCode || '-'}</td>
                  <td>
                    <Badge
                      variant={
                        c.status === 'OPEN'
                          ? 'blue'
                          : c.status === 'IN_PROGRESS'
                          ? 'orange'
                          : 'gray'
                      }
                    >
                      {c.status === 'OPEN'
                        ? '待处理'
                        : c.status === 'IN_PROGRESS'
                        ? '处理中'
                        : c.status}
                    </Badge>
                  </td>
                  <td>
                    <Link href={`/cases/${c.id}`}>
                      <button className="row-action">···</button>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Insights */}
        <div className="work-card">
          <div className="card-head">
            <div>
              <h3>近期高频问题</h3>
              <span className="meta">Demo 数据</span>
            </div>
          </div>
          <div className="insight-list">
            {insights.map((insight, idx) => (
              <div key={idx} className="insight">
                <div className="insight-top">
                  <b>{insight.title}</b>
                  <Badge variant={insight.critical ? 'red' : 'orange'}>
                    {insight.count} 次
                  </Badge>
                </div>
                <small>{insight.location}</small>
                <div className="bar">
                  <span
                    style={{
                      width: `${insight.percent}%`,
                      background: insight.critical ? 'var(--oc-red)' : undefined,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
