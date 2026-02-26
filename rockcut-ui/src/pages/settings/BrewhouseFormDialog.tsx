import { useState, useEffect } from 'react';
import { TextField, MenuItem, FormControlLabel, Checkbox } from '@mui/material';
import FormDialog from '../../components/FormDialog';
import { useApiCreate, useApiUpdate } from '../../hooks/useApiMutation';
import parseApiError from '../../lib/parseApiError';
import type { Brewhouse } from '../../lib/types';

interface Props {
  open: boolean;
  onClose: () => void;
  brewhouse?: Brewhouse;
}

export default function BrewhouseFormDialog({ open, onClose, brewhouse }: Props) {
  const [name, setName] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [notes, setNotes] = useState('');
  const [tempUnit, setTempUnit] = useState('F');
  const [liquidVolUnit, setLiquidVolUnit] = useState('bbls');
  const [densityUnit, setDensityUnit] = useState('sg');
  const [alcoholUnit, setAlcoholUnit] = useState('abv');
  const [densityCalcMethod, setDensityCalcMethod] = useState('ppg');
  const [ibuCalcMethod, setIbuCalcMethod] = useState('tinseth');
  const [ingredientWeightUnit, setIngredientWeightUnit] = useState('lb');
  const [ingredientVolUnit, setIngredientVolUnit] = useState('gal');
  const [kettleTurnSize, setKettleTurnSize] = useState('');
  const [kettleEvaporationRate, setKettleEvaporationRate] = useState('');
  const [kettleLoss, setKettleLoss] = useState('');
  const [fermLoss, setFermLoss] = useState('');
  const [error, setError] = useState<string | null>(null);

  const createMutation = useApiCreate<Brewhouse>('/api/brewhouses', {
    invalidateKeys: [['brewhouses']],
  });
  const updateMutation = useApiUpdate<Brewhouse>(
    (id) => `/api/brewhouses/${id}`,
    { invalidateKeys: [['brewhouses'], ['brewhouse', brewhouse?.id]] },
  );

  useEffect(() => {
    if (open) {
      setName(brewhouse?.name ?? '');
      setIsDefault(brewhouse?.is_default ?? false);
      setNotes(brewhouse?.notes ?? '');
      setTempUnit(brewhouse?.temp_unit ?? 'F');
      setLiquidVolUnit(brewhouse?.liquid_vol_unit ?? 'bbls');
      setDensityUnit(brewhouse?.density_unit ?? 'sg');
      setAlcoholUnit(brewhouse?.alcohol_unit ?? 'abv');
      setDensityCalcMethod(brewhouse?.density_calc_method ?? 'ppg');
      setIbuCalcMethod(brewhouse?.ibu_calc_method ?? 'tinseth');
      setIngredientWeightUnit(brewhouse?.ingredient_weight_unit ?? 'lb');
      setIngredientVolUnit(brewhouse?.ingredient_vol_unit ?? 'gal');
      setKettleTurnSize(brewhouse?.kettle_turn_size != null ? String(brewhouse.kettle_turn_size) : '');
      setKettleEvaporationRate(brewhouse?.kettle_evaporation_rate != null ? String(brewhouse.kettle_evaporation_rate) : '');
      setKettleLoss(brewhouse?.kettle_loss != null ? String(brewhouse.kettle_loss) : '');
      setFermLoss(brewhouse?.ferm_loss != null ? String(brewhouse.ferm_loss) : '');
      setError(null);
    }
  }, [open, brewhouse]);

  const handleSubmit = async () => {
    try {
      const payload: Record<string, unknown> = {
        name,
        is_default: isDefault,
        notes: notes || null,
        temp_unit: tempUnit,
        liquid_vol_unit: liquidVolUnit,
        density_unit: densityUnit,
        alcohol_unit: alcoholUnit,
        density_calc_method: densityCalcMethod,
        ibu_calc_method: ibuCalcMethod,
        ingredient_weight_unit: ingredientWeightUnit,
        ingredient_vol_unit: ingredientVolUnit,
        kettle_turn_size: kettleTurnSize ? Number(kettleTurnSize) : null,
        kettle_evaporation_rate: kettleEvaporationRate ? Number(kettleEvaporationRate) : null,
        kettle_loss: kettleLoss ? Number(kettleLoss) : null,
        ferm_loss: fermLoss ? Number(fermLoss) : null,
      };

      if (brewhouse) {
        await updateMutation.mutateAsync({ id: brewhouse.id, ...payload });
      } else {
        await createMutation.mutateAsync(payload);
      }
      onClose();
    } catch (err) {
      setError(parseApiError(err));
    }
  };

  const loading = createMutation.isPending || updateMutation.isPending;

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      title={brewhouse ? 'Edit Brewhouse' : 'Add Brewhouse'}
      onSubmit={handleSubmit}
      loading={loading}
      error={error}
    >
      <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} required fullWidth margin="normal" />
      <FormControlLabel control={<Checkbox checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />} label="Default Brewhouse" />
      <TextField label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} fullWidth multiline rows={2} margin="normal" />

      <TextField label="Temperature Unit" value={tempUnit} onChange={(e) => setTempUnit(e.target.value)} select fullWidth margin="normal">
        {['F', 'C'].map((v) => <MenuItem key={v} value={v}>{v}</MenuItem>)}
      </TextField>
      <TextField label="Liquid Volume Unit" value={liquidVolUnit} onChange={(e) => setLiquidVolUnit(e.target.value)} select fullWidth margin="normal">
        {['bbls', 'gallons', 'hectoliters', 'liters'].map((v) => <MenuItem key={v} value={v}>{v}</MenuItem>)}
      </TextField>
      <TextField label="Density Unit" value={densityUnit} onChange={(e) => setDensityUnit(e.target.value)} select fullWidth margin="normal">
        {['sg', 'plato'].map((v) => <MenuItem key={v} value={v}>{v}</MenuItem>)}
      </TextField>
      <TextField label="Alcohol Unit" value={alcoholUnit} onChange={(e) => setAlcoholUnit(e.target.value)} select fullWidth margin="normal">
        {['abv', 'abw'].map((v) => <MenuItem key={v} value={v}>{v}</MenuItem>)}
      </TextField>
      <TextField label="Density Calc Method" value={densityCalcMethod} onChange={(e) => setDensityCalcMethod(e.target.value)} select fullWidth margin="normal">
        {['ppg', 'cgai'].map((v) => <MenuItem key={v} value={v}>{v}</MenuItem>)}
      </TextField>
      <TextField label="IBU Calc Method" value={ibuCalcMethod} onChange={(e) => setIbuCalcMethod(e.target.value)} select fullWidth margin="normal">
        {['tinseth', 'rager', 'garetz'].map((v) => <MenuItem key={v} value={v}>{v}</MenuItem>)}
      </TextField>
      <TextField label="Ingredient Weight Unit" value={ingredientWeightUnit} onChange={(e) => setIngredientWeightUnit(e.target.value)} select fullWidth margin="normal">
        {['lb', 'lb_oz', 'oz', 'kg', 'g'].map((v) => <MenuItem key={v} value={v}>{v}</MenuItem>)}
      </TextField>
      <TextField label="Ingredient Volume Unit" value={ingredientVolUnit} onChange={(e) => setIngredientVolUnit(e.target.value)} select fullWidth margin="normal">
        {['bbls', 'gal', 'oz', 'hl', 'l', 'ml'].map((v) => <MenuItem key={v} value={v}>{v}</MenuItem>)}
      </TextField>

      <TextField label="Kettle Turn Size" value={kettleTurnSize} onChange={(e) => setKettleTurnSize(e.target.value)} type="number" fullWidth margin="normal" />
      <TextField label="Evaporation Rate (per hr)" value={kettleEvaporationRate} onChange={(e) => setKettleEvaporationRate(e.target.value)} type="number" fullWidth margin="normal" />
      <TextField label="Kettle Loss" value={kettleLoss} onChange={(e) => setKettleLoss(e.target.value)} type="number" fullWidth margin="normal" />
      <TextField label="Fermenter Loss" value={fermLoss} onChange={(e) => setFermLoss(e.target.value)} type="number" fullWidth margin="normal" />
    </FormDialog>
  );
}
