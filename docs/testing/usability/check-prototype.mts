import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  applyServiceEvent, initialServiceRecord, parseServiceRecord, ServiceError,
  ServiceEventSchema, ServicePlanSchema, serviceClosingError, updateServicePlan,
  type ServiceEvent, type ServicePlan, type ServiceRecord,
} from '../../../apps/web/src/lib/service-record'

type EventInput = Pick<ServiceEvent, 'kind' | 'note'> & Partial<Pick<ServiceEvent, 'evidence' | 'followUpAt'>>
type Expectation = Partial<Pick<ServiceRecord, 'referralStatus' | 'resultStatus' | 'resultEvidence' | 'followUpAt' | 'previousCaseId'>> & {
  consent?: ServicePlan['consent']; canResolve?: boolean; canCancel?: boolean
}
type Sample = { id: string; label: string; plan: ServicePlan; steps: { event: EventInput; expect: Expectation }[];
  nextCycle?: { previousCaseId: string; planPatch: Partial<ServicePlan>; expect: Expectation } }
type Operation = { type: 'EVENT'; event: EventInput } | { type: 'PLAN'; planPatch: Partial<ServicePlan> } | { type: 'CHECK_STATE' }
type Negative = { id: string; sampleId: string; beforeSteps: number; planPatch?: Partial<ServicePlan>;
  operation: Operation; rejectCode?: string; expect?: Expectation }
type Fixtures = { metadata: Record<string, unknown>; samples: Sample[]; negatives: Negative[] }

function apply(record: ServiceRecord, input: EventInput) {
  return applyServiceEvent(record, ServiceEventSchema.parse({ expectedVersion: 0, ...input }))
}

function check(record: ServiceRecord, expected: Expectation) {
  assert.ok(expected && Object.keys(expected).length, '缺少期望，不能空检查通过')
  const allowed = new Set(['referralStatus', 'resultStatus', 'resultEvidence', 'followUpAt', 'previousCaseId', 'consent', 'canResolve', 'canCancel'])
  for (const [key, value] of Object.entries(expected)) {
    assert.ok(allowed.has(key), `未知期望字段：${key}`)
    const actual = key === 'canResolve' ? serviceClosingError(record, 'RESOLVED') === null
      : key === 'canCancel' ? serviceClosingError(record, 'CANCELED') === null
      : key === 'consent' ? record.plan.consent : record[key as keyof ServiceRecord]
    assert.deepEqual(actual, value, key)
  }
  assert.deepEqual(parseServiceRecord(JSON.stringify(record)), record, '序列化恢复改变了记录')
}

function prefix(sample: Sample, count: number, patch: Partial<ServicePlan> = {}) {
  assert.ok(Number.isInteger(count) && count >= 0 && count <= sample.steps.length, '前置步骤越界')
  let record = initialServiceRecord(ServicePlanSchema.parse({ ...sample.plan, ...patch }))
  for (const step of sample.steps.slice(0, count)) record = apply(record, step.event)
  return record
}

function operate(record: ServiceRecord, operation: Operation) {
  switch (operation.type) {
    case 'EVENT': return apply(record, operation.event)
    case 'PLAN': return updateServicePlan(record, ServicePlanSchema.parse({ ...record.plan, ...operation.planPatch }))
    case 'CHECK_STATE': return record
    default: throw new Error('未知负例操作')
  }
}

function main() {
  assert.ok(process.argv.length <= 3, '只接受一个可选 fixtures 路径')
  const fixturePath = process.argv[2] ? resolve(process.cwd(), process.argv[2])
    : fileURLToPath(new URL('./livelihood-prototype-fixtures.json', import.meta.url))
  const fixtures: Fixtures = JSON.parse(readFileSync(fixturePath, 'utf8'))
  assert.deepEqual(fixtures.metadata, {
    version: 'livelihood-proto-v1', synthetic: true, status: 'AI_DRAFT', humanApproved: false,
    fieldValidation: 'NOT_RUN', crossLineageReview: 'NOT_RUN',
  }, '本版材料必须保留合成、待人审和未执行反馈状态')
  assert.ok(Array.isArray(fixtures.samples) && Array.isArray(fixtures.negatives), '样本和负例必须是数组')
  const ids = [...fixtures.samples, ...fixtures.negatives].map(item => item.id)
  assert.ok(ids.every(id => typeof id === 'string' && id.length > 0), '缺少编号')
  assert.equal(new Set(ids).size, ids.length, '编号重复')
  assert.deepEqual(fixtures.samples.map(item => item.id).sort(), ['S01', 'S02'], 'v1 必须保留 S01、S02 两条标准样本')
  assert.deepEqual(fixtures.negatives.map(item => item.id).sort(), ['N01', 'N02', 'N03', 'N04', 'N05', 'N06', 'N07', 'N08'], 'v1 必须保留 N01 至 N08 全部负例')

  for (const sample of fixtures.samples) {
    assert.ok(sample.steps.length > 0, `${sample.id} 没有服务步骤`)
    if (sample.id === 'S02') assert.ok(sample.nextCycle, 'S02 必须保留新周期检查')
    let record = prefix(sample, 0)
    check(record, { resultStatus: 'UNKNOWN', canResolve: false })
    for (const step of sample.steps) { record = apply(record, step.event); check(record, step.expect) }
    check(record, { resultStatus: 'CONFIRMED', canResolve: true })
    if (sample.nextCycle) {
      const old = JSON.stringify(record)
      const next = initialServiceRecord(ServicePlanSchema.parse({ ...record.plan, ...sample.nextCycle.planPatch }), sample.nextCycle.previousCaseId)
      check(next, sample.nextCycle.expect)
      assert.equal(next.plan.subjectRef, record.plan.subjectRef)
      assert.equal(next.plan.serviceType, record.plan.serviceType)
      assert.equal(JSON.stringify(record), old, '初始化新周期覆盖了旧记录')
    }
    console.log(`PASS ${sample.id} ${sample.label}`)
  }

  for (const negative of fixtures.negatives) {
    const sample = fixtures.samples.find(item => item.id === negative.sampleId)
    assert.ok(sample, `${negative.id} 引用了不存在的样本`)
    const record = prefix(sample, negative.beforeSteps, negative.planPatch)
    assert.ok(Boolean(negative.rejectCode) !== Boolean(negative.expect), `${negative.id} 必须只指定拒绝码或状态期望之一`)
    if (negative.rejectCode) {
      const old = JSON.stringify(record)
      assert.throws(() => operate(record, negative.operation), error => error instanceof ServiceError && error.code === negative.rejectCode)
      assert.equal(JSON.stringify(record), old, '被拒绝操作改变了原记录')
    } else check(operate(record, negative.operation), negative.expect!)
    console.log(`PASS ${negative.id}`)
  }
  console.log(`PASS ${fixtures.samples.length} 条标准样本 / ${fixtures.negatives.length} 条负例；仅业务函数，无数据库、模型或真人验证`)
  console.log('人工清单：阅读 negatives.md 的 CHECKLIST；人审、跨谱系评审及一线反馈仍未执行。')
}

try { main() }
catch (error) { console.error('FAIL', error instanceof Error ? error.message : String(error)); process.exitCode = 1 }
