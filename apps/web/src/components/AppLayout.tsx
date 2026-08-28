// components/AppLayout.tsx
// 统一的 App 布局 (侧边栏 + 顶栏 + 内容区)
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface AppLayoutProps {
  children: React.ReactNode
  title?: string
}

export function AppLayout({ children, title }: AppLayoutProps) {
  const pathname = usePathname()
  const [searchQuery, setSearchQuery] = useState('')

  const navItems = [
    {
      href: '/',
      label: '今日工作',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 11l9-8 9 8v9H3z" />
          <path d="M9 20v-6h6v6" />
        </svg>
      ),
    },
    {
      href: '/intake',
      label: '新建 Intake',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 5v14M5 12h14" />
        </svg>
      ),
    },
    {
      href: '/cases',
      label: '全部事项',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-4-4" />
        </svg>
      ),
    },
  ]

  return (
    <div className="app-shell">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="mark">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 4h14v16H5z" />
              <path d="M8 8h8M8 12h8M8 16h5" />
            </svg>
          </span>
          一件事 OneCase
        </div>

        <div className="sidebar-caption">工作</div>
        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`sidebar-item ${pathname === item.href ? 'active' : ''}`}
            >
              {item.icon}
              {item.label}
              {item.count !== undefined && (
                <span className="nav-count">{item.count}</span>
              )}
            </Link>
          ))}
        </nav>

        {/* 管理: 数据概览/设置页面未实现,Phase 4 后续补充时恢复
        <div className="sidebar-caption">管理</div> */}

        <div className="sidebar-bottom">
          <div className="user-card">
            <span className="avatar">李</span>
            <div>
              <strong>李老师</strong>
              <small>社区工作人员</small>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="app-main">
        <header className="app-topbar">
          <div className="app-title">{title || 'OneCase'}</div>
          <div className="search-box">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-4-4" />
            </svg>
            <input
              type="text"
              placeholder="搜索事项、地点、编号…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <button className="icon-btn" title="通知">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 8a6 6 0 10-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
              <path d="M10 21h4" />
            </svg>
          </button>
        </header>

        <div className="app-content">{children}</div>
      </main>
    </div>
  )
}
