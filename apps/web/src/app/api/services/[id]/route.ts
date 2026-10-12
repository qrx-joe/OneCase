import { NextRequest, NextResponse } from 'next/server'
import { getServiceCase, mutateServiceCase } from '@/lib/service-case-service'
import { serviceApiError } from '@/lib/service-api-response'

export const dynamic = 'force-dynamic'
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { return NextResponse.json({ data: await getServiceCase((await params).id) }) }
  catch (error) { return serviceApiError(error) }
}
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { return NextResponse.json({ data: await mutateServiceCase((await params).id, await request.json(), 'plan') }) }
  catch (error) { return serviceApiError(error) }
}
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { return NextResponse.json({ data: await mutateServiceCase((await params).id, await request.json(), 'event') }) }
  catch (error) { return serviceApiError(error) }
}
