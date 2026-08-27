// lib/intake-service.ts
// Intake 业务逻辑
'use server'

import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'

export async function createIntakeWithAnalysis(formData: FormData) {
  const rawText = formData.get('rawText') as string

  if (!rawText?.trim()) {
    throw new Error('rawText is required')
  }

  // 1. 创建 Intake
  const intake = await prisma.intake.create({
    data: {
      organizationId: 'demo-org',
      sourceType: 'text',
      rawText,
      status: 'PENDING',
    },
  })

  // 2. 触发 AI 分析
  const { analyzeIntake } = await import('@/lib/ai-provider')
  const result = await analyzeIntake(rawText)

  // 3. 创建 Analysis
  const analysis = await prisma.intakeAnalysis.create({
    data: {
      intakeId: intake.id,
      provider: 'mock',
      modelVersion: 'mock-v1',
      promptVersion: 'v1',
      schemaVersion: 'v1',
      status: 'COMPLETED',
      latencyMs: 100,
    },
  })

  // 4. 创建 Issues
  await prisma.intakeIssue.createMany({
    data: result.issues.map((issue, index) => ({
      analysisId: analysis.id,
      issueIndex: index,
      ...issue,
      affectedGroups: JSON.stringify(issue.affectedGroups),
      riskSignals: JSON.stringify(issue.riskSignals),
      missingInfo: JSON.stringify(issue.missingInformation),
    })),
  })

  redirect(`/intake/${intake.id}/review`)
}

export async function confirmIssue(analysisId: string, issueIndex: number, action: 'CREATE_CASE' | 'LINK_EXISTING', targetCaseId?: string) {
  // TODO: Phase 2 后续实现
  console.log('confirmIssue', { analysisId, issueIndex, action, targetCaseId })
  return { success: true }
}

export async function findDuplicateCandidates(caseNumber: string) {
  // 查找相似 Case
  const cases = await prisma.case.findMany({
    where: {
      caseNumber: {
        not: caseNumber,
      },
      status: {
        notIn: ['CLOSED', 'CANCELED'],
      },
    },
    take: 3,
  })

  return cases.map((c) => ({
    caseId: c.id,
    caseNumber: c.caseNumber,
    title: c.title,
    score: 0.6,
    matchReasons: ['Demo 候选 (未启用真实评分)'],
  }))
}
