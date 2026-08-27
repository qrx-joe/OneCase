// lib/demo-context.ts
// Demo 模式组织解析: 把 'demo-org' 别名解析为 seed 组织的真实 cuid
// 背景: seed 数据用真实 cuid,API 层调用方传 'demo-org' 别名,
//      统一在此转换,避免各端点各自硬编码

let cachedOrgId: string | null = null

/**
 * 解析 Demo 组织 id
 * - 传入 'demo-org' (或空) → 返回 seed 组织的 cuid (查库,进程内缓存)
 * - 传入其他值 → 原样返回 (未来多租户直传)
 */
export async function resolveOrgId(organizationId?: string): Promise<string> {
  if (organizationId && organizationId !== 'demo-org') {
    return organizationId
  }

  if (cachedOrgId) {
    return cachedOrgId
  }

  const { prisma } = await import('./prisma')
  const org = await prisma.organization.findUnique({
    where: { slug: 'demo-community' },
  })

  if (!org) {
    // seed 未执行过: 退回字面量,让调用方拿到空结果而非报错
    return 'demo-org'
  }

  cachedOrgId = org.id
  return cachedOrgId
}
