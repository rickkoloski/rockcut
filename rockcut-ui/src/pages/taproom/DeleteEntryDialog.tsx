import { Typography } from '@mui/material'
import api from '../../lib/api'
import type { BeerBoardEntry, BeerBoardWriteResult } from '../../lib/types'
import BoardActionDialog from './BoardActionDialog'

interface Props {
  entry: BeerBoardEntry | null
  onClose: () => void
  onDone: (result: BeerBoardWriteResult, verb: string) => void
  onGone?: () => void
}

/** D37: delete an entry (asks first; History keeps it). */
export default function DeleteEntryDialog({ entry, onClose, onDone, onGone }: Props) {
  if (!entry) return null

  const submit = async (staffCode?: string) => {
    const { data } = await api.delete<BeerBoardWriteResult>(`/api/beer_board/${entry.id}`, {
      data: { staff_code: staffCode },
    })
    onDone(data, `Deleted the entry for ${entry.recipient_name}`)
  }

  return (
    <BoardActionDialog
      open={!!entry}
      onClose={onClose}
      title="Delete this entry?"
      submitLabel="Delete"
      submitColor="error"
      onSubmit={submit}
      onGone={onGone}
      testId="board-delete-dialog"
    >
      <Typography>
        {entry.recipient_name}, bought by {entry.purchaser_name}: {entry.beers_remaining}{' '}
        {entry.beers_remaining === 1 ? 'beer' : 'beers'} left.
      </Typography>
    </BoardActionDialog>
  )
}
