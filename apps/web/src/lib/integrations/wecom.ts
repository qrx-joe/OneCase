// 企业微信接收消息回调适配器 (入站)
// 协议要点 (按企业微信服务端 API 公开文档):
// - GET 验证 URL: query 带 msg_signature/timestamp/nonce/echostr,解密 echostr 后明文返回
// - POST 消息: body 为 XML ({@xml}<Encrypt>..</Encrypt>),msg_signature = SHA1(sort(token,timestamp,nonce,encrypt))
// - 解密: AES-256-CBC,key = Base64Decode(EncodingAESKey + '='),IV = key 前 16 字节;
//   明文 = 16 字节随机串 + 4 字节网络序消息长度 + 消息体 + corpId
// 状态: 契约测试覆盖 (签名/加解密对称验证 + URL 验证 + 文本归一化);未与真实平台联调
import { Buffer } from 'node:buffer'
import { decodeAesCbc, safeEqual, sha1Hex } from './crypto'
import type { IntegrationAdapter, WebhookRequestContext, WebhookVerdict } from './types'

function decodeKey(encodingAesKey: string): Buffer | null {
  // EncodingAESKey 固定 43 位,补一个 '=' 后 base64 解出 32 字节
  if (!/^[A-Za-z0-9]{43}$/.test(encodingAesKey)) return null
  const key = Buffer.from(`${encodingAesKey}=`, 'base64')
  return key.length === 32 ? key : null
}

function xmlField(xml: string, tag: string): string | null {
  const cdata = new RegExp(`<${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`).exec(xml)
  if (cdata) return cdata[1]
  const plain = new RegExp(`<${tag}>([^<]*)</${tag}>`).exec(xml)
  return plain ? plain[1] : null
}

export function extractWecomMessage(
  xml: string
): { externalMessageId: string; text: string; senderName?: string } | null {
  const msgType = xmlField(xml, 'MsgType')
  if (msgType !== 'text') return null
  const content = xmlField(xml, 'Content')
  const msgId = xmlField(xml, 'MsgId')
  if (content === null || msgId === null) return null
  return {
    externalMessageId: msgId,
    text: content,
    senderName: xmlField(xml, 'FromUserName') ?? undefined,
  }
}

function verifySignature(
  ctx: WebhookRequestContext,
  token: string,
  encrypt: string
): WebhookVerdict | null {
  const msgSignature = ctx.query.get('msg_signature')
  const timestamp = ctx.query.get('timestamp')
  const nonce = ctx.query.get('nonce')
  if (!msgSignature || !timestamp || !nonce) {
    return { kind: 'reject', status: 401, reason: 'SIGNATURE_PARAMS_MISSING' }
  }
  const expected = sha1Hex([token, timestamp, nonce, encrypt].sort().join(''))
  if (!safeEqual(msgSignature, expected)) {
    return { kind: 'reject', status: 401, reason: 'SIGNATURE_MISMATCH' }
  }
  return null
}

function decryptBody(
  ctx: WebhookRequestContext,
  encodingAesKey: string,
  encryptBase64: string
): { ok: true; xml: string } | { ok: false; verdict: WebhookVerdict } {
  const key = decodeKey(encodingAesKey)
  if (!key) return { ok: false, verdict: { kind: 'reject', status: 400, reason: 'BAD_ENCODING_AES_KEY' } }
  const decoded = decodeAesCbc(key, Buffer.from(encryptBase64, 'base64'))
  if (!decoded.ok) return { ok: false, verdict: { kind: 'reject', status: 400, reason: 'DECRYPT_FAILED' } }
  // 明文结构: 16 字节随机串 + 4 字节消息长度 + 消息体 + corpId (receiveid)
  if (decoded.plaintext.length < 20) {
    return { ok: false, verdict: { kind: 'reject', status: 400, reason: 'DECRYPT_FAILED' } }
  }
  const msgLen = decoded.plaintext.readUInt32BE(16)
  if (20 + msgLen > decoded.plaintext.length) {
    return { ok: false, verdict: { kind: 'reject', status: 400, reason: 'DECRYPT_FAILED' } }
  }
  const corpId = ctx.env.WECOM_CORP_ID
  if (corpId) {
    const tail = decoded.plaintext.subarray(20 + msgLen).toString('utf8')
    if (!tail.startsWith(corpId)) {
      return { ok: false, verdict: { kind: 'reject', status: 401, reason: 'CORP_ID_MISMATCH' } }
    }
  }
  return { ok: true, xml: decoded.plaintext.subarray(20, 20 + msgLen).toString('utf8') }
}

export const wecomAdapter: IntegrationAdapter = {
  id: 'wecom',
  requiredEnv: ['WECOM_TOKEN', 'WECOM_ENCODING_AES_KEY'],
  optionalEnv: ['WECOM_CORP_ID'],
  isConfigured(env) {
    return this.requiredEnv.every((key) => !!env[key])
  },
  handle(ctx: WebhookRequestContext): WebhookVerdict {
    const token = ctx.env.WECOM_TOKEN ?? ''
    const encodingAesKey = ctx.env.WECOM_ENCODING_AES_KEY ?? ''

    if (ctx.method === 'GET') {
      // 企业微信「验证 URL」: 解密 echostr,原文明文返回
      const echoStr = ctx.query.get('echostr')
      if (!echoStr) return { kind: 'reject', status: 400, reason: 'ECHOSTR_MISSING' }
      const sigFail = verifySignature(ctx, token, echoStr)
      if (sigFail) return sigFail
      const decrypted = decryptBody(ctx, encodingAesKey, echoStr)
      if (!decrypted.ok) return decrypted.verdict
      return { kind: 'challenge', payload: decrypted.xml }
    }

    const encrypt = xmlField(ctx.rawBody, 'Encrypt')
    if (encrypt === null) return { kind: 'reject', status: 400, reason: 'ENCRYPT_FIELD_MISSING' }
    const sigFail = verifySignature(ctx, token, encrypt)
    if (sigFail) return sigFail
    const decrypted = decryptBody(ctx, encodingAesKey, encrypt)
    if (!decrypted.ok) return decrypted.verdict
    const message = extractWecomMessage(decrypted.xml)
    if (!message) return { kind: 'ignore', reason: '仅支持文本消息' }
    return { kind: 'message', message }
  },
}
