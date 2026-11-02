import { useEffect, useRef, type ReactNode } from 'react'
import { Icon } from './Icons'

interface Props {
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}

/**
 * Bottom sheet on phones, centred dialog on larger screens. Uses the native dialog element for focus and Escape.
 * Mark a field with data-autofocus to focus it on opening: showModal() overrides React's autoFocus.
 */
export function Modal({ title, onClose, children, footer }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (el && !el.open) {
      el.showModal()
      el.querySelector<HTMLElement>('[data-autofocus]')?.focus()
    }
    const onCancel = (e: globalThis.Event) => {
      e.preventDefault()
      onClose()
    }
    el?.addEventListener('cancel', onCancel)
    return () => el?.removeEventListener('cancel', onCancel)
  }, [onClose])

  // The on-screen keyboard covers the page without resizing it, so lift the sheet clear by hand.
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const sync = () => box.current?.style.setProperty('--keyboard', `${Math.max(0, window.innerHeight - vv.height - vv.offsetTop)}px`)
    sync()
    vv.addEventListener('resize', sync)
    vv.addEventListener('scroll', sync)
    return () => {
      vv.removeEventListener('resize', sync)
      vv.removeEventListener('scroll', sync)
    }
  }, [])

  return (
    <dialog ref={ref} className="modal" onClick={(e) => e.target === ref.current && onClose()}>
      <div className="modal-box" ref={box}>
        <header className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            <Icon name="close" />
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </dialog>
  )
}
