// 钉钉自建应用/机器人回调适配器 (入站)
// 协议要点 (按钉钉开放平台公开文档):
// - 回调签名: header timestamp + sign,sign = base64(HMAC-SHA256(APP_SECRET, `${timestamp}\n${APP_SECRET}`))
// - 时间戳超过 1 小时视为重放拒绝
// - 文本消息载荷: {msgtype:'text', text:{content}, msgId, senderNick, ...} (content 自带尾部换行)
// 状态: 契约测试覆盖 (签名校验/时间戳窗/归一化);未与真实平台联调
import { hmacSha256Base64, safeEqual } from './crypto'
import type { IntegrationAdapter, WebhookRequestContext, WebhookVerdict } from './types'

const SIGN_MAX_AGE_MS = 60 * 60 * 1000

function parseJson(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

export const dingtalkAdapter: IntegrationAdapter = {
  id: 'dingtalk',
  requiredEnv: ['DINGTALK_APP_SECRET'],
  optionalEnv: ['DINGTALK_APP_KEY'],
  isConfigured(env) {
    return this.requiredEnv.every((key) => !!env[key])
  },
  handle(ctx: WebhookRequestContext): WebhookVerdict {
    const secret = ctx.env.DINGTALK_APP_SECRET
    if (!secret) return { kind: 'reject', status: 400, reason: 'DINGTALK_SECRET_MISSING' }

    const timestamp = ctx.header('timestamp')
    const sign = ctx.header('sign')
    if (!timestamp || !sign) {
      return { kind: 'reject', status: 401, reason: 'SIGNATURE_HEADERS_MISSING' }
    }
    const ts = Number(timestamp)
    if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > SIGN_MAX_AGE_MS) {
      return { kind: 'reject', status: 401, reason: 'TIMESTAMP_EXPIRED' }
    }
    const expected = hmacSha256Base64(secret, `${timestamp}\n${secret}`)
    if (!safeEqual(sign, expected)) {
      return { kind: 'reject', status: 401, reason: 'SIGNATURE_MISMATCH' }
    }

    const body = parseJson(ctx.rawBody)
    if (!body) return { kind: 'reject', status: 400, reason: 'INVALID_JSON' }
    if (body.msgtype !== 'text') {
      return { kind: 'ignore', reason: '仅支持文本消息' }
    }
    const text = (body.text as { content?: unknown } | undefined)?.content
    if (typeof text !== 'string') {
      return { kind: 'ignore', reason: '仅支持文本消息' }
    }
    if (typeof body.msgId !== 'string' || !body.msgId) {
      return { kind: 'reject', status: 400, reason: 'MSG_ID_MISSING' }
    }
    return {
      kind: 'message',
      message: {
        externalMessageId: body.msgId,
        text,
        senderName: typeof body.senderNick === 'string' ? body.senderNick : undefined,
      },
    }
  },
}
