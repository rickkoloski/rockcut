import { useState } from 'react'
import {
  Chip,
  FormControl,
  FormControlLabel,
  FormHelperText,
  InputLabel,
  MenuItem,
  Radio,
  RadioGroup,
  Select,
  TextField,
  Typography,
} from '@mui/material'
import FormDialog from '../../components/FormDialog'
import ConfirmDialog from '../../components/ConfirmDialog'
import DecimalInput from '../../components/DecimalInput'
import { WRAP_ITEM, WRAP_SELECT } from '../../lib/ingredientFeatures'
import { emptyWeightText, readLb } from '../../lib/yeast'
import {
  brinkOption,
  harvestBody,
  harvestError,
  harvestQuestion,
  initialHarvest,
  readGeneration,
  type HarvestForm,
  type HarvestPreview,
  type HarvestQuestion,
} from '../../lib/harvest'

/** What a send answers: done, or why not (a 409 `yeast_question` asks one of the two questions). */
export type HarvestSendResult = { ok: true } | { ok: false; error: string; code?: string; body?: Record<string, unknown> }

interface Props {
  stepName: string
  batchLabel: string | null
  yeast: HarvestPreview
  /** The check-off with the dialog's fields (and an answer); the flow writes it, with the staff code on the device. */
  onSend: (body: Record<string, unknown>, form: HarvestForm) => Promise<HarvestSendResult | null>
  onCancel: () => void
  onDone: () => void
}

/**
 * D64 §5.2 (Stop 3): checking off a Yeast harvest step. Harvest yeast (the
 * brink, the yeast weight with the brink's empty weight beside it, the
 * strains and generation from what was pitched, editable, or asked when
 * nothing was) or Yeast dumped, each with a note. On Save, a dirty brink and
 * a brink with yeast in it are asked one at a time (dirty first), and the
 * check-off is sent again with the answer. One press at a time (FormDialog's
 * and ConfirmDialog's gates). The same dialog on the Gantt, the Brewery board
 * and the brewhouse device (`flows.checkOff`).
 */
export default function HarvestDialog({ stepName, batchLabel, yeast, onSend, onCancel, onDone }: Props) {
  const [form, setForm] = useState<HarvestForm>(() => initialHarvest(yeast))
  const [answers, setAnswers] = useState<Record<string, unknown>>({})
  const [question, setQuestion] = useState<HarvestQuestion | null>(null)
  const [error, setError] = useState<string | null>(null)
  const set = (patch: Partial<HarvestForm>) => setForm((f) => ({ ...f, ...patch }))
  const harvesting = form.outcome === 'harvested'
  const brink = yeast.brinks.find((b) => b.id === form.brinkId) ?? null
  const lb = readLb(form.lb)
  const generationError = form.generation.trim() !== '' && readGeneration(form.generation) == null ? 'A whole number, 1 or more' : null
  const asked = yeast.defaults == null

  // A changed brink is a new question: earlier answers were about the old one.
  const pickBrink = (id: number) => {
    set({ brinkId: id })
    setAnswers({})
  }

  const send = async (extra: Record<string, unknown>) => {
    const all = { ...answers, ...extra }
    const r = await onSend({ ...harvestBody(form), ...all }, form)
    if (r == null) return // a cancelled staff-code dialog: stay, nothing sent
    if (r.ok) return onDone()
    const q = harvestQuestion(r.body)
    if (q) {
      setAnswers(all)
      setError(null)
      setQuestion(q)
      return
    }
    setQuestion(null)
    setError(r.error)
  }

  const submit = async () => {
    const problem = harvestError(form)
    if (problem) return setError(problem)
    setError(null)
    await send({})
  }

  return (
    <>
      <FormDialog
        open
        phone
        onClose={onCancel}
        title={stepName}
        onSubmit={submit}
        error={error}
        submitLabel="Save"
        submitDisabled={harvesting && (!!lb.error || !!generationError)}
        testId="harvest-dialog"
      >
        {batchLabel && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: -1 }} data-testid="harvest-batch">
            {batchLabel}
          </Typography>
        )}
        <RadioGroup row value={form.outcome} onChange={(e) => set({ outcome: e.target.value as HarvestForm['outcome'] })}>
          <FormControlLabel value="harvested" control={<Radio slotProps={{ input: { 'data-testid': 'harvest-outcome-harvested' } as object }} />} label="Harvest yeast" />
          <FormControlLabel value="dumped" control={<Radio slotProps={{ input: { 'data-testid': 'harvest-outcome-dumped' } as object }} />} label="Yeast dumped" />
        </RadioGroup>
        {harvesting && (
          <>
            {/* The asterisk only: the dialog says what's missing ("Pick the brink"), not the browser. */}
            <FormControl fullWidth>
              <InputLabel id="harvest-brink-label" required>Brink</InputLabel>
              <Select
                labelId="harvest-brink-label"
                label="Brink"
                value={form.brinkId}
                onChange={(e) => pickBrink(e.target.value as number)}
                sx={WRAP_SELECT}
                data-testid="harvest-brink"
              >
                {yeast.brinks.map((b) => (
                  <MenuItem key={b.id} value={b.id} sx={WRAP_ITEM} data-testid={`harvest-brink-option-${b.id}`}>
                    {brinkOption(b)}
                  </MenuItem>
                ))}
              </Select>
              {yeast.brinks.length === 0 && <FormHelperText>No brinks. A Brewery manager adds them in Yeast settings.</FormHelperText>}
            </FormControl>
            <DecimalInput
              decimals={2}
              label="Yeast weight (lb)"
              value={form.lb}
              onChange={(v) => set({ lb: v })}
              required
              fullWidth
              error={!!lb.error}
              helperText={lb.error ?? (brink ? emptyWeightText(brink) : null) ?? undefined}
              slotProps={{ htmlInput: { 'data-testid': 'harvest-lb' }, formHelperText: { 'data-testid': 'harvest-lb-helper' } as object }}
            />
            {asked && (
              <Typography variant="body2" color="text.secondary" data-testid="harvest-asked">
                Nothing was recorded as pitched into this batch. Pick the strain and the generation (lab yeast is the Mother, so its first harvest is gen 1).
              </Typography>
            )}
            {/* The asterisk only: the dialog says what's missing ("Pick the brink"), not the browser. */}
            <FormControl fullWidth>
              <InputLabel id="harvest-strains-label" required>Strain</InputLabel>
              <Select
                labelId="harvest-strains-label"
                label="Strain"
                multiple
                value={form.productIds}
                onChange={(e) => set({ productIds: (e.target.value as number[]).slice().sort((a, b) => a - b) })}
                renderValue={(ids) => (
                  <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {(ids as number[]).map((id) => (
                      <Chip key={id} size="small" label={yeast.products.find((p) => p.id === id)?.code ?? id} />
                    ))}
                  </span>
                )}
                sx={WRAP_SELECT}
                data-testid="harvest-strains"
              >
                {yeast.products.map((p) => (
                  <MenuItem key={p.id} value={p.id} sx={WRAP_ITEM} data-testid={`harvest-strain-option-${p.id}`}>
                    {p.label ?? p.code}
                  </MenuItem>
                ))}
              </Select>
              {form.productIds.length > 1 && <FormHelperText data-testid="harvest-coferment">Two or more strains make a co-ferment.</FormHelperText>}
            </FormControl>
            <TextField
              label="Generation"
              value={form.generation}
              onChange={(e) => set({ generation: e.target.value })}
              required
              fullWidth
              error={!!generationError}
              helperText={generationError ?? (asked ? undefined : 'From what was pitched into the batch')}
              slotProps={{ htmlInput: { inputMode: 'numeric', 'data-testid': 'harvest-generation' } }}
            />
          </>
        )}
        <TextField
          label="Note"
          value={form.note}
          onChange={(e) => set({ note: e.target.value })}
          multiline
          minRows={2}
          fullWidth
          slotProps={{ htmlInput: { maxLength: 2000, 'data-testid': 'harvest-note' } }}
        />
      </FormDialog>
      {question?.kind === 'dirty' && (
        <ConfirmDialog
          open
          title="Dirty brink"
          message={question.message}
          confirmLabel="Record anyway"
          confirmColor="primary"
          testId="harvest-question-dirty"
          onClose={() => setQuestion(null)}
          onConfirm={() => send({ yeast_dirty_ok: true })}
        />
      )}
      {question?.kind === 'has_yeast' && (
        <ConfirmDialog
          open
          title="Yeast in the brink"
          message={question.message}
          confirmLabel="Harvest on top"
          confirmColor="primary"
          cancelLabel="This brink is empty"
          testId="harvest-question-has-yeast"
          onClose={() => setQuestion(null)}
          onCancel={() => send({ yeast_brink_answer: 'empty' })}
          onConfirm={() => send({ yeast_brink_answer: 'on_top' })}
        />
      )}
    </>
  )
}
