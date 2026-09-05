// 演示虚拟登录（仅前端本机会话，无后端鉴权）
// 目的：演示与走查时提供完整的登录/退出体验。账号密码为系统内置演示凭据，
// 不校验真实身份、不产生服务端会话；不要在此之上叠加真实权限逻辑。

export const DEMO_LOGIN = {
  account: 'onecase',
  password: 'onecase2026',
} as const

export const DEMO_USER = {
  name: '李老师',
  role: '社区工作人员',
} as const

export const SESSION_STORAGE_KEY = 'oc_demo_session'

export interface DemoSession {
  account: string
  name: string
  role: string
  /** ISO 时间字符串 */
  loginAt: string
}

export function verifyDemoLogin(account: string, password: string): boolean {
  return account.trim() === DEMO_LOGIN.account && password === DEMO_LOGIN.password
}

export function writeDemoSession(account: string): DemoSession | null {
  // 守卫存档介质而非 window: SSR (node) 下 localStorage 未定义,浏览器端始终可用
  if (typeof localStorage === 'undefined') return null
  const session: DemoSession = {
    account: account.trim() || DEMO_LOGIN.account,
    name: DEMO_USER.name,
    role: DEMO_USER.role,
    loginAt: new Date().toISOString(),
  }
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session))
  return session
}

export function readDemoSession(): DemoSession | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<DemoSession>
    if (
      typeof parsed.account !== 'string' ||
      typeof parsed.name !== 'string' ||
      typeof parsed.role !== 'string' ||
      typeof parsed.loginAt !== 'string'
    ) {
      return null
    }
    return parsed as DemoSession
  } catch {
    return null
  }
}

export function clearDemoSession(): void {
  if (typeof localStorage === 'undefined') return
  localStorage.removeItem(SESSION_STORAGE_KEY)
}
