import { Box, Paper, Typography } from '@mui/material'
import { useApiQuery } from '../../hooks/useApiQuery'
import { httpStatus } from '../../lib/notFound'
import { pitchedText, pullText, type YeastBatchPage } from '../../lib/harvest'
import { shortDate } from '../../lib/yeast'

const LINE = { overflowWrap: 'anywhere' } as const

/**
 * D64 §6.6 (Stop 3): the batch page's Yeast section. Pitched: each pitch
 * into the batch, from a lot ("2 bricks Chico Ale US-05, lot F123 · Mother")
 * or from a brink ("38 lb from YB2 · US-05 gen 2"). Harvested: one line per
 * pull ("11/20 · 30 lb → YB2", "11/22 · 12 lb → YB2 (on top)"), and a Yeast
 * dumped check-off with its note. Brewery members and owners; anyone else
 * (the API's 403) sees no section.
 */
export default function BatchYeastSection({ batchId }: { batchId: number }) {
  const { data, error } = useApiQuery<YeastBatchPage>(['yeast_batch', batchId], `/api/yeast/batches/${batchId}`, undefined, {
    retry: (n: number, err: unknown) => httpStatus(err) !== 403 && n < 2,
  })
  if (error || !data) return null
  const nothing = data.pitched.length === 0 && data.harvested.length === 0 && data.dumped.length === 0

  return (
    <Box sx={{ mb: 3 }} data-testid="batch-yeast">
      <Typography variant="h5" sx={{ mb: 1 }}>
        Yeast
      </Typography>
      <Paper sx={{ p: 2, border: '1px solid', borderColor: 'divider', display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {nothing && (
          <Typography variant="body2" color="text.secondary" data-testid="batch-yeast-none">
            No yeast recorded for this batch.
          </Typography>
        )}
        {data.pitched.length > 0 && (
          <Box>
            <Typography variant="subtitle2">Pitched</Typography>
            {data.pitched.map((p, i) => (
              <Typography key={i} variant="body2" sx={LINE} data-testid="batch-yeast-pitched">
                {`${shortDate(p.occurred_on)} · ${pitchedText(p)}${p.note ? ` · ${p.note}` : ''}`}
              </Typography>
            ))}
          </Box>
        )}
        {(data.harvested.length > 0 || data.dumped.length > 0) && (
          <Box>
            <Typography variant="subtitle2">Harvested</Typography>
            {data.harvested.map((h) => (
              <Typography key={h.entry_id} variant="body2" sx={LINE} data-testid="batch-yeast-harvested">
                {`${pullText(h)}${h.note ? ` · ${h.note}` : ''}`}
              </Typography>
            ))}
            {data.dumped.map((d, i) => (
              <Typography key={`d${i}`} variant="body2" sx={LINE} data-testid="batch-yeast-dumped">
                {[d.done_on ? shortDate(d.done_on) : null, 'Yeast dumped', d.note].filter(Boolean).join(' · ')}
              </Typography>
            ))}
          </Box>
        )}
      </Paper>
    </Box>
  )
}
