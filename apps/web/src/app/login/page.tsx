// app/login/page.tsx
// 演示虚拟登录页：账号密码为内置演示凭据（lib/demo-auth.ts），仅写入本机会话，
// 无后端鉴权。用于演示与走查时呈现完整的登录/退出体验。
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  DEMO_LOGIN,
  readDemoSession,
  verifyDemoLogin,
  writeDemoSession,
} from '@/lib/demo-auth'

export default function LoginPage() {
  const router = useRouter()
  const [account, setAccount] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  // 已有本机会话时直接进工作台（含登录后回退到 /login 的场景）
  useEffect(() => {
    if (readDemoSession()) router.replace('/')
  }, [router])

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!account.trim() || !password) {
      setError('请输入账号和密码')
      return
    }
    if (!verifyDemoLogin(account, password)) {
      setError('账号或密码不正确')
      return
    }
    writeDemoSession(account)
    router.replace('/')
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-[#F6F7FB] px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-6">
          <span className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#6D6AEF] to-[#B36DE8] text-white grid place-items-center shadow-sm">
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 4h14v16H5z" />
              <path d="M8 8h8M8 12h8M8 16h5" />
            </svg>
          </span>
          <h1 className="mt-3 text-lg font-bold tracking-tight text-gray-900">一件事 OneCase</h1>
          <p className="mt-0.5 text-xs text-gray-500">社区事项 AI 工作台</p>
        </div>

        <form onSubmit={submit} className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          <div className="mb-4">
            <label className="field-label" htmlFor="account">
              账号
            </label>
            <input
              id="account"
              type="text"
              autoComplete="username"
              className="field"
              placeholder="请输入账号"
              value={account}
              onChange={(e) => {
                setAccount(e.target.value)
                if (error) setError(null)
              }}
            />
          </div>
          <div className="mb-5">
            <label className="field-label" htmlFor="password">
              密码
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              className="field"
              placeholder="请输入密码"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                if (error) setError(null)
              }}
            />
          </div>
          {error && (
            <p className="mb-4 text-xs text-red-600" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="btn btn-primary w-full">
            登 录
          </button>
        </form>

        <p className="mt-4 text-center text-[11px] text-gray-400">
          演示环境 · 账号 {DEMO_LOGIN.account} · 密码 {DEMO_LOGIN.password}
        </p>
      </div>
    </main>
  )
}
