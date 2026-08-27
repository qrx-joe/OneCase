// packages/db/prisma/seed.ts
import { prisma } from '../src/index'

async function main() {
  console.log('🌱 Seeding OneCase demo data...')

  // 1. Organization
  const org = await prisma.organization.upsert({
    where: { slug: 'demo-community' },
    update: {},
    create: {
      name: '示例社区',
      slug: 'demo-community',
    },
  })
  console.log('✅ Organization:', org.name)

  // 2. User
  const user = await prisma.user.upsert({
    where: { email: 'demo@onecase.local' },
    update: {},
    create: {
      organizationId: org.id,
      email: 'demo@onecase.local',
      name: '李老师',
      role: 'staff',
    },
  })
  console.log('✅ User:', user.name)

  // 3. Categories
  const categories = [
    { code: 'PUBLIC_FACILITIES', name: '公共设施', color: '#007AFF' },
    { code: 'ENVIRONMENT', name: '环境卫生', color: '#34C759' },
    { code: 'NOISE', name: '噪音邻里', color: '#FF9500' },
    { code: 'SAFETY', name: '安全隐患', color: '#FF3B30' },
    { code: 'PARKING', name: '停车管理', color: '#5856D6' },
  ]

  for (const cat of categories) {
    await prisma.category.upsert({
      where: {
        organizationId_code: { organizationId: org.id, code: cat.code }
      },
      update: {},
      create: {
        organizationId: org.id,
        ...cat,
      },
    })
  }
  console.log('✅ Categories created')

  // 4. Cases (6 个)
  const cases = [
    {
      caseNumber: 'CASE-018',
      title: '3栋2单元楼道照明故障',
      summary: '3栋2单元楼道照明设施反复出现故障,多位居民反馈夜间通行较暗,存在老人通行安全风险。',
      categoryCode: 'PUBLIC_FACILITIES',
      locationText: '3栋2单元',
      priority: 'P2',
      status: 'IN_PROGRESS',
    },
    {
      caseNumber: 'CASE-016',
      title: '5栋电梯运行异常',
      summary: '5栋电梯本周多次出现异常,居民反映有异响和偶尔停靠不准。',
      categoryCode: 'PUBLIC_FACILITIES',
      locationText: '5栋',
      priority: 'P2',
      status: 'IN_PROGRESS',
    },
    {
      caseNumber: 'CASE-021',
      title: '西门口垃圾未及时清运',
      summary: '西门口附近垃圾桶满溢,垃圾清运不及时,影响周边环境卫生。',
      categoryCode: 'ENVIRONMENT',
      locationText: '西门口',
      priority: 'P3',
      status: 'OPEN',
    },
    {
      caseNumber: 'CASE-024',
      title: '中心广场夜间噪音反馈',
      summary: '夜间广场舞和居民活动噪音较大,周边居民多次投诉,影响休息。',
      categoryCode: 'NOISE',
      locationText: '中心广场',
      priority: 'P3',
      status: 'OPEN',
    },
    {
      caseNumber: 'CASE-011',
      title: '3栋1单元一层照明故障',
      summary: '3栋1单元一层楼道灯损坏,已通知物业维修,待跟进。',
      categoryCode: 'PUBLIC_FACILITIES',
      locationText: '3栋1单元',
      priority: 'P3',
      status: 'RESOLVED',
    },
    {
      caseNumber: 'CASE-009',
      title: '南门消防通道堵塞',
      summary: '南门消防通道被车辆堵塞,存在安全隐患,已通知车主移车并加强巡逻。',
      categoryCode: 'SAFETY',
      locationText: '南门',
      priority: 'P1',
      status: 'IN_PROGRESS',
    },
  ]

  for (const caseData of cases) {
    await prisma.case.upsert({
      where: { caseNumber: caseData.caseNumber },
      update: {},
      create: {
        organizationId: org.id,
        ...caseData,
      },
    })
  }
  console.log('✅ Cases created')

  // 5. Intakes (8 个)
  const intakes = [
    {
      rawText: '王主任,我们三栋二单元那个灯又坏了,我妈昨天晚上回来差点摔倒。另外楼下垃圾今天也没人清。',
      sourceType: 'text',
      status: 'ANALYZED',
    },
    {
      rawText: '三栋楼道晚上特别黑,灯好像又坏了。',
      sourceType: 'text',
      status: 'ANALYZED',
    },
    {
      rawText: '三栋二单元那个灯又坏了,我妈昨天晚上回来差点摔倒。',
      sourceType: 'text',
      status: 'ANALYZED',
    },
    {
      rawText: '五栋电梯最近总是有怪声,有时候还会停在楼层中间不动,挺吓人的。',
      sourceType: 'text',
      status: 'CONFIRMED',
    },
    {
      rawText: '西门口垃圾桶满了三天了,一直没人来收,味道很大。',
      sourceType: 'text',
      status: 'PENDING',
    },
    {
      rawText: '广场舞音乐太吵了,每天都跳到晚上九点多,家里有老人孩子实在受不了。',
      sourceType: 'text',
      status: 'PENDING',
    },
    {
      rawText: '三栋楼道路灯闪烁,已经持续好几天了,老人小孩晚上走路很危险。',
      sourceType: 'text',
      status: 'ANALYZED',
    },
    {
      rawText: '南门消防通道又被车挡住了,万一有紧急情况消防车进不来怎么办?',
      sourceType: 'text',
      status: 'CONFIRMED',
    },
  ]

  for (const intakeData of intakes) {
    await prisma.intake.create({
      data: {
        organizationId: org.id,
        ...intakeData,
      },
    })
  }
  console.log('✅ Intakes created')

  console.log('🎉 Demo seed data complete!')
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
