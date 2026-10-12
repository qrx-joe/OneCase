import { NextRequest, NextResponse } from 'next/server'
import { createServiceCase, listServiceCases } from '@/lib/service-case-service'
import { serviceApiError } from '@/lib/service-api-response'

export const dynamic = 'force-dynamic'
export async function GET() {
  try { return NextResponse.json({ data: await listServiceCases() }) }
  catch (error) { return serviceApiError(error) }
}
export async function POST(request: NextRequest) {
  try { return NextResponse.json({ data: await createServiceCase(await request.json()) }) }
  catch (error) { return serviceApiError(error) }
}
