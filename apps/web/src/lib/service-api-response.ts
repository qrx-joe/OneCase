import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { ServiceError } from './service-record'

export function serviceApiError(error: unknown) {
  if (error instanceof ServiceError) return NextResponse.json({ error: error.code, message: error.message }, { status: error.status })
  if (error instanceof ZodError) return NextResponse.json({ error: 'INVALID_REQUEST', message: error.issues[0]?.message || '请核对输入' }, { status: 400 })
  if (error instanceof SyntaxError) return NextResponse.json({ error: 'INVALID_REQUEST', message: '请求格式错误' }, { status: 400 })
  console.error('Service operation failed:', error)
  return NextResponse.json({ error: 'INTERNAL_ERROR', message: '服务记录未保存，请重试' }, { status: 500 })
}
