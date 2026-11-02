import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { mutations } from '../api/hooks'
import type { PlanEntry, Slot } from '../api/types'
import { fmtDay, mondayOf } from '../lib/dates'
import { useToast } from './Toast'

let saving = 0

/** Write a plan cell, showing it straight away. Empty text clears the cell. */
export function useSetCell() {
  const qc = useQueryClient()
  const toast = useToast()
  return async (date: string, slot: Slot, text: string) => {
    saving++
    await qc.cancelQueries({ queryKey: ['plan'] })
    qc.setQueryData<PlanEntry[]>(['plan', mondayOf(date)], (old = []) => {
      const rest = old.filter((p) => !(p.date === date && p.slot === slot))
      return text ? [...rest, { id: `plan:${date}:${slot}`, date, slot, text }] : rest
    })
    try {
      if (text) await mutations.setCell(date, slot, { text })
      else await mutations.clearCell(date, slot)
    } catch (e) {
      toast((e as Error).message)
    } finally {
      // Refetching before the last of several quick saves lands would flash the earlier state.
      if (--saving === 0) void qc.invalidateQueries({ queryKey: ['plan'] })
    }
  }
}

/** One slot of the plan: type, then move on. Saves on Enter or on leaving the field; clearing the text clears the cell. */
export function MealInput({ date, slot, saved = '' }: { date: string; slot: Slot; saved?: string }) {
  const [value, setValue] = useState(saved)
  const ref = useRef<HTMLTextAreaElement>(null)
  const setCell = useSetCell()

  useEffect(() => {
    if (document.activeElement !== ref.current) setValue(saved)
  }, [saved])

  // Grow to fit long names. A textarea only because an input cannot wrap.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [value])

  const commit = () => {
    const text = value.trim()
    setValue(text)
    if (text !== saved) void setCell(date, slot, text)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') {
      setValue(saved)
      e.currentTarget.dataset.cancelled = '1'
      e.currentTarget.blur()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const all = [...document.querySelectorAll<HTMLTextAreaElement>('textarea.meal-input')]
      const next = all[all.indexOf(e.currentTarget) + 1]
      if (next) next.focus()
      else e.currentTarget.blur()
    }
  }

  return (
    <textarea
      ref={ref}
      className="meal-input"
      rows={1}
      value={value}
      placeholder={`Add ${slot}`}
      aria-label={`${slot} on ${fmtDay(date)}`}
      maxLength={200}
      enterKeyHint="next"
      autoCapitalize="sentences"
      onChange={(e) => setValue(e.target.value.replace(/\s*\n\s*/g, ' '))}
      onKeyDown={onKeyDown}
      onBlur={(e) => {
        if (e.currentTarget.dataset.cancelled) delete e.currentTarget.dataset.cancelled
        else commit()
      }}
    />
  )
}
