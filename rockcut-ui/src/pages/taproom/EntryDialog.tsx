import { useState } from 'react'
import { TextField } from '@mui/material'
import api from '../../lib/api'
import type { BeerBoardEntry, BeerBoardWriteResult } from '../../lib/types'
import BoardActionDialog from './BoardActionDialog'

interface Props {
  open: boolean
  onClose: () => void
  /** null = Add from chalkboard; an entry = Edit. */
  entry: BeerBoardEntry | null
  onDone: (result: BeerBoardWriteResult, verb: string) => void
  onGone?: () => void
}

/** D37: add a chalkboard line, or correct one (names, beers left). */
export default function EntryDialog({ open, onClose, entry, onDone, onGone }: Props) {
  // The board remounts this dialog (a `key`) for each add or edit.
  const [recipient, setRecipient] = useState(entry?.recipient_name ?? '')
  const [purchaser, setPurchaser] = useState(entry?.purchaser_name ?? '')
  const [beers, setBeers] = useState(String(entry?.beers_remaining ?? 1))

  const n = Number(beers)
  const valid = recipient.trim() !== '' && purchaser.trim() !== '' && Number.isInteger(n) && n >= 1 && n <= 99

  const submit = async (staffCode?: string) => {
    const body = { recipient_name: recipient, purchaser_name: purchaser, staff_code: staffCode }
    const { data } = entry
      ? await api.patch<BeerBoardWriteResult>(`/api/beer_board/${entry.id}`, { ...body, beers_remaining: n })
      : await api.post<BeerBoardWriteResult>('/api/beer_board', { ...body, beers: n })
    onDone(data, entry ? 'Saved' : 'Added')
  }

  return (
    <BoardActionDialog
      open={open}
      onClose={onClose}
      title={entry ? 'Edit entry' : 'Add from chalkboard'}
      submitLabel={entry ? 'Save' : 'Add'}
      onSubmit={submit}
      submitDisabled={!valid}
      onGone={onGone}
      testId="board-entry-dialog"
    >
      <TextField
        label="For"
        value={recipient}
        onChange={(e) => setRecipient(e.target.value)}
        required
        autoFocus
        slotProps={{ htmlInput: { maxLength: 80, 'data-testid': 'board-recipient' } }}
      />
      <TextField
        label="Bought by"
        value={purchaser}
        onChange={(e) => setPurchaser(e.target.value)}
        required
        slotProps={{ htmlInput: { maxLength: 80, 'data-testid': 'board-purchaser' } }}
      />
      <TextField
        label={entry ? 'Beers left' : 'Beers'}
        type="number"
        value={beers}
        onChange={(e) => setBeers(e.target.value)}
        required
        error={beers !== '' && !(Number.isInteger(n) && n >= 1 && n <= 99)}
        helperText="1 to 99"
        slotProps={{ htmlInput: { min: 1, max: 99, inputMode: 'numeric', 'data-testid': 'board-beers' } }}
      />
    </BoardActionDialog>
  )
}
