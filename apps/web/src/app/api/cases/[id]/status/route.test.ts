// 状态迁移 API 回归测试 (R1: 乐观锁必须落实到数据库写入)
// 使用有状态 Prisma 替身复现并发场景: 两个请求读到同版本,条件更新 (CAS) 只允许一个成功
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// 供 vi.mock 工厂延迟取用当前测试的替身
const holder = vi.hoisted(() => ({ prisma: undefined as unknown }))
vi.mock('@/lib/prisma', () => ({
  get prisma() {
    return holder.prisma
  },
}))

import { POST } from './route'

const CASE_ID = 'case-1'

// 有状态替身: 模拟 SQLite 单写者串行语义
// - findFirst/findUnique 读当前 state
// - updateMany 仅当 where.version === state.version 时成功并递增 (CAS)
function createPrismaStub(initial: { status: string; version: number }) {
  const state = { ...initial }
  const calls = {
    updateMany: [] as { id: string; version: number }[],
    caseActionCreate: [] as Record<string, unknown>[],
  }

  const tx = {
    case: {
      findFirst: vi.fn(
        async (): Promise<{ id: string; caseNumber: string; status: string; version: number } | null> => ({
          id: CASE_ID,
          caseNumber: 'C-2026-001',
          status: state.status,
          version: state.version,
        })
      ),
      findUnique: vi.fn(async () => ({
        id: CASE_ID,
        caseNumber: 'C-2026-001',
        status: state.status,
        version: state.version,
      })),
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string; version: number }
          data: { status: string; version: { increment: number } }
        }) => {
          calls.updateMany.push(where)
          if (where.version === state.version) {
            state.status = data.status
            state.version += data.version.increment
            return { count: 1 }
          }
          return { count: 0 }
        }
      ),
    },
    caseAction: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        calls.caseActionCreate.push(data)
        return data
      }),
    },
  }

  const prisma = {
    $transaction: <T>(fn: (tx: unknown) => Promise<T>) => fn(tx),
  }

  return { prisma, tx, calls, state }
}

async function postStatus(expectedVersion: number, newStatus: string) {
  const request = new NextRequest(`http://localhost/api/cases/${CASE_ID}/status`, {
    method: 'POST',
    body: JSON.stringify({ status: newStatus, expectedVersion, userId: 'demo-user' }),
  })
  const response = await POST(request, { params: Promise.resolve({ id: CASE_ID }) })
  return { status: response.status, data: await response.json() }
}

describe('POST /api/cases/[id]/status (R1 乐观锁落实到写入)', () => {
  let stub: ReturnType<typeof createPrismaStub>

  beforeEach(() => {
    stub = createPrismaStub({ status: 'OPEN', version: 1 })
    holder.prisma = stub.prisma
  })

  it('同版本并发更新: 只允许一个成功 (200),另一个 409', async () => {
    const [resA, resB] = await Promise.all([
      postStatus(1, 'CANCELED'),
      postStatus(1, 'IN_PROGRESS'),
    ])

    const statuses = [resA.status, resB.status].sort()
    expect(statuses).toEqual([200, 409])

    // 成功方返回递增后的真实版本;失败方返回当前版本引导刷新
    const ok = resA.status === 200 ? resA : resB
    const conflict = resA.status === 409 ? resA : resB
    expect(ok.data.data.version).toBe(2)
    expect(conflict.data.error).toBe('CASE_VERSION_CONFLICT')
    expect(conflict.data.currentVersion).toBe(2)

    // 两次条件更新都带 id + version 条件 (CAS 落到写入)
    expect(stub.calls.updateMany).toHaveLength(2)
    for (const where of stub.calls.updateMany) {
      expect(where).toMatchObject({ id: CASE_ID, version: 1 })
    }
  })

  it('并发冲突后: 版本只增加 1,成功审计只有 1 条,fromValue 为真实旧状态', async () => {
    await Promise.all([postStatus(1, 'CANCELED'), postStatus(1, 'IN_PROGRESS')])

    expect(stub.state.version).toBe(2) // 只增加 1
    expect(stub.calls.updateMany).toHaveLength(2)
    for (const where of stub.calls.updateMany) {
      expect(where).toMatchObject({ id: CASE_ID, version: 1 })
    }
    expect(stub.calls.caseActionCreate).toHaveLength(1)
    expect(stub.calls.caseActionCreate[0]).toMatchObject({
      caseId: CASE_ID,
      action: 'STATUS_CHANGE',
      fromValue: 'OPEN',
    })
  })

  it('版本过期 (expectedVersion 落后) → 409 且不写审计', async () => {
    const { status, data } = await postStatus(0, 'IN_PROGRESS')

    expect(status).toBe(409)
    expect(data.error).toBe('CASE_VERSION_CONFLICT')
    expect(stub.calls.caseActionCreate).toHaveLength(0)
    expect(stub.state.version).toBe(1) // 状态未被改变
  })

  it('非法迁移 → 422,不执行条件更新、不写审计', async () => {
    const { status, data } = await postStatus(1, 'CLOSED') // OPEN → CLOSED 非法

    expect(status).toBe(422)
    expect(data.error).toBe('ILLEGAL_STATUS_TRANSITION')
    expect(stub.calls.updateMany).toHaveLength(0)
    expect(stub.calls.caseActionCreate).toHaveLength(0)
  })

  it('事项不存在 → 404', async () => {
    stub.tx.case.findFirst.mockResolvedValue(null)

    const { status, data } = await postStatus(1, 'IN_PROGRESS')

    expect(status).toBe(404)
    expect(data.error).toBe('CASE_NOT_FOUND')
  })

  it('合法顺序迁移: 200、version+1、审计 fromValue/toValue 正确', async () => {
    const { status, data } = await postStatus(1, 'IN_PROGRESS')

    expect(status).toBe(200)
    expect(data.data).toMatchObject({
      id: CASE_ID,
      caseNumber: 'C-2026-001',
      status: 'IN_PROGRESS',
      version: 2,
    })
    expect(stub.calls.caseActionCreate).toHaveLength(1)
    expect(stub.calls.caseActionCreate[0]).toMatchObject({ fromValue: 'OPEN', toValue: 'IN_PROGRESS' })
  })
})
