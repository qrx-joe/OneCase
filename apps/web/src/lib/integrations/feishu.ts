// 飞书自建应用事件订阅适配器 (入站)
// 协议要点 (按飞书开放平台公开文档):
// - 订阅地址校验: POST {type:'url_verification', token, challenge} → 原样回 challenge
// - token 比对: url_verification 用顶层 token,事件回调用 header.token
// - 加密订阅: body = {encrypt},AES-256-CBC,key = SHA256(ENCRYPT_KEY),IV 取密文前 16 字节
// 状态: 契约测试覆盖 (对称加解密 + token 比对 + 事件归一化);未与真实平台联调
import { createHash } from 'node:crypto'
import { decodeAesCbc, safeEqual } from './crypto'
import type { IntegrationAdapter, WebhookRequestContext, WebhookVerdict } from './types'

export const FEISHU_MESSAGE_EVENT = 'im.message.receive_v1'

export function decryptFeishuPayload(encryptKey: string, encryptedBase64: string): string | null {
  const key = createHash('sha256').update(encryptKey, 'utf8').digest()
  const data = Buffer.from(encryptedBase64, 'base64')
  // 飞书约定: 密文前 16 字节是 IV,其余才是真正密文
  if (data.length <= 16) return null
  const decoded = decodeAesCbc(key, data.subarray(16), data.subarray(0, 16))
  if (!decoded.ok) return null
  return decoded.plaintext.toString('utf8')
}

function parseJson(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

function extractText(content: unknown): string | null {
  if (typeof content !== 'string') return null
  const parsed = parseJson(content)
  if (!parsed || typeof parsed.text !== 'string') return null
  return parsed.text
}

export const feishuAdapter: IntegrationAdapter = {
  id: 'feishu',
  requiredEnv: ['FEISHU_VERIFICATION_TOKEN'],
  optionalEnv: ['FEISHU_ENCRYPT_KEY'],
  isConfigured(env) {
    return this.requiredEnv.every((key) => !!env[key])
  },
  handle(ctx: WebhookRequestContext): WebhookVerdict {
    const token = ctx.env.FEISHU_VERIFICATION_TOKEN
    if (!token) return { kind: 'reject', status: 400, reason: 'FEISHU_TOKEN_MISSING' }
    let body = parseJson(ctx.rawBody)
    if (!body) return { kind: 'reject', status: 400, reason: 'INVALID_JSON' }

    if (typeof body.encrypt === 'string') {
      const encryptKey = ctx.env.FEISHU_ENCRYPT_KEY
      if (!encryptKey) return { kind: 'reject', status: 400, reason: 'ENCRYPTED_BUT_NO_KEY' }
      const decrypted = decryptFeishuPayload(encryptKey, body.encrypt)
      if (decrypted === null) return { kind: 'reject', status: 400, reason: 'DECRYPT_FAILED' }
      body = parseJson(decrypted)
      if (!body) return { kind: 'reject', status: 400, reason: 'INVALID_JSON' }
    }

    if (body.type === 'url_verification') {
      if (typeof body.token !== 'string' || !safeEqual(body.token, token)) {
        return { kind: 'reject', status: 401, reason: 'TOKEN_MISMATCH' }
      }
      if (typeof body.challenge !== 'string') {
        return { kind: 'reject', status: 400, reason: 'CHALLENGE_MISSING' }
      }
      return { kind: 'challenge', payload: { challenge: body.challenge } }
    }

    const header = body.header as { token?: unknown; event_type?: unknown } | undefined
    if (typeof header?.token !== 'string' || !safeEqual(header.token, token)) {
      return { kind: 'reject', status: 401, reason: 'TOKEN_MISMATCH' }
    }
    if (header.event_type !== FEISHU_MESSAGE_EVENT) {
      return { kind: 'ignore', reason: `非消息事件: ${String(header.event_type)}` }
    }
    const event = body.event as
      | { sender?: { sender_type?: unknown }; message?: { message_id?: unknown; message_type?: unknown; content?: unknown } }
      | undefined
    if (event?.sender?.sender_type === 'app') {
      return { kind: 'ignore', reason: '机器人自身消息' }
    }
    const message = event?.message
    if (
      !message ||
      typeof message.message_id !== 'string' ||
      message.message_type !== 'text'
    ) {
      return { kind: 'ignore', reason: '仅支持文本消息' }
    }
    const text = extractText(message.content)
    if (text === null) return { kind: 'ignore', reason: '仅支持文本消息' }
    return {
      kind: 'message',
      message: { externalMessageId: message.message_id, text },
    }
  },
}
