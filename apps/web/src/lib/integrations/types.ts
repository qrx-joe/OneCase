// 消息渠道接入层共享类型 (ADR-004)
// 目标: 飞书/钉钉/企业微信的群消息可以进系统建 Intake,走既有人工确认流程。
// 边界: 仅收消息(入站);推送回群未实现;个人微信无官方机器人接口,不做。

export type IntegrationPlatformId = 'feishu' | 'dingtalk' | 'wecom'

export interface NormalizedMessage {
  /** 平台侧消息唯一 ID: 幂等锚点 (平台会重推回调) */
  externalMessageId: string
  text: string
  senderName?: string
}

export type WebhookVerdict =
  | { kind: 'message'; message: NormalizedMessage }
  | { kind: 'ignore'; reason: string }
  | { kind: 'challenge'; payload: Record<string, unknown> | string }
  | { kind: 'reject'; status: 400 | 401; reason: string }

export interface WebhookRequestContext {
  env: Record<string, string | undefined>
  method: 'GET' | 'POST'
  rawBody: string
  query: URLSearchParams
  header(name: string): string | null
}

export interface IntegrationAdapter {
  id: IntegrationPlatformId
  /** 必需环境变量: 缺任一则「未配置」,webhook 如实返回 503 (不冒充可用) */
  requiredEnv: readonly string[]
  optionalEnv: readonly string[]
  isConfigured(env: Record<string, string | undefined>): boolean
  /** 校验签名并归一化消息;纯函数,不落库 (落库由 webhook 路由复用 intake 创建契约) */
  handle(ctx: WebhookRequestContext): WebhookVerdict
}
