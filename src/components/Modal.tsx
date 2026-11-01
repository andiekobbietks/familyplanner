import { useEffect, useRef, type ReactNode } from 'react'

interface Props {
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}

/** Bottom sheet on phones, centred dialog on larger screens. Uses the native dialog element for focus and Escape. */
export function Modal({ title, onClose, children, footer }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const el = ref.current
    if (el && !el.open) el.showModal()
    const onCancel = (e: globalThis.Event) => {
      e.preventDefault()
      onClose()
    }
    el?.addEventListener('cancel', onCancel)
    return () => el?.removeEventListener('cancel', onCancel)
  }, [onClose])

  return (
    <dialog ref={ref} className="modal" onClick={(e) => e.target === ref.current && onClose()}>
      <div className="modal-box">
        <header className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </dialog>
  )
}
