import { TextField } from '@mui/material'
import { maskedCodeSx, staffCodeDigits } from '../lib/staffCode'

interface Props {
  value: string
  onChange: (code: string) => void
  error?: string | null
  helperText?: string
  testId: string
  autoFocus?: boolean
}

/**
 * D37: the staff-code input on a shared tablet: 4 digits, numeric keypad,
 * masked. Shared by the Buy-a-Beer Board's dialogs and (D40) the task
 * boards' code dialog.
 */
export default function StaffCodeField({ value, onChange, error, helperText, testId, autoFocus }: Props) {
  return (
    <TextField
      label="Your staff code"
      value={value}
      onChange={(e) => onChange(staffCodeDigits(e.target.value))}
      error={!!error}
      helperText={error ?? helperText}
      autoComplete="off"
      autoFocus={autoFocus}
      sx={maskedCodeSx}
      slotProps={{ htmlInput: { inputMode: 'numeric', 'data-testid': testId } }}
    />
  )
}
