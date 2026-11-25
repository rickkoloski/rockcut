import { useState } from 'react'
import { Button, FormControl, FormControlLabel, InputLabel, MenuItem, Select, Switch, TextField } from '@mui/material'
import FormDialog from '../../components/FormDialog'
import DecimalInput from '../../components/DecimalInput'
import { useApiList } from '../../hooks/useApiQuery'
import { useApiCreate, useApiDelete, useApiUpdate } from '../../hooks/useApiMutation'
import parseApiError from '../../lib/parseApiError'
import { LB_DECIMALS, packSizeLabel, parseDecimal, unitDecimals } from '../../lib/brewingUnits'
import { GRAIN_KEYS } from '../../lib/inventory'
import { isD65Key } from '../../lib/ingredientFeatures'
import { defaultPackName, packNoteHelper } from '../../lib/purchasing'
import type { IngredientCategory, Party, SupplierOffer } from '../../lib/types'

interface OfferDialogProps {
  open: boolean
  onClose: () => void
  productId: number
  /** The product's unit (lb for grain). */
  unit?: string
  /** D62: the product's category key; hops are always box · 11 lb. */
  categoryKey?: string | null
  /** D65: the product's category (its pack names) and stored unit (its default pack). */
  categoryId?: number | null
  storedUnit?: string
  /** D64 §4.1: the product's form (a yeast offer's packs follow it). */
  productForm?: string | null
  offer?: SupplierOffer
}

/**
 * D60 §3.6: how a supplier sells a product: order name, pack (D62 §3.5: a
 * sack and its size, for grain), milled or whole. D62 decision 6: a hop
 * offer is always a box of 11 lb, shown and not editable (the API sets it).
 * D65 §4.2: a fruit, spice, sugar or other consumable offer picks its pack
 * from the category's names, starting with the unit's usual one (lb → bag,
 * gal → pail, …); an `each` pack size is whole.
 */
export default function OfferDialog(props: OfferDialogProps) {
  return props.open ? <OfferForm {...props} /> : null
}

function OfferForm({ onClose, productId, unit = 'lb', categoryKey, categoryId, storedUnit, productForm: form, offer }: OfferDialogProps) {
  const hops = categoryKey === 'hops'
  const d65 = isD65Key(categoryKey)
  const { data: categories = [] } = useApiList<IngredientCategory>(['ingredient_categories'], '/api/ingredient_categories')
  const catalog = categories.find((c) => c.id === categoryId)?.catalog
  // D64 §4.1: a yeast offer's packs follow the product's form (Dry brick or case, Liquid pitchable or case).
  const formPack = form ? catalog?.form_packs?.[form] : undefined
  const packNames = formPack ? [formPack, 'case'] : (catalog?.pack_names ?? [])
  const { data: parties = [], isLoading: partiesLoading } = useApiList<Party>(['parties'], '/api/parties')
  // Lead decisions 2 (item 4): Save waits for the lists; until they're in, the selects are empty.
  const listsLoading = partiesLoading
  const [supplierId, setSupplierId] = useState<number | ''>(offer?.supplier_party_id ?? '')
  const [orderName, setOrderName] = useState(offer?.order_name ?? '')
  const [packSize, setPackSize] = useState(offer?.pack_size ?? (hops ? '11' : categoryKey === 'yeast' ? '1' : d65 ? '' : '55'))
  // D62 §3.5: grain offers are sacks, hop offers 11 lb boxes; D65: picked (null: the unit's usual pack).
  const [pickedPack, setPickedPack] = useState<string | null>(offer?.pack_name ?? null)
  const packName = pickedPack ?? (hops ? 'box' : (formPack ?? (d65 ? (defaultPackName(catalog?.default_packs, storedUnit, packNames) ?? 'pack') : 'sack')))
  const [grainForm, setGrainForm] = useState<'milled' | 'whole'>(offer?.form ?? 'whole')
  const [notes, setNotes] = useState(offer?.notes ?? '')
  // D65 (A16): a note on the pack, "5 lb" for a tub of 872 tablets.
  const [packNote, setPackNote] = useState(offer?.pack_note ?? '')
  const [active, setActive] = useState(offer?.active ?? true)
  const [error, setError] = useState<string | null>(null)

  const suppliers = parties.filter((p) => p.roles?.includes('supplier') && (p.active || p.id === offer?.supplier_party_id))
  const create = useApiCreate<SupplierOffer>('/api/supplier_offers', { invalidateKeys: GRAIN_KEYS })
  const update = useApiUpdate<SupplierOffer>((id) => `/api/supplier_offers/${id}`, { invalidateKeys: GRAIN_KEYS })
  const remove = useApiDelete((id) => `/api/supplier_offers/${id}`, { invalidateKeys: GRAIN_KEYS })
  const loading = create.isPending || update.isPending || remove.isPending
  // An `each` pack size is whole (D65 §4.3).
  const size = parseDecimal(packSize, d65 ? unitDecimals(storedUnit) : LB_DECIMALS)

  const submit = async () => {
    if (!supplierId) return setError('Pick the supplier')
    if (!size.ok || size.value == null) return setError(`Enter the ${packName} size in ${unit}`)
    const payload = {
      product_id: productId,
      supplier_party_id: supplierId,
      order_name: orderName.trim() || null,
      // A hop offer's pack is the API's to set.
      // Milled or whole is grain's; the API refuses a form on a hop offer (lead decisions 1, gap 3).
      ...(hops ? {} : d65 ? { pack_name: packName, pack_size: size.value, pack_note: packNote.trim() || null } : { pack_name: packName, pack_size: size.value, form: grainForm }),
      notes: notes.trim() || null,
      active,
    }
    try {
      if (offer) await update.mutateAsync({ id: offer.id, ...payload })
      else await create.mutateAsync(payload)
      onClose()
    } catch (err) {
      setError(parseApiError(err))
    }
  }

  const packHint = packNoteHelper({ pack_name: packName, pack_size: size.ok ? size.value : null, pack_note: packNote }, unit)

  return (
    <FormDialog
      open
      phone
      onClose={onClose}
      title={offer ? 'Edit supplier offer' : 'Add supplier offer'}
      onSubmit={submit}
      loading={loading}
      error={error}
      submitDisabled={listsLoading || !size.ok}
      testId="offer-dialog"
      secondaryAction={
        offer && (
          <Button
            color="error"
            disabled={loading}
            onClick={() =>
              remove
                .mutateAsync(offer.id)
                .then(onClose)
                .catch((err) => setError(parseApiError(err)))
            }
          >
            Delete
          </Button>
        )
      }
    >
      <FormControl fullWidth required>
        <InputLabel id="offer-supplier-label">Supplier</InputLabel>
        <Select labelId="offer-supplier-label" id="offer-supplier" label="Supplier" value={suppliers.length ? supplierId : ''} onChange={(e) => setSupplierId(e.target.value as number)} data-testid="offer-supplier">
          {suppliers.map((p) => (
            <MenuItem key={p.id} value={p.id}>
              {p.name}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      <TextField label="Order name" helperText="The supplier's catalog name" value={orderName} onChange={(e) => setOrderName(e.target.value)} fullWidth />
      {d65 && (
        <FormControl fullWidth required>
          <InputLabel id="offer-pack-label">Pack</InputLabel>
          <Select labelId="offer-pack-label" id="offer-pack" label="Pack" value={packNames.includes(packName) ? packName : ''} onChange={(e) => setPickedPack(e.target.value)} data-testid="offer-pack-name">
            {packNames.map((n) => (
              <MenuItem key={n} value={n}>
                {n}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      )}
      {hops ? (
        <TextField label="Pack" value={`box · 11 ${unit}`} fullWidth disabled helperText="Hops always come in 11 lb boxes" slotProps={{ htmlInput: { 'data-testid': 'offer-pack-fixed' } }} />
      ) : (
        <DecimalInput
          decimals={d65 ? unitDecimals(storedUnit) : LB_DECIMALS}
          label={packSizeLabel(packName, unit)}
          value={packSize}
          onChange={setPackSize}
          required
          fullWidth
          slotProps={{ htmlInput: { 'data-testid': 'offer-pack-size' } }}
        />
      )}
      {d65 && (
        <TextField
          label="Pack note"
          helperText={packHint}
          value={packNote}
          onChange={(e) => setPackNote(e.target.value)}
          fullWidth
          slotProps={{ htmlInput: { maxLength: 40, 'data-testid': 'offer-pack-note' } }}
        />
      )}
      {!hops && !d65 && (
        <FormControl fullWidth>
          <InputLabel id="offer-form-label">We order it</InputLabel>
          <Select labelId="offer-form-label" id="offer-form" label="We order it" value={grainForm} onChange={(e) => setGrainForm(e.target.value as 'milled' | 'whole')}>
            <MenuItem value="whole">Whole</MenuItem>
            <MenuItem value="milled">Milled</MenuItem>
          </Select>
        </FormControl>
      )}
      <TextField label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} multiline rows={2} fullWidth />
      {offer && <FormControlLabel control={<Switch checked={active} onChange={(e) => setActive(e.target.checked)} />} label="Active" />}
    </FormDialog>
  )
}
