import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'OneCase - 社区事项 AI 工作台',
  description: '面向社区工作人员的 AI Intake & Case Management Layer',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  )
}
