// Duplicate Detection 纯函数测试 (评分服务的数据库路径由 E2E 脚本覆盖)
import { describe, it, expect } from 'vitest'
import {
  calculateStringSimilarity,
  tokenSimilarity,
  buildingUnitMatch,
} from '../text-similarity'

describe('calculateStringSimilarity (Levenshtein 归一化)', () => {
  it('相同字符串返回 1.0', () => {
    expect(calculateStringSimilarity('3栋2单元楼道照明故障', '3栋2单元楼道照明故障')).toBe(1)
  })

  it('不同字符串相似度 < 1.0', () => {
    const score = calculateStringSimilarity('3栋2单元楼道照明故障', '西门口垃圾未清运')
    expect(score).toBeLessThan(1)
    expect(score).toBeGreaterThanOrEqual(0)
  })

  it('空字符串不崩溃', () => {
    expect(calculateStringSimilarity('', '')).toBe(1)
    expect(calculateStringSimilarity('', 'abc')).toBe(0)
  })
})

describe('tokenSimilarity (2-gram 重叠率)', () => {
  it('相同文本返回 1.0', () => {
    expect(tokenSimilarity('楼道照明故障', '楼道照明故障')).toBe(1)
  })

  it('完全不同的文本返回 0', () => {
    expect(tokenSimilarity('楼道照明', '垃圾清运')).toBe(0)
  })
})

describe('buildingUnitMatch (Hard Negative 保护)', () => {
  it('楼栋一致但单元号不同 → 不同地点', () => {
    expect(buildingUnitMatch('3栋1单元', '3栋2单元')).toBe(false)
  })

  it('楼栋单元都一致 → 同一地点', () => {
    expect(buildingUnitMatch('3栋2单元', '3栋2单元')).toBe(true)
  })

  it('前缀一致但一方缺单元号 → 仍视为同楼 (交由相似度定权重)', () => {
    expect(buildingUnitMatch('3栋2单元', '3栋')).toBe(true)
  })

  it('任一方无数字 → 不做 Hard Negative 判定', () => {
    expect(buildingUnitMatch('西门口', '南门')).toBe(true)
  })
})
