import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  DEMO_LOGIN,
  DEMO_USER,
  SESSION_STORAGE_KEY,
  verifyDemoLogin,
  writeDemoSession,
  readDemoSession,
  clearDemoSession,
} from '../demo-auth'

// node 环境下模拟 localStorage (lib 内部以 typeof window 守卫)
function stubLocalStorage() {
  const store = new Map<string, string>()
  ;(globalThis as Record<string, unknown>).localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  }
  return store
}

describe('verifyDemoLogin', () => {
  it('内置演示凭据通过,账号首尾空白可容忍', () => {
    expect(verifyDemoLogin(DEMO_LOGIN.account, DEMO_LOGIN.password)).toBe(true)
    expect(verifyDemoLogin(`  ${DEMO_LOGIN.account}  `, DEMO_LOGIN.password)).toBe(true)
  })

  it('错账号/错密码/空输入一律拒绝', () => {
    expect(verifyDemoLogin('admin', DEMO_LOGIN.password)).toBe(false)
    expect(verifyDemoLogin(DEMO_LOGIN.account, '123456')).toBe(false)
    expect(verifyDemoLogin('', '')).toBe(false)
  })
})

describe('会话存取', () => {
  beforeEach(() => {
    stubLocalStorage()
  })

  afterEach(() => {
    delete (globalThis as Record<string, unknown>).localStorage
  })

  it('写入后可读回,字段齐全', () => {
    writeDemoSession(DEMO_LOGIN.account)
    const session = readDemoSession()
    expect(session).toEqual({
      account: DEMO_LOGIN.account,
      name: DEMO_USER.name,
      role: DEMO_USER.role,
      loginAt: expect.any(String),
    })
  })

  it('清除后读不到', () => {
    writeDemoSession(DEMO_LOGIN.account)
    clearDemoSession()
    expect(readDemoSession()).toBeNull()
  })

  it('损坏的 JSON 或缺字段的会话视为未登录,不抛错', () => {
    localStorage.setItem(SESSION_STORAGE_KEY, '{broken json')
    expect(readDemoSession()).toBeNull()

    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ account: 'x' }))
    expect(readDemoSession()).toBeNull()
  })

  it('无 localStorage 环境 (SSR) 下读写均为安全空操作', () => {
    delete (globalThis as Record<string, unknown>).localStorage
    expect(writeDemoSession(DEMO_LOGIN.account)).toBeNull()
    expect(readDemoSession()).toBeNull()
    expect(() => clearDemoSession()).not.toThrow()
  })
})
