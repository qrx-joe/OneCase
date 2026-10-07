// 真实 SQLite + 四个独立 Node/Prisma 进程;直接调用实际 API,不用数据库替身。
// 每次使用 workspace/tmp 下独立库,强制 Mock,结束后仅清理本次创建的目录。
import assert from 'node:assert/strict'
import { execFileSync, fork, type ChildProcess } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { NextRequest } from 'next/server'
import type { ConfirmIntakeParams } from '../src/lib/confirm-intake-service'

type Job = { op: 'manual' | 'confirm' | 'status' | 'intake'; id?: string; body: Record<string, unknown> }
type Reply = { status: number; body: any }
const webRoot = fileURLToPath(new URL('../', import.meta.url))
const tmpRoot = fileURLToPath(new URL('../../../tmp/', import.meta.url))
const workerMode = process.argv.includes('--worker')
const require = createRequire(import.meta.url)

process.env.AI_PROVIDER = 'mock'
for (const key of ['QWEN_API_KEY', 'OPENAI_API_KEY', 'STEPFUN_API_KEY']) process.env[key] = ''

async function loadApp() {
  const { prisma } = await import('../src/lib/prisma')
  const { POST: manual } = await import('../src/app/api/cases/route')
  const { POST: intake } = await import('../src/app/api/intakes/route')
  const { POST: confirm } = await import('../src/app/api/intakes/[id]/confirm/route')
  const { POST: status } = await import('../src/app/api/cases/[id]/status/route')
  const { confirmIntake } = await import('../src/lib/confirm-intake-service')
  async function execute(job: Job): Promise<Reply> {
    const request = new NextRequest('http://localhost/api/concurrency-test', {
      method: 'POST', body: JSON.stringify(job.body),
    })
    const params = { params: Promise.resolve({ id: job.id! }) }
    const response = job.op === 'intake' ? await intake(request) : job.op === 'manual' ? await manual(request)
      : job.op === 'confirm' ? await confirm(request, params) : await status(request, params)
    return { status: response.status, body: await response.json() }
  }
  return { prisma, execute, confirmIntake }
}

async function runWorker() {
  // 子进程只能连接父进程明确指定的测试库,禁止误连环境里的演示库。
  const url = process.env.ONECASE_CONCURRENCY_DATABASE_URL
  assert.ok(url?.startsWith(`file:${tmpRoot.replaceAll('\\', '/')}concurrency-`))
  process.env.DATABASE_URL = url
  const app = await loadApp()
  await app.prisma.$connect()
  process.on('message', async (job: Job | 'close') => {
    if (job === 'close') {
      await app.prisma.$disconnect()
      process.disconnect()
      return
    }
    try {
      process.send?.(await app.execute(job))
    } catch (error) {
      process.send?.({ failure: error instanceof Error ? error.message : String(error) })
    }
  })
  process.send?.({ ready: true })
}

function receive(worker: ChildProcess): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(new Error('并发测试子进程超时')), 30000)
    const onMessage = (value: any) => finish(undefined, value)
    const onExit = (code: number | null) => finish(new Error(`并发测试子进程提前退出: ${code}`))
    const onError = (error: Error) => finish(error)
    function finish(error?: Error, value?: unknown) {
      clearTimeout(timer)
      worker.off('message', onMessage)
      worker.off('exit', onExit)
      worker.off('error', onError)
      if (error) reject(error)
      else resolve(value)
    }
    worker.once('message', onMessage)
    worker.once('exit', onExit)
    worker.once('error', onError)
  })
}

function hashFile(file: string) {
  return existsSync(file) ? createHash('sha256').update(readFileSync(file)).digest('hex') : null
}

async function runTests() {
  mkdirSync(tmpRoot, { recursive: true })
  const testDir = mkdtempSync(path.join(tmpRoot, 'concurrency-'))
  const dbFile = path.join(testDir, 'test.db')
  const demoFile = fileURLToPath(new URL('../../../packages/db/prisma/dev.db', import.meta.url))
  const demoHash = hashFile(demoFile)
  process.env.DATABASE_URL = `file:${dbFile.replaceAll('\\', '/')}`
  process.env.ONECASE_CONCURRENCY_DATABASE_URL = process.env.DATABASE_URL
  const workers: ChildProcess[] = []
  let app: Awaited<ReturnType<typeof loadApp>> | undefined
  let passed = 0
  let failed = 0
  async function scenario(name: string, fn: () => Promise<void>) {
    try {
      await fn()
      passed++
      console.log(`PASS ${name}`)
    } catch (error) {
      failed++
      console.error(`FAIL ${name}:`, error instanceof Error ? error.message : error)
    }
  }
  async function concurrent(jobs: Job[]): Promise<Reply[]> {
    assert.equal(jobs.length, workers.length)
    const pending = workers.map(receive)
    workers.forEach((worker, i) => worker.send(jobs[i]))
    const replies = await Promise.all(pending)
    for (const reply of replies) assert.ok(!reply.failure, reply.failure)
    return replies
  }
  try {
    // Prisma 5 Windows Schema Engine 需要目标文件已存在。
    writeFileSync(dbFile, '')
    execFileSync(process.execPath, [
      fileURLToPath(new URL('../../../packages/db/node_modules/prisma/build/index.js', import.meta.url)),
      'db', 'push', '--skip-generate', '--schema',
      fileURLToPath(new URL('../../../packages/db/prisma/schema.prisma', import.meta.url)),
    ], { env: process.env, stdio: 'pipe' })
    app = await loadApp()
    const { prisma, execute, confirmIntake } = app
    const org = await prisma.organization.create({ data: { name: '合成并发测试', slug: 'demo-community' } })
    async function analyzed(issueCount = 1): Promise<ConfirmIntakeParams> {
      const intake = await prisma.intake.create({ data: {
        organizationId: org.id, sourceType: 'text', rawText: '合成测试反馈', status: 'ANALYZED',
      } })
      const analysis = await prisma.intakeAnalysis.create({ data: {
        intakeId: intake.id, status: 'COMPLETED', provider: 'mock', modelVersion: 'mock-v1',
        promptVersion: 'v1', schemaVersion: 'v1',
      } })
      await prisma.intakeIssue.createMany({ data: Array.from({ length: issueCount }, (_, issueIndex) => ({
        analysisId: analysis.id, issueIndex, title: `合成草稿 ${issueIndex}`, impact: 'LOW',
        urgency: 'LOW', affectedGroups: '[]', riskSignals: '[]', missingInfo: '[]',
      })) })
      return { intakeId: intake.id, analysisId: analysis.id, issueDecisions: Array.from({ length: issueCount }, (_, issueIndex) => ({ issueIndex, decision: 'CREATE_CASE' })) }
    }
    const confirmJob = (params: ConfirmIntakeParams): Job => ({ op: 'confirm', id: params.intakeId, body: { analysisId: params.analysisId, issueDecisions: params.issueDecisions } })
    const manualJob = (title: string, sourceIntakeId?: string): Job => ({ op: 'manual', body: { title, organizationId: org.id, sourceIntakeId } })
    const statuses = (replies: Reply[]) => replies.map(r => r.status).sort((a, b) => a - b)

    for (let i = 0; i < 4; i++) {
      const worker = fork(fileURLToPath(import.meta.url), ['--worker'], {
        cwd: webRoot, env: process.env,
        execArgv: ['--import', pathToFileURL(require.resolve('tsx')).href],
        stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
      })
      workers.push(worker)
      // 正常业务拒绝无需整段堆栈;进程初始化错误仍保留供诊断。
      let stderr = ''
      worker.stderr?.on('data', chunk => { stderr = (stderr + String(chunk)).slice(-4000) })
      worker.on('exit', code => { if (code) console.error(stderr) })
    }
    assert.ok((await Promise.all(workers.map(receive))).every(r => r.ready))
    console.log('真实 SQLite,4 个独立进程,合成数据,模型调用 0 次')

    await scenario('同键文字保存跨进程竞争: 全部返回同一条原文,不同载荷返回 409', async () => {
      const body = { rawText: '合成反馈\n  保留原文  ', organizationId: org.id, idempotencyKey: 'synthetic-concurrent-intake' }
      const replies = await concurrent(Array.from({ length: 4 }, () => ({ op: 'intake', body })))
      assert.deepEqual(statuses(replies), [200, 200, 200, 200])
      const intake = await prisma.intake.findUniqueOrThrow({ where: { idempotencyKey: body.idempotencyKey } })
      assert.ok(replies.every(r => r.body.data.id === intake.id))
      assert.equal(intake.rawText, body.rawText)
      assert.equal(await prisma.intake.count({ where: { idempotencyKey: body.idempotencyKey } }), 1)
      const conflict = await execute({ op: 'intake', body: { ...body, rawText: '合成不同载荷' } })
      assert.equal(conflict.status, 409)
      assert.equal(conflict.body.error, 'IDEMPOTENCY_KEY_CONFLICT')
      assert.equal(conflict.body.data, undefined)
    })

    const caseData = await prisma.case.create({ data: {
      organizationId: org.id, caseNumber: 'LEGACY-STATUS', title: '合成状态测试', priority: 'P2', version: 1,
    } })
    await scenario('同版本跨进程竞争: 1 个 200 + 3 个 409,版本与审计只递增一次', async () => {
      const replies = await concurrent(Array.from({ length: 4 }, (_, i) => ({
        op: 'status', id: caseData.id, body: { expectedVersion: 1, status: i % 2 ? 'IN_PROGRESS' : 'CANCELED' },
      })))
      assert.deepEqual(statuses(replies), [200, 409, 409, 409])
      const saved = await prisma.case.findUniqueOrThrow({ where: { id: caseData.id } })
      assert.equal(saved.version, 2)
      const actions = await prisma.caseAction.findMany({ where: { caseId: saved.id } })
      assert.equal(actions.length, 1)
      assert.equal(actions[0].fromValue, 'OPEN')
      assert.equal(actions[0].toValue, saved.status)
      for (const reply of replies.filter(r => r.status === 409)) {
        assert.equal(reply.body.error, 'CASE_VERSION_CONFLICT')
        assert.equal(reply.body.currentVersion, 2)
      }
    })
    await scenario('当前版本的非法迁移仍返回 422,零额外写入', async () => {
      const saved = await prisma.case.findUniqueOrThrow({ where: { id: caseData.id } })
      const reply = await execute({ op: 'status', id: saved.id, body: { expectedVersion: saved.version, status: saved.status } })
      assert.equal(reply.status, 422)
      assert.equal(await prisma.caseAction.count({ where: { caseId: saved.id } }), 1)
    })

    await prisma.case.createMany({ data: [1001, 1002, 1003].map(n => ({
      organizationId: org.id, caseNumber: `CASE-${n}`, title: '合成历史事项', priority: 'P2',
    })) })
    // 连同非标准历史编号共 4 行;删两行后 count()+1 将再次分配已有 CASE-1003。
    await prisma.case.deleteMany({ where: { caseNumber: { in: ['CASE-1001', 'CASE-1002'] } } })
    await scenario('历史删除后的并发新建全部成功,编号高于现有最大值', async () => {
      const replies = await concurrent(Array.from({ length: 4 }, (_, i) => manualJob(`合成新建 ${i}`)))
      assert.deepEqual(statuses(replies), [200, 200, 200, 200])
      const numbers = replies.map(r => r.body.data.caseNumber)
      assert.equal(new Set(numbers).size, 4)
      assert.ok(numbers.every(n => Number(n.slice(5)) > 1003))
      for (const r of replies) assert.equal(await prisma.caseAction.count({ where: { caseId: r.body.data.id, action: 'MANUAL_CREATE' } }), 1)
    })
    await scenario('删除最新事项后,数据库持久序列不复用旧编号', async () => {
      const cases = await prisma.case.findMany({ where: { caseNumber: { startsWith: 'CASE-' } } })
      const latest = cases.reduce((a, b) => Number(a.caseNumber.slice(5)) > Number(b.caseNumber.slice(5)) ? a : b)
      await prisma.case.delete({ where: { id: latest.id } })
      const reply = await execute(manualJob('合成删除后新建'))
      assert.equal(reply.status, 200)
      assert.ok(Number(reply.body.data.caseNumber.slice(5)) > Number(latest.caseNumber.slice(5)))
    })
    await scenario('两个确认与两个手动创建共享编号序列,多草稿各有来源与审计', async () => {
      const a = await analyzed(2)
      const b = await analyzed()
      const before = await prisma.case.count()
      const replies = await concurrent([confirmJob(a), manualJob('合成混合新建 A'), confirmJob(b), manualJob('合成混合新建 B')])
      assert.deepEqual(statuses(replies), [200, 200, 200, 200])
      assert.equal(await prisma.case.count(), before + 5)
      const numbers = replies.flatMap(r => r.body.data.createdCases?.map((c: any) => c.caseNumber) ?? [r.body.data.caseNumber])
      assert.equal(new Set(numbers).size, 5)
      for (const params of [a, b]) {
        assert.equal((await prisma.intake.findUniqueOrThrow({ where: { id: params.intakeId } })).status, 'CONFIRMED')
        const sources = await prisma.caseSource.findMany({ where: { intakeId: params.intakeId } })
        assert.equal(sources.length, params.issueDecisions.length)
        for (const source of sources) assert.equal(await prisma.caseAction.count({ where: { caseId: source.caseId } }), 1)
      }
    })
    await scenario('同一来件并发确认: 只建一个事项,其余返回 409', async () => {
      const params = await analyzed()
      const before = await prisma.case.count()
      const replies = await concurrent(Array.from({ length: 4 }, () => confirmJob(params)))
      assert.deepEqual(statuses(replies), [200, 409, 409, 409])
      assert.equal(await prisma.case.count(), before + 1)
      assert.equal(await prisma.caseSource.count({ where: { intakeId: params.intakeId } }), 1)
      for (const r of replies.filter(r => r.status === 409)) assert.equal(r.body.error, 'INTAKE_ALREADY_CONFIRMED')
    })
    await scenario('同一来件并发手动兜底: 只消费一次,其余返回 409', async () => {
      const intake = await prisma.intake.create({ data: { organizationId: org.id, sourceType: 'text', rawText: '合成失败反馈' } })
      const before = await prisma.case.count()
      const replies = await concurrent(Array.from({ length: 4 }, () => manualJob('合成手动兜底', intake.id)))
      assert.deepEqual(statuses(replies), [200, 409, 409, 409])
      assert.equal(await prisma.case.count(), before + 1)
      assert.equal(await prisma.caseSource.count({ where: { intakeId: intake.id } }), 1)
      assert.equal((await prisma.intake.findUniqueOrThrow({ where: { id: intake.id } })).status, 'CONFIRMED')
    })
    await scenario('确认中途失败: 数据与编号回滚,返回结果不含幽灵事项', async () => {
      const params = await analyzed(2)
      params.issueDecisions[1] = { issueIndex: 1, decision: 'LINK_EXISTING', targetCaseId: 'missing-synthetic-case' }
      const before = { cases: await prisma.case.count(), sources: await prisma.caseSource.count(), actions: await prisma.caseAction.count() }
      const result = await confirmIntake(params)
      assert.equal(result.success, false)
      assert.deepEqual(result.createdCases, [])
      assert.deepEqual(result.linkedCases, [])
      assert.deepEqual(result.disposedIssues, [])
      assert.deepEqual({ cases: await prisma.case.count(), sources: await prisma.caseSource.count(), actions: await prisma.caseAction.count() }, before)
      assert.equal((await prisma.intake.findUniqueOrThrow({ where: { id: params.intakeId } })).status, 'ANALYZED')
      assert.ok((await prisma.intakeIssue.findMany({ where: { analysisId: params.analysisId } })).every(i => i.action === null))
      const last = (await prisma.case.findMany()).reduce((max, c) => Math.max(max, Number(c.caseNumber.slice(5)) || 0), 1000)
      const reply = await execute(manualJob('合成回滚后新建'))
      assert.equal(reply.status, 200)
      assert.equal(Number(reply.body.data.caseNumber.slice(5)), last + 1)
    })
    await scenario('关联与不建事项中途失败: 返回结果与决策留痕一起回滚', async () => {
      const params = await analyzed(3)
      params.issueDecisions = [
        { issueIndex: 0, decision: 'REJECTED', disposition: 'NOTE_ONLY' },
        { issueIndex: 1, decision: 'LINK_EXISTING', targetCaseId: caseData.id },
        { issueIndex: 2, decision: 'LINK_EXISTING', targetCaseId: 'missing-synthetic-case' },
      ]
      const sources = await prisma.caseSource.count()
      const actions = await prisma.caseAction.count()
      const result = await confirmIntake(params)
      assert.equal(result.success, false)
      assert.deepEqual([result.createdCases, result.linkedCases, result.disposedIssues], [[], [], []])
      assert.equal(await prisma.caseSource.count(), sources)
      assert.equal(await prisma.caseAction.count(), actions)
      assert.ok((await prisma.intakeIssue.findMany({ where: { analysisId: params.analysisId } })).every(i => i.action === null && i.disposition === null))
    })
    await scenario('数据库在 COMMIT 时拒绝事务: 不返回 success 或已创建事项', async () => {
      const params = await analyzed()
      const before = { cases: await prisma.case.count(), sources: await prisma.caseSource.count(), actions: await prisma.caseAction.count() }
      // 延迟外键只在 COMMIT 时检查,与语句中途失败是不同的故障路径。
      await prisma.$executeRawUnsafe('CREATE TABLE commit_guard (caseId TEXT REFERENCES "Case"(id) DEFERRABLE INITIALLY DEFERRED)')
      await prisma.$executeRawUnsafe(`CREATE TRIGGER fail_confirm_commit AFTER INSERT ON CaseAction WHEN NEW.action = 'NOTE' BEGIN INSERT INTO commit_guard VALUES ('missing-synthetic-case'); END`)
      try {
        const result = await confirmIntake(params)
        assert.equal(result.success, false)
        assert.ok(result.errors.length > 0)
        assert.deepEqual([result.createdCases, result.linkedCases, result.disposedIssues], [[], [], []])
        assert.deepEqual({ cases: await prisma.case.count(), sources: await prisma.caseSource.count(), actions: await prisma.caseAction.count() }, before)
        assert.equal((await prisma.intake.findUniqueOrThrow({ where: { id: params.intakeId } })).status, 'ANALYZED')
      } finally {
        await prisma.$executeRawUnsafe('DROP TRIGGER fail_confirm_commit')
        await prisma.$executeRawUnsafe('DROP TABLE commit_guard')
      }
    })
    await scenario('真实数据库审计写入失败: 状态、版本与审计全部回滚', async () => {
      const before = await prisma.case.findUniqueOrThrow({ where: { id: caseData.id } })
      const actions = await prisma.caseAction.count({ where: { caseId: before.id } })
      await prisma.$executeRawUnsafe(`CREATE TRIGGER fail_status_audit BEFORE INSERT ON CaseAction WHEN NEW.action = 'STATUS_CHANGE' BEGIN SELECT RAISE(ABORT, 'synthetic audit failure'); END`)
      try {
        const target = before.status === 'CANCELED' ? 'OPEN' : 'RESOLVED'
        const reply = await execute({ op: 'status', id: before.id, body: { expectedVersion: before.version, status: target } })
        assert.equal(reply.status, 500)
        const after = await prisma.case.findUniqueOrThrow({ where: { id: before.id } })
        assert.equal(after.status, before.status)
        assert.equal(after.version, before.version)
        assert.equal(await prisma.caseAction.count({ where: { caseId: before.id } }), actions)
      } finally {
        await prisma.$executeRawUnsafe('DROP TRIGGER fail_status_audit')
      }
    })
  } finally {
    await Promise.all(workers.map(worker => new Promise<void>(resolve => {
      if (worker.exitCode !== null || worker.signalCode !== null) return resolve()
      const timer = setTimeout(() => worker.kill(), 5000)
      worker.once('exit', () => { clearTimeout(timer); resolve() })
      if (worker.connected) worker.send('close')
      else worker.kill()
    })))
    await app?.prisma.$disconnect()
    assert.equal(hashFile(demoFile), demoHash, '演示数据库发生了变化')
    const resolved = path.resolve(testDir)
    assert.ok(resolved.startsWith(`${path.resolve(tmpRoot)}${path.sep}concurrency-`))
    rmSync(resolved, { recursive: true, force: true })
  }
  console.log(`真实并发回归: ${passed}/${passed + failed};演示库 SHA-256 未变;独立测试库已删除`)
  if (failed) process.exitCode = 1
}

(workerMode ? runWorker() : runTests()).catch(error => {
  console.error(error)
  process.exitCode = 1
})
