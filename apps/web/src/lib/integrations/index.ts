// 渠道适配器注册表与配置状态 (ADR-004)
import { dingtalkAdapter } from './dingtalk'
import { feishuAdapter } from './feishu'
import { wecomAdapter } from './wecom'
import type { IntegrationAdapter, IntegrationPlatformId } from './types'

export const INTEGRATION_ADAPTERS: Record<IntegrationPlatformId, IntegrationAdapter> = {
  feishu: feishuAdapter,
  dingtalk: dingtalkAdapter,
  wecom: wecomAdapter,
}

export function getIntegrationAdapter(platform: string): IntegrationAdapter | null {
  return platform in INTEGRATION_ADAPTERS ? INTEGRATION_ADAPTERS[platform as IntegrationPlatformId] : null
}

export interface IntegrationStatus {
  platform: IntegrationPlatformId
  configured: boolean
  missing: string[]
}

/** 只报变量名,不回读任何密钥值 */
export function integrationStatusList(env: Record<string, string | undefined>): IntegrationStatus[] {
  return Object.values(INTEGRATION_ADAPTERS).map((adapter) => ({
    platform: adapter.id,
    configured: adapter.isConfigured(env),
    missing: adapter.requiredEnv.filter((key) => !env[key]),
  }))
}

export type { IntegrationAdapter, IntegrationPlatformId, NormalizedMessage, WebhookVerdict } from './types'
