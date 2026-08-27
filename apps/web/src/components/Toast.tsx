// components/Toast.tsx
'use client'

import { createContext, useContext, useState, ReactNode, useCallback } from 'react'

interface Toast {
  id: string
  title: string
  message?: string
  type?: 'success' | 'error' | 'info'
}

interface ToastContextType {
  showToast: (title: string, message?: string, type?: 'success' | 'error' | 'info') => void
}

const ToastContext = createContext<ToastContextType | undefined>(undefined)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const showToast = useCallback((title: string, message?: string, type?: 'success' | 'error' | 'info') => {
    const id = Date.now().toString()
    setToasts((prev) => [...prev, { id, title, message, type }])

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 3000)
  }, [])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed right-4 top-4 z-50 space-y-2">
        {toasts.map((toast) => (
          <div key={toast.id} className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 min-w-[280px] max-w-[370px] animate-in slide-in-from-right">
            <div className="flex gap-2">
              <div className="text-green-500 text-lg">✓</div>
              <div className="flex-1">
                <p className="text-sm font-semibold">{toast.title}</p>
                {toast.message && (
                  <p className="text-xs text-gray-500 mt-0.5">{toast.message}</p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within ToastProvider')
  }
  return context
}
