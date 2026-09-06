// 渠道接入层契约测试 (ADR-004)
// 策略: 适配器是纯函数,直接喂构造的载荷验证「签名/加解密/归一化/拒绝路径」;
// 加密类用同一官方算法在测试里加密、由适配器解密,做对称验证。
// 边界: 这些测试证明实现符合算法约定,不等于与真实平台联调通过 (见 ADR-004)。
import { describe, it, expect, vi, afterEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import { createCipheriv, createHash, createHmac, randomBytes } from 'node:crypto'
import type { WebhookRequestContext } from '../integrations/types'

import { integrationStatusList, INTEGRATION_ADAPTERS } from '../integrations'
import { decryptFeishuPayload } from '../integrations/feishu'

// webhook 路由把建件委托给 /api/intakes 路由,这里替身化以隔离 DB
const createIntakeMock = vi.hoisted(() => vi.fn())
vi.mock('../../app/api/intakes/route', () => ({ POST: createIntakeMock }))

import { POST as webhookPost, GET as webhookGet } from '../../app/api/integrations/[platform]/webhook/route'
import { GET as statusGet } from '../../app/api/integrations/status/route'

function ctx(overrides: Partial<WebhookRequestContext> = {}): WebhookRequestContext {
  return {
    env: {},
    method: 'POST',
    rawBody: '',
    query: new URLSearchParams(),
    header: () => null,
    ...overrides,
  }
}

afterEach(() => {
  vi.unstubAllEnvs()
  createIntakeMock.mockReset()
})

describe('接入配置状态 (只报变量名,不回读密钥值)', () => {
  it('空环境: 三平台全部未配置,missing 列出必需变量名', () => {
    const list = integrationStatusList({})
    expect(list.map(s => s.platform)).toEqual(['feishu', 'dingtalk', 'wecom'])
    for (const item of list) {
      expect(item.configured).toBe(false)
      expect(item.missing.length).toBeGreaterThan(0)
      expect(item.missing).toEqual([...INTEGRATION_ADAPTERS[item.platform].requiredEnv])
    }
  })

  it('必需变量齐全即 configured,可选变量缺失不影响', () => {
    const list = integrationStatusList({
      FEISHU_VERIFICATION_TOKEN: 't',
      DINGTALK_APP_SECRET: 's',
      WECOM_TOKEN: 'wt',
      WECOM_ENCODING_AES_KEY: 'k'.repeat(43),
    })
    expect(list.every(s => s.configured)).toBe(true)
    expect(list.find(s => s.platform === 'feishu')?.missing).toEqual([])
  })
})

describe('飞书适配器', () => {
  const env = { FEISHU_VERIFICATION_TOKEN: 'tok-feishu' }

  it('url_verification: token 匹配回 challenge', () => {
    const verdict = INTEGRATION_ADAPTERS.feishu.handle(ctx({
      env,
      rawBody: JSON.stringify({ type: 'url_verification', token: 'tok-feishu', challenge: 'abc123' }),
    }))
    expect(verdict).toEqual({ kind: 'challenge', payload: { challenge: 'abc123' } })
  })

  it('url_verification: token 不匹配拒绝 401', () => {
    const verdict = INTEGRATION_ADAPTERS.feishu.handle(ctx({
      env,
      rawBody: JSON.stringify({ type: 'url_verification', token: 'wrong', challenge: 'abc123' }),
    }))
    expect(verdict).toEqual({ kind: 'reject', status: 401, reason: 'TOKEN_MISMATCH' })
  })

  it('文本消息事件归一化为 message', () => {
    const raw = JSON.stringify({
      header: { token: 'tok-feishu', event_type: 'im.message.receive_v1' },
      event: {
        sender: { sender_type: 'user' },
        message: { message_id: 'om_1', message_type: 'text', content: '{"text":"3栋2单元的灯坏了"}' },
      },
    })
    const verdict = INTEGRATION_ADAPTERS.feishu.handle(ctx({ env, rawBody: raw }))
    expect(verdict).toEqual({
      kind: 'message',
      message: { externalMessageId: 'om_1', text: '3栋2单元的灯坏了' },
    })
  })

  it('非消息事件/机器人自身/非文本消息 → ignore,不建件', () => {
    const wrap = (event: Record<string, unknown>) => INTEGRATION_ADAPTERS.feishu.handle(ctx({
      env,
      rawBody: JSON.stringify({ header: { token: 'tok-feishu', event_type: 'im.message.receive_v1' }, event }),
    })).kind === 'ignore'
    expect(wrap({ sender: { sender_type: 'app' }, message: { message_id: 'om_2', message_type: 'text', content: '{"text":"x"}' } })).toBe(true)
    expect(wrap({ sender: { sender_type: 'user' }, message: { message_id: 'om_3', message_type: 'image', content: '{"image_key":"k"}' } })).toBe(true)
    const other = INTEGRATION_ADAPTERS.feishu.handle(ctx({
      env,
      rawBody: JSON.stringify({ header: { token: 'tok-feishu', event_type: 'application.menu.event' }, event: {} }),
    }))
    expect(other.kind).toBe('ignore')
  })

  it('加密订阅: 同算法加密的载荷可解密归一化;密钥不符如实拒绝', () => {
    const encryptKey = 'fe-encrypt-key'
    const plaintext = JSON.stringify({
      header: { token: 'tok-feishu', event_type: 'im.message.receive_v1' },
      event: { sender: { sender_type: 'user' }, message: { message_id: 'om_4', message_type: 'text', content: '{"text":"楼道灯不亮"}' } },
    })
    const key = createHash('sha256').update(encryptKey, 'utf8').digest()
    // 飞书约定: IV 取密文前 16 字节,因此加密用同一 IV 并把它前置到密文
    const iv = randomBytes(16)
    const cipher = createCipheriv('aes-256-cbc', key, iv)
    const encrypted = Buffer.concat([iv, cipher.update(plaintext, 'utf8'), cipher.final()]).toString('base64')

    const ok = INTEGRATION_ADAPTERS.feishu.handle(ctx({
      env: { ...env, FEISHU_ENCRYPT_KEY: encryptKey },
      rawBody: JSON.stringify({ encrypt: encrypted }),
    }))
    expect(ok).toEqual({ kind: 'message', message: { externalMessageId: 'om_4', text: '楼道灯不亮' } })

    const wrongKey = INTEGRATION_ADAPTERS.feishu.handle(ctx({
      env: { ...env, FEISHU_ENCRYPT_KEY: 'other-key' },
      rawBody: JSON.stringify({ encrypt: encrypted }),
    }))
    expect(wrongKey).toEqual({ kind: 'reject', status: 400, reason: 'DECRYPT_FAILED' })
  })

  it('解密函数对非 base64/截断输入返回 null 而不抛', () => {
    expect(decryptFeishuPayload('k', 'not-base64!!')).toBeNull()
    expect(decryptFeishuPayload('k', Buffer.from('short').toString('base64'))).toBeNull()
  })
})

describe('钉钉适配器', () => {
  const secret = 'dt-secret'
  const env = { DINGTALK_APP_SECRET: secret }
  const signFor = (timestamp: number) =>
    createHmac('sha256', secret).update(`${timestamp}\n${secret}`).digest('base64')

  function request(rawBody: string, timestamp = Date.now(), sign = signFor(timestamp)) {
    return INTEGRATION_ADAPTERS.dingtalk.handle(ctx({
      env,
      rawBody,
      header: (name) => (name === 'timestamp' ? String(timestamp) : name === 'sign' ? sign : null),
    }))
  }

  it('签名匹配 → 文本消息归一化 (content 尾部换行按原文保留,由路由 trim)', () => {
    const verdict = request(JSON.stringify({ msgtype: 'text', msgId: 'msg_1', senderNick: '居民甲', text: { content: '电梯又坏了\n' } }))
    expect(verdict).toEqual({
      kind: 'message',
      message: { externalMessageId: 'msg_1', text: '电梯又坏了\n', senderName: '居民甲' },
    })
  })

  it('签名不匹配/时间戳过期/缺签名头 → 401 拒绝', () => {
    expect(request('{}', Date.now(), 'bad-sign').kind === 'reject').toBe(true)
    expect(request('{}', Date.now() - 2 * 60 * 60 * 1000).kind === 'reject').toBe(true)
    expect(INTEGRATION_ADAPTERS.dingtalk.handle(ctx({ env, rawBody: '{}' })).kind === 'reject').toBe(true)
  })

  it('非文本消息 → ignore;缺 msgId → 400', () => {
    const okSig = (raw: string) => request(raw)
    expect(okSig(JSON.stringify({ msgtype: 'picture', msgId: 'm2' })).kind).toBe('ignore')
    const verdict = okSig(JSON.stringify({ msgtype: 'text', text: { content: 'x' } }))
    expect(verdict).toEqual({ kind: 'reject', status: 400, reason: 'MSG_ID_MISSING' })
  })
})

describe('企业微信适配器', () => {
  const encodingAesKey = 'a'.repeat(43)
  const env = { WECOM_TOKEN: 'wecom-tok', WECOM_ENCODING_AES_KEY: encodingAesKey, WECOM_CORP_ID: 'corp-demo' }
  const key = Buffer.from(`${encodingAesKey}=`, 'base64')

  /**
   * 按企微约定加密: 明文 = 16 随机字节 + 4 字节消息长度 + 消息 + corpId,
   * PKCS7 填充到 32 的倍数;AES-256-CBC,key = Base64Decode(EncodingAESKey+'='),IV = key 前 16 字节
   */
  function encryptFor(plain: string, corpId = 'corp-demo'): string {
    const body = Buffer.from(plain, 'utf8')
    const lenBuf = Buffer.alloc(4)
    lenBuf.writeUInt32BE(body.length, 0)
    const inner = Buffer.concat([randomBytes(16), lenBuf, body, Buffer.from(corpId, 'utf8')])
    const padLen = 32 - (inner.length % 32)
    const cipher = createCipheriv('aes-256-cbc', key, key.subarray(0, 16))
    cipher.setAutoPadding(false)
    return Buffer.concat([cipher.update(Buffer.concat([inner, Buffer.alloc(padLen, padLen)])), cipher.final()]).toString('base64')
  }

  function signFor(encryptB64: string, timestamp: string, nonce: string): string {
    return createHash('sha1').update(['wecom-tok', timestamp, nonce, encryptB64].sort().join(''), 'utf8').digest('hex')
  }

  function getCtx(echoStr: string): WebhookRequestContext {
    const timestamp = '1700000000'
    const nonce = 'nonce-1'
    const query = new URLSearchParams({ msg_signature: signFor(echoStr, timestamp, nonce), timestamp, nonce, echostr: echoStr })
    return ctx({ env, method: 'GET', query })
  }

  it('GET 验证 URL: 解密 echostr 明文返回;签名不符拒绝', () => {
    const verdict = INTEGRATION_ADAPTERS.wecom.handle(getCtx(encryptFor('echo-123')))
    expect(verdict).toEqual({ kind: 'challenge', payload: 'echo-123' })
    const bad = INTEGRATION_ADAPTERS.wecom.handle(ctx({
      env,
      method: 'GET',
      query: new URLSearchParams({ msg_signature: 'bad', timestamp: '1', nonce: 'n', echostr: encryptFor('echo-123') }),
    }))
    expect(bad).toEqual({ kind: 'reject', status: 401, reason: 'SIGNATURE_MISMATCH' })
  })

  it('POST 文本消息: 签名+解密+XML 归一化', () => {
    const xml = '<xml><ToUserName><![CDATA[corp-demo]]></ToUserName><FromUserName><![CDATA[zhangsan]]></FromUserName><MsgType><![CDATA[text]]></MsgType><Content><![CDATA[西门垃圾三天没清了]]></Content><MsgId>7001</MsgId></xml>'
    const encryptB64 = encryptFor(xml)
    const timestamp = '1700000001'
    const nonce = 'nonce-2'
    const verdict = INTEGRATION_ADAPTERS.wecom.handle(ctx({
      env,
      rawBody: `<xml><Encrypt><![CDATA[${encryptB64}]]></Encrypt></xml>`,
      query: new URLSearchParams({ msg_signature: signFor(encryptB64, timestamp, nonce), timestamp, nonce }),
    }))
    expect(verdict).toEqual({
      kind: 'message',
      message: { externalMessageId: '7001', text: '西门垃圾三天没清了', senderName: 'zhangsan' },
    })
  })

  it('corpId 不匹配 → 401;非文本消息 → ignore', () => {
    const foreignXml = '<xml><MsgType><![CDATA[text]]></MsgType><Content><![CDATA[x]]></Content><MsgId>1</MsgId></xml>'
    const timestamp = '1700000002'
    const nonce = 'n3'
    const foreignEncrypt = encryptFor(foreignXml, 'corp-OTHER')
    const mismatch = INTEGRATION_ADAPTERS.wecom.handle(ctx({
      env,
      rawBody: `<xml><Encrypt><![CDATA[${foreignEncrypt}]]></Encrypt></xml>`,
      query: new URLSearchParams({ msg_signature: signFor(foreignEncrypt, timestamp, nonce), timestamp, nonce }),
    }))
    expect(mismatch).toEqual({ kind: 'reject', status: 401, reason: 'CORP_ID_MISMATCH' })

    const imageXml = '<xml><MsgType><![CDATA[image]]></MsgType><MsgId>7002</MsgId></xml>'
    const imageEncrypt = encryptFor(imageXml)
    const ignored = INTEGRATION_ADAPTERS.wecom.handle(ctx({
      env,
      rawBody: `<xml><Encrypt><![CDATA[${imageEncrypt}]]></Encrypt></xml>`,
      query: new URLSearchParams({ msg_signature: signFor(imageEncrypt, timestamp, nonce), timestamp, nonce }),
    }))
    expect(ignored.kind).toBe('ignore')
  })
})

describe('webhook 路由', () => {
  const base = 'http://localhost/api/integrations'

  function postRequest(platform: string, body: string, headers: Record<string, string> = {}) {
    return new NextRequest(`${base}/${platform}/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body,
    })
  }

  it('未知平台 → 404;未配置 → 503 并列出缺失变量名', async () => {
    vi.stubEnv('FEISHU_VERIFICATION_TOKEN', '')
    const unknown = await webhookPost(postRequest('slack', '{}'), { params: Promise.resolve({ platform: 'slack' }) })
    expect(unknown.status).toBe(404)
    const unconfigured = await webhookPost(postRequest('feishu', '{}'), { params: Promise.resolve({ platform: 'feishu' }) })
    expect(unconfigured.status).toBe(503)
    const body = await unconfigured.json()
    expect(body.error).toBe('INTEGRATION_NOT_CONFIGURED')
    expect(body.missing).toContain('FEISHU_VERIFICATION_TOKEN')
  })

  it('已配置: 飞书消息事件转发建件,幂等键 = platform:externalMessageId', async () => {
    createIntakeMock.mockResolvedValue(NextResponse.json({ data: { id: 'intake-1' } }))
    vi.stubEnv('FEISHU_VERIFICATION_TOKEN', 'tok-feishu')
    const raw = JSON.stringify({
      header: { token: 'tok-feishu', event_type: 'im.message.receive_v1' },
      event: { sender: { sender_type: 'user' }, message: { message_id: 'om_9', message_type: 'text', content: '{"text":"  3栋灯坏了  "}' } },
    })
    const response = await webhookPost(postRequest('feishu', raw), { params: Promise.resolve({ platform: 'feishu' }) })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ data: { accepted: true, intakeId: 'intake-1' } })
    expect(createIntakeMock).toHaveBeenCalledTimes(1)
    const forwarded = createIntakeMock.mock.calls[0][0] as NextRequest
    const payload = await forwarded.json()
    expect(payload).toEqual({ rawText: '3栋灯坏了', sourceType: 'feishu', idempotencyKey: 'feishu:om_9' })
  })

  it('已配置但 token 不符 → 401,不触达建件', async () => {
    vi.stubEnv('FEISHU_VERIFICATION_TOKEN', 'tok-feishu')
    const raw = JSON.stringify({
      header: { token: 'evil', event_type: 'im.message.receive_v1' },
      event: { sender: { sender_type: 'user' }, message: { message_id: 'om_x', message_type: 'text', content: '{"text":"x"}' } },
    })
    const response = await webhookPost(postRequest('feishu', raw), { params: Promise.resolve({ platform: 'feishu' }) })
    expect(response.status).toBe(401)
    expect(createIntakeMock).not.toHaveBeenCalled()
  })

  it('非企业微信平台 GET → 405', async () => {
    vi.stubEnv('FEISHU_VERIFICATION_TOKEN', 'tok-feishu')
    const response = await webhookGet(new NextRequest(`${base}/feishu/webhook`), { params: Promise.resolve({ platform: 'feishu' }) })
    expect(response.status).toBe(405)
  })
})

describe('status 路由', () => {
  it('返回三平台就绪态且不含密钥值', async () => {
    vi.stubEnv('FEISHU_VERIFICATION_TOKEN', 'secret-value')
    const response = await statusGet()
    const body = await response.json()
    const feishu = body.data.find((s: { platform: string }) => s.platform === 'feishu')
    expect(feishu.configured).toBe(true)
    expect(JSON.stringify(body)).not.toContain('secret-value')
  })
})
