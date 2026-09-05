// Duplicate Detection 纯函数测试 (评分服务的数据库路径由 E2E 脚本覆盖)
import { describe, it, expect } from 'vitest'
import {
  calculateStringSimilarity,
  tokenSimilarity,
  buildingUnitMatch,
  locationNumbersEqual,
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

describe('buildingUnitMatch 中文数字归一化 (R3)', () => {
  it('中文数字单元不同 → 必须判不同地点 (修复前误判同楼)', () => {
    expect(buildingUnitMatch('三栋一单元', '三栋二单元')).toBe(false)
  })

  it('中文数字与阿拉伯数字表示同一结构化位置 → 判同', () => {
    expect(buildingUnitMatch('三栋二单元', '3栋2单元')).toBe(true)
  })

  it('"十二栋" 等十位组合归一化 → 12', () => {
    expect(buildingUnitMatch('十二栋', '12栋')).toBe(true)
    expect(buildingUnitMatch('十二栋', '13栋')).toBe(false)
    expect(buildingUnitMatch('二十三栋', '23栋')).toBe(true)
  })

  it('全角数字归一化 → 与半角等价', () => {
    expect(buildingUnitMatch('３栋２单元', '3栋2单元')).toBe(true)
    expect(buildingUnitMatch('３栋２单元', '3栋3单元')).toBe(false)
  })

  it('混合写法 ("3栋二单元") → 与 "3栋2单元" 判同', () => {
    expect(buildingUnitMatch('3栋二单元', '3栋2单元')).toBe(true)
  })

  it('缺失单元/无数字地址 → 保持不确定性,不误报位置不同', () => {
    expect(buildingUnitMatch('三栋', '三栋二单元')).toBe(true)
    expect(buildingUnitMatch('西门口', '西门口')).toBe(true)
  })

  it('含门牌号的地址: 楼栋与门牌逐位对比', () => {
    expect(buildingUnitMatch('解放路25号3栋2单元', '解放路25号3栋2单元')).toBe(true)
    expect(buildingUnitMatch('解放路25号3栋2单元', '解放路26号3栋2单元')).toBe(false)
  })

  it('"两" 归一化为 2', () => {
    expect(buildingUnitMatch('两栋一单元', '2栋1单元')).toBe(true)
  })
})

describe('locationNumbersEqual (同位异写的数字序列完全一致)', () => {
  it('措辞不同但楼栋单元号一致 → true (三号楼2单元 = 3栋2单元)', () => {
    expect(locationNumbersEqual('三号楼2单元楼道', '3栋2单元')).toBe(true)
  })

  it('长度不同 (前缀一致) → false,不给地点分补偿', () => {
    expect(locationNumbersEqual('3栋', '3栋2单元')).toBe(false)
  })

  it('楼栋或单元不同 → false', () => {
    expect(locationNumbersEqual('3栋1单元', '3栋2单元')).toBe(false)
    expect(locationNumbersEqual('4栋2单元', '3栋2单元')).toBe(false)
  })

  it('任一方无数字 → false', () => {
    expect(locationNumbersEqual('西门口', '3栋2单元')).toBe(false)
    expect(locationNumbersEqual('', '')).toBe(false)
  })
})
