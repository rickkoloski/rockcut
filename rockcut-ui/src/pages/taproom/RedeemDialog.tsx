import { useState } from 'react'
import { Alert, Box, IconButton, Typography } from '@mui/material'
import { Add, Remove } from '@mui/icons-material'
import api from '../../lib/api'
import type { BeerBoardEntry, BeerBoardWriteResult } from '../../lib/types'
import BoardActionDialog from './BoardActionDialog'

interface Props {
  entry: BeerBoardEntry | null
  onClose: () => void
  onDone: (result: BeerBoardWriteResult, verb: string) => void
  onGone?: () => void
}

/** D37: redeem beers from an entry; 1 by default, a stepper for more. */
export default function RedeemDialog({ entry, onClose, onDone, onGone }: Props) {
  // The board remounts this dialog (a `key`) per entry, so it starts at 1.
  const [count, setCount] = useState(1)

  if (!entry) return null
  const max = entry.beers_remaining
  const last = count === max

  const submit = async (staffCode?: string) => {
    const { data } = await api.post<BeerBoardWriteResult>(`/api/beer_board/${entry.id}/redeem`, {
      count,
      staff_code: staffCode,
    })
    onDone(data, `Redeemed ${count} for ${entry.recipient_name}`)
  }

  return (
    <BoardActionDialog
      open={!!entry}
      onClose={onClose}
      title={`Redeem for ${entry.recipient_name}`}
      submitLabel={last ? 'Redeem the last' : 'Redeem'}
      onSubmit={submit}
      onGone={onGone}
      testId="board-redeem-dialog"
    >
      <Typography variant="body2" color="text.secondary">
        Bought by {entry.purchaser_name} · {max} left
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, justifyContent: 'center' }}>
        <IconButton
          aria-label="One fewer"
          onClick={() => setCount((c) => Math.max(1, c - 1))}
          disabled={count <= 1}
          size="large"
          data-testid="board-redeem-minus"
        >
          <Remove />
        </IconButton>
        <Typography variant="h4" component="span" data-testid="board-redeem-count" sx={{ minWidth: 48, textAlign: 'center' }}>
          {count}
        </Typography>
        <IconButton
          aria-label="One more"
          onClick={() => setCount((c) => Math.min(max, c + 1))}
          disabled={count >= max}
          size="large"
          data-testid="board-redeem-plus"
        >
          <Add />
        </IconButton>
      </Box>
      {last && (
        <Alert severity="warning" data-testid="board-redeem-last">
          This uses the last {max === 1 ? 'beer' : `${max} beers`} for {entry.recipient_name} and removes the entry.
        </Alert>
      )}
    </BoardActionDialog>
  )
}
