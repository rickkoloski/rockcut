import { TextField, type TextFieldProps } from '@mui/material'
import { parseDecimal } from '../lib/brewingUnits'

type DecimalInputProps = Omit<TextFieldProps, 'value' | 'onChange' | 'type'> & {
  /** What's in the box, as typed. */
  value: string
  onChange: (text: string) => void
  /** The places the field keeps; more are refused ("Use at most N decimals", D61 carry-over 4). */
  decimals?: number
}

/**
 * D60 (4982): every number box on the ingredient screens. A text box with the
 * decimal keypad; `.` is the decimal point and commas only separate thousands
 * (gap 3, `parseDecimal`); anything else shows a message under the box. The form sends `parseDecimal(value)`'s
 * string, never the box's text, and doesn't send while it's refused; it
 * checks with the same `decimals`.
 */
export default function DecimalInput({ value, onChange, decimals, helperText, error, slotProps, ...props }: DecimalInputProps) {
  const parsed = parseDecimal(value, decimals)
  return (
    <TextField
      {...props}
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      error={error || !parsed.ok}
      helperText={parsed.ok ? helperText : parsed.error}
      slotProps={{ ...slotProps, htmlInput: { inputMode: 'decimal', autoComplete: 'off', ...(slotProps?.htmlInput as object) } }}
    />
  )
}
