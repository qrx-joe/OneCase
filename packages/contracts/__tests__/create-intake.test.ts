import { describe, expect, it } from 'vitest'
import { CreateIntakeSchema, MAX_INTAKE_TEXT_LENGTH } from '../src'

describe('CreateIntakeSchema', () => {
  const valid = { rawText: '  电梯异常\n', organizationId: 'demo-org' }
  it('保留原文并默认 text 来源', () => {
    expect(CreateIntakeSchema.parse(valid)).toEqual({ ...valid, sourceType: 'text' })
  })
  it.each(['', ' \n\t', 123, null, {}, '字'.repeat(MAX_INTAKE_TEXT_LENGTH + 1)])('拒绝非法原文 %#', rawText => {
    expect(CreateIntakeSchema.safeParse({ ...valid, rawText }).success).toBe(false)
  })
  it('接受长度上限', () => {
    expect(CreateIntakeSchema.safeParse({ ...valid, rawText: '字'.repeat(MAX_INTAKE_TEXT_LENGTH) }).success).toBe(true)
  })
  it.each([null, [], { ...valid, organizationId: ' ' }, { ...valid, idempotencyKey: {} }, { ...valid, sourceType: 1 }])('拒绝错误结构 %#', body => {
    expect(CreateIntakeSchema.safeParse(body).success).toBe(false)
  })
})
