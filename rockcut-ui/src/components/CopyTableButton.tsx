import { useState, type RefObject } from 'react'
import { Box, Button, Typography } from '@mui/material'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'

interface CopyTableButtonProps {
  /** The table as TSV (`lib/tsv`), built when clicked. */
  text: () => string
  /** The table, selected instead when the clipboard is refused. */
  table: RefObject<HTMLElement | null>
  testId?: string
}

/**
 * D61 §3.6 (decision 36): copies a totals table as tab-separated text so it
 * pastes into a spreadsheet as columns, and says "Copied". Where the
 * clipboard is refused (an old browser, a denied permission) it selects the
 * table instead and says to copy it by hand.
 */
export default function CopyTableButton({ text, table, testId }: CopyTableButtonProps) {
  const [note, setNote] = useState<string | null>(null)

  const copy = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('no clipboard')
      await navigator.clipboard.writeText(text())
      setNote('Copied')
    } catch {
      const el = table.current
      const selection = window.getSelection()
      if (el && selection) {
        const range = document.createRange()
        range.selectNodeContents(el)
        selection.removeAllRanges()
        selection.addRange(range)
      }
      setNote('The table is selected: copy it with Ctrl+C (⌘C)')
    }
    window.setTimeout(() => setNote(null), 4000)
  }

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      <Button variant="outlined" size="small" startIcon={<ContentCopyIcon />} onClick={copy} data-testid={testId}>
        Copy
      </Button>
      {note && (
        <Typography variant="body2" color="text.secondary" role="status" data-testid={testId && `${testId}-note`}>
          {note}
        </Typography>
      )}
    </Box>
  )
}
