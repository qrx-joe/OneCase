import { CreateIntakeSchema, MAX_INTAKE_TEXT_LENGTH } from '@onecase/contracts'
import { z } from 'zod'
import { imageInputError, MAX_IMAGE_BYTES } from './image-input'

export class IntakeUploadError extends Error {
  constructor(message: string, readonly status = 400) { super(message) }
}

// 单张图片，加上最多 10000 个中文字符及 multipart 边界。
const MAX_REQUEST_BYTES = MAX_IMAGE_BYTES + 64 * 1024
const ImageIntakeSchema = CreateIntakeSchema.extend({
  rawText: z.string().max(MAX_INTAKE_TEXT_LENGTH, '原始反馈不能超过 10000 字符'),
  sourceType: z.literal('image'),
})

export async function parseImageIntake(request: Request) {
  if (Number(request.headers.get('content-length')) > MAX_REQUEST_BYTES) {
    throw new IntakeUploadError('图片不能超过 10 MB。', 413)
  }
  const reader = request.body?.getReader()
  if (!reader) throw new IntakeUploadError('请选择一张图片。')
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > MAX_REQUEST_BYTES) {
        await reader.cancel()
        throw new IntakeUploadError('图片不能超过 10 MB。', 413)
      }
      chunks.push(value)
    }
  } finally { reader.releaseLock() }

  let form: FormData
  try {
    form = await new Response(Buffer.concat(chunks), {
      headers: { 'Content-Type': request.headers.get('content-type') || '' },
    }).formData()
  } catch { throw new IntakeUploadError('无法读取上传内容，请重新选择图片。') }

  const files = form.getAll('image')
  if (files.length !== 1 || typeof files[0] === 'string') {
    throw new IntakeUploadError('每次请选择一张图片。')
  }
  const file = files[0]
  const invalid = imageInputError(file)
  if (invalid) throw new IntakeUploadError(invalid, file.size > MAX_IMAGE_BYTES ? 413 : 400)
  let metadata: unknown
  try { metadata = JSON.parse(String(form.get('metadata'))) }
  catch { throw new IntakeUploadError('图片说明格式无效。') }
  const data = ImageIntakeSchema.safeParse(metadata)
  if (!data.success) throw new IntakeUploadError(data.error.issues[0].message)

  const bytes = Buffer.from(await file.arrayBuffer())
  const validHeader = file.type === 'image/png'
    ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    : file.type === 'image/jpeg'
      ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
      : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP'
  if (!validHeader) throw new IntakeUploadError('图片内容与格式不符，请使用原始 JPG、PNG 或 WebP 文件。')

  // 本地 MVP 复用 Attachment 表，不放到 public，不创建公开文件地址。
  return {
    data: data.data,
    attachment: { type: 'image', mimeType: file.type, size: file.size,
      url: `data:${file.type};base64,${bytes.toString('base64')}` },
  }
}
