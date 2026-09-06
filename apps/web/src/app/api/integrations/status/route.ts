// GET /api/integrations/status - 渠道接入配置状态 (只报变量名与就绪态,不回读密钥值)
import { NextResponse } from 'next/server'
import { integrationStatusList } from '@/lib/integrations'

export async function GET() {
  return NextResponse.json({ data: integrationStatusList(process.env) })
}
