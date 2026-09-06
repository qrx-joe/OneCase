// 渠道签名/加解密的共用工具。全部用 node:crypto 标准库实现,
// 算法按各平台公开文档;契约测试做对称验证,真实平台联调待凭据接入后补一次冒烟。
import { createHash, createDecipheriv, createHmac, timingSafeEqual } from 'node:crypto'

export function hmacSha256Base64(secret: string, message: string): string {
  return createHmac('sha256', secret).update(message, 'utf8').digest('base64')
}

export function sha1Hex(input: string): string {
  return createHash('sha1').update(input, 'utf8').digest('hex')
}

/** 常量时间字符串比较,长度不同直接 false */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8')
  const bufB = Buffer.from(b, 'utf8')
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

export function decodeAesCbc(
  key: Buffer,
  data: Buffer,
  /** 缺省用 key 前 16 字节 (企业微信约定);飞书约定 IV 是密文前 16 字节,由调用方传入 */
  iv?: Buffer
): { ok: false; error: string } | { ok: true; plaintext: Buffer } {
  try {
    const ivBytes = iv ?? key.subarray(0, 16)
    const decipher = createDecipheriv('aes-256-cbc', key, ivBytes)
    // 手动去填充: 企微/飞书的填充块长度约定与 Node 默认 (16) 不一致,按末字节值自行剥离
    decipher.setAutoPadding(false)
    const plaintext = Buffer.concat([decipher.update(data), decipher.final()])
    const pad = plaintext[plaintext.length - 1]
    if (pad < 1 || pad > 32 || plaintext.length < pad) {
      return { ok: false, error: 'BAD_PADDING' }
    }
    for (let i = plaintext.length - pad; i < plaintext.length; i++) {
      if (plaintext[i] !== pad) return { ok: false, error: 'BAD_PADDING' }
    }
    return { ok: true, plaintext: plaintext.subarray(0, plaintext.length - pad) }
  } catch {
    return { ok: false, error: 'DECRYPT_FAILED' }
  }
}
