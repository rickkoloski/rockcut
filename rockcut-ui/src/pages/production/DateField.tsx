import { useRef, useState } from 'react'
import TextField, { type TextFieldProps } from '@mui/material/TextField'

const isDay = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v)

type Props = Omit<TextFieldProps, 'type' | 'value' | 'defaultValue' | 'onChange'> & {
  value: string
  /** A different, complete day was committed. */
  onCommit: (day: string) => void
}

/**
 * A date field that counts a change only once it's committed (D47 QA M1):
 * on blur, on Enter, or when the picker's day is chosen. While someone types,
 * the values in between are drafts: the first keystroke already makes a
 * valid date ("1" in the month is January), so acting on every change would
 * open the move prompt mid-typing with the wrong day.
 *
 * Uncontrolled while typing: a re-render can't reset the half-typed field.
 * It shows `value` again after each commit; the committed day arrives back
 * through `value`.
 */
export default function DateField({ value, onCommit, onBlur, onKeyDown, ...props }: Props) {
  const [shown, setShown] = useState(0)
  const typing = useRef(false)
  const draft = useRef<string | null>(null)

  const commit = () => {
    const day = draft.current
    typing.current = false
    draft.current = null
    if (day === null) return
    if (isDay(day) && day !== value) onCommit(day)
    setShown((n) => n + 1)
  }

  return (
    <TextField
      {...props}
      key={`${value}-${shown}`}
      type="date"
      defaultValue={value}
      onKeyDown={(e) => {
        onKeyDown?.(e)
        if (e.key === 'Enter') {
          e.preventDefault()
          commit()
        } else if (e.key !== 'Tab' && e.key !== 'Escape') typing.current = true
      }}
      // Without a key pressed first, the change is the picker's day (or a paste): commit it.
      onChange={(e) => {
        draft.current = e.target.value
        if (!typing.current) commit()
      }}
      onBlur={(e) => {
        onBlur?.(e)
        commit()
      }}
    />
  )
}
