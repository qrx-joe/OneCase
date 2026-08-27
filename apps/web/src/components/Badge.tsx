// components/Badge.tsx
import React from 'react'

interface BadgeProps {
  children: React.ReactNode
  variant?: 'blue' | 'green' | 'orange' | 'red' | 'purple' | 'gray'
  className?: string
}

export function Badge({ children, variant = 'blue', className = '' }: BadgeProps) {
  const variants = {
    blue: 'bg-oc-blue-soft text-blue-700',
    green: 'bg-oc-green-soft text-green-700',
    orange: 'bg-oc-orange-soft text-orange-700',
    red: 'bg-oc-red-soft text-red-700',
    purple: 'bg-oc-purple-soft text-purple-700',
    gray: 'bg-gray-100 text-gray-600',
  }

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${variants[variant]} ${className}`}>
      {children}
    </span>
  )
}
