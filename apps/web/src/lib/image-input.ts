export const MAX_IMAGE_BYTES = 10 * 1024 * 1024
export const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp']

export function imageInputError(file: { size: number; type: string }): string | null {
  if (!IMAGE_MIME_TYPES.includes(file.type)) return '请选择 JPG、PNG 或 WebP 图片。'
  if (file.size === 0) return '图片为空，请重新选择。'
  if (file.size > MAX_IMAGE_BYTES) return '图片不能超过 10 MB。'
  return null
}
