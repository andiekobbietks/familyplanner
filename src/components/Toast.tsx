import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'

interface ToastOptions {
  action?: { label: string; onClick: () => void }
  duration?: number
}
interface ToastItem extends ToastOptions {
  id: number
  message: string
}

const ToastContext = createContext<(message: string, opts?: ToastOptions) => void>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const seq = useRef(0)

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), [])

  const toast = useCallback(
    (message: string, opts: ToastOptions = {}) => {
      const id = ++seq.current
      setToasts((t) => [...t.slice(-2), { id, message, ...opts }])
      setTimeout(() => dismiss(id), opts.duration ?? 3000)
    },
    [dismiss],
  )

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="toast">
            <span>{t.message}</span>
            {t.action && (
              <button
                type="button"
                className="toast-action"
                onClick={() => {
                  t.action!.onClick()
                  dismiss(t.id)
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)
