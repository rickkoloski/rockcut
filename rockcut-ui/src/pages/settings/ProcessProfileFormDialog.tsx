import { useState, useEffect } from 'react';
import { TextField, MenuItem, Tab, Tabs, Box, FormControlLabel, Checkbox } from '@mui/material';
import FormDialog from '../../components/FormDialog';
import { useApiCreate, useApiUpdate } from '../../hooks/useApiMutation';
import parseApiError from '../../lib/parseApiError';
import type { ProcessProfile } from '../../lib/types';

interface Props {
  open: boolean;
  onClose: () => void;
  profile?: ProcessProfile;
}

function numStr(val: number | null | undefined): string {
  return val != null ? String(val) : '';
}

export default function ProcessProfileFormDialog({ open, onClose, profile }: Props) {
  const [tab, setTab] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // General
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  // Mash
  const [mashType, setMashType] = useState('');
  const [mashFoundationWater, setMashFoundationWater] = useState('');
  const [strikeWaterRatio, setStrikeWaterRatio] = useState('');
  const [mashPh, setMashPh] = useState('');
  // Lauter
  const [vorlaufDuration, setVorlaufDuration] = useState('');
  const [lauterType, setLauterType] = useState('');
  const [lauterTemperature, setLauterTemperature] = useState('');
  const [lauterWater, setLauterWater] = useState('');
  const [finalLauterPh, setFinalLauterPh] = useState('');
  const [lauterDuration, setLauterDuration] = useState('');
  // Boil
  const [boilDuration, setBoilDuration] = useState('');
  const [coolpool, setCoolpool] = useState(false);
  const [coolpoolTemperature, setCoolpoolTemperature] = useState('');
  const [coolpoolDuration, setCoolpoolDuration] = useState('');
  const [coolpoolRestDuration, setCoolpoolRestDuration] = useState('');
  const [whirlpoolDuration, setWhirlpoolDuration] = useState('');
  const [whirlpoolRestDuration, setWhirlpoolRestDuration] = useState('');
  const [knockoutDuration, setKnockoutDuration] = useState('');
  const [knockoutTemperature, setKnockoutTemperature] = useState('');
  // Fermentation
  const [lagTemperature, setLagTemperature] = useState('');
  const [lagDuration, setLagDuration] = useState('');
  const [primaryTemperature, setPrimaryTemperature] = useState('');
  const [primaryDuration, setPrimaryDuration] = useState('');
  const [secondaryTemperature, setSecondaryTemperature] = useState('');
  const [secondaryDuration, setSecondaryDuration] = useState('');
  const [dRestTemperature, setDRestTemperature] = useState('');
  const [dRestDuration, setDRestDuration] = useState('');
  // Cold Crash
  const [crashType, setCrashType] = useState('');
  const [crashTemperature, setCrashTemperature] = useState('');
  const [crashDuration, setCrashDuration] = useState('');
  // Packaging
  const [transferType, setTransferType] = useState('');
  const [brightTemperature, setBrightTemperature] = useState('');
  const [brightDuration, setBrightDuration] = useState('');
  const [co2Volume, setCo2Volume] = useState('');

  const createMutation = useApiCreate<ProcessProfile>('/api/process_profiles', {
    invalidateKeys: [['process_profiles']],
  });
  const updateMutation = useApiUpdate<ProcessProfile>(
    (id) => `/api/process_profiles/${id}`,
    { invalidateKeys: [['process_profiles'], ['process_profile', profile?.id]] },
  );

  useEffect(() => {
    if (open) {
      setTab(0);
      setError(null);
      setName(profile?.name ?? '');
      setDescription(profile?.description ?? '');
      setMashType(profile?.mash_type ?? '');
      setMashFoundationWater(numStr(profile?.mash_foundation_water));
      setStrikeWaterRatio(numStr(profile?.strike_water_ratio));
      setMashPh(numStr(profile?.mash_ph));
      setVorlaufDuration(numStr(profile?.vorlauf_duration));
      setLauterType(profile?.lauter_type ?? '');
      setLauterTemperature(numStr(profile?.lauter_temperature));
      setLauterWater(numStr(profile?.lauter_water));
      setFinalLauterPh(numStr(profile?.final_lauter_ph));
      setLauterDuration(numStr(profile?.lauter_duration));
      setBoilDuration(numStr(profile?.boil_duration));
      setCoolpool(profile?.coolpool ?? false);
      setCoolpoolTemperature(numStr(profile?.coolpool_temperature));
      setCoolpoolDuration(numStr(profile?.coolpool_duration));
      setCoolpoolRestDuration(numStr(profile?.coolpool_rest_duration));
      setWhirlpoolDuration(numStr(profile?.whirlpool_duration));
      setWhirlpoolRestDuration(numStr(profile?.whirlpool_rest_duration));
      setKnockoutDuration(numStr(profile?.knockout_duration));
      setKnockoutTemperature(numStr(profile?.knockout_temperature));
      setLagTemperature(numStr(profile?.lag_temperature));
      setLagDuration(numStr(profile?.lag_duration));
      setPrimaryTemperature(numStr(profile?.primary_temperature));
      setPrimaryDuration(numStr(profile?.primary_duration));
      setSecondaryTemperature(numStr(profile?.secondary_temperature));
      setSecondaryDuration(numStr(profile?.secondary_duration));
      setDRestTemperature(numStr(profile?.d_rest_temperature));
      setDRestDuration(numStr(profile?.d_rest_duration));
      setCrashType(profile?.crash_type ?? '');
      setCrashTemperature(numStr(profile?.crash_temperature));
      setCrashDuration(numStr(profile?.crash_duration));
      setTransferType(profile?.transfer_type ?? '');
      setBrightTemperature(numStr(profile?.bright_temperature));
      setBrightDuration(numStr(profile?.bright_duration));
      setCo2Volume(numStr(profile?.co2_volume));
    }
  }, [open, profile]);

  const num = (v: string) => (v ? Number(v) : null);

  const handleSubmit = async () => {
    try {
      const payload: Record<string, unknown> = {
        name,
        description: description || null,
        mash_type: mashType || null,
        mash_foundation_water: num(mashFoundationWater),
        strike_water_ratio: num(strikeWaterRatio),
        mash_ph: num(mashPh),
        vorlauf_duration: num(vorlaufDuration),
        lauter_type: lauterType || null,
        lauter_temperature: num(lauterTemperature),
        lauter_water: num(lauterWater),
        final_lauter_ph: num(finalLauterPh),
        lauter_duration: num(lauterDuration),
        boil_duration: num(boilDuration),
        coolpool,
        coolpool_temperature: num(coolpoolTemperature),
        coolpool_duration: num(coolpoolDuration),
        coolpool_rest_duration: num(coolpoolRestDuration),
        whirlpool_duration: num(whirlpoolDuration),
        whirlpool_rest_duration: num(whirlpoolRestDuration),
        knockout_duration: num(knockoutDuration),
        knockout_temperature: num(knockoutTemperature),
        lag_temperature: num(lagTemperature),
        lag_duration: num(lagDuration),
        primary_temperature: num(primaryTemperature),
        primary_duration: num(primaryDuration),
        secondary_temperature: num(secondaryTemperature),
        secondary_duration: num(secondaryDuration),
        d_rest_temperature: num(dRestTemperature),
        d_rest_duration: num(dRestDuration),
        crash_type: crashType || null,
        crash_temperature: num(crashTemperature),
        crash_duration: num(crashDuration),
        transfer_type: transferType || null,
        bright_temperature: num(brightTemperature),
        bright_duration: num(brightDuration),
        co2_volume: num(co2Volume),
      };

      if (profile) {
        await updateMutation.mutateAsync({ id: profile.id, ...payload });
      } else {
        await createMutation.mutateAsync(payload);
      }
      onClose();
    } catch (err) {
      setError(parseApiError(err));
    }
  };

  const loading = createMutation.isPending || updateMutation.isPending;

  const N = ({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) => (
    <TextField label={label} value={value} onChange={(e) => onChange(e.target.value)} type="number" fullWidth margin="normal" />
  );

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      title={profile ? 'Edit Process Profile' : 'Add Process Profile'}
      onSubmit={handleSubmit}
      loading={loading}
      error={error}
      maxWidth="md"
    >
      <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} required fullWidth margin="normal" />
      <TextField label="Description" value={description} onChange={(e) => setDescription(e.target.value)} fullWidth multiline rows={2} margin="normal" />

      <Box sx={{ borderBottom: 1, borderColor: 'divider', mt: 1 }}>
        <Tabs value={tab} onChange={(_e, v) => setTab(v)} variant="scrollable" scrollButtons="auto">
          <Tab label="Mash" />
          <Tab label="Lauter" />
          <Tab label="Boil" />
          <Tab label="Fermentation" />
          <Tab label="Cold Crash" />
          <Tab label="Packaging" />
        </Tabs>
      </Box>

      {tab === 0 && (
        <Box>
          <TextField label="Mash Type" value={mashType} onChange={(e) => setMashType(e.target.value)} select fullWidth margin="normal">
            <MenuItem value="">None</MenuItem>
            {['single_infusion', 'step', 'decoction'].map((v) => <MenuItem key={v} value={v}>{v.replace('_', ' ')}</MenuItem>)}
          </TextField>
          <N label="Foundation Water" value={mashFoundationWater} onChange={setMashFoundationWater} />
          <N label="Strike Water Ratio" value={strikeWaterRatio} onChange={setStrikeWaterRatio} />
          <N label="Mash pH" value={mashPh} onChange={setMashPh} />
        </Box>
      )}

      {tab === 1 && (
        <Box>
          <N label="Vorlauf Duration (min)" value={vorlaufDuration} onChange={setVorlaufDuration} />
          <TextField label="Lauter Type" value={lauterType} onChange={(e) => setLauterType(e.target.value)} select fullWidth margin="normal">
            <MenuItem value="">None</MenuItem>
            {['continuous', 'batch'].map((v) => <MenuItem key={v} value={v}>{v}</MenuItem>)}
          </TextField>
          <N label="Temperature" value={lauterTemperature} onChange={setLauterTemperature} />
          <N label="Lauter Water" value={lauterWater} onChange={setLauterWater} />
          <N label="Final pH" value={finalLauterPh} onChange={setFinalLauterPh} />
          <N label="Duration (min)" value={lauterDuration} onChange={setLauterDuration} />
        </Box>
      )}

      {tab === 2 && (
        <Box>
          <N label="Boil Duration (min)" value={boilDuration} onChange={setBoilDuration} />
          <FormControlLabel control={<Checkbox checked={coolpool} onChange={(e) => setCoolpool(e.target.checked)} />} label="Coolpool" />
          {coolpool && (
            <>
              <N label="Coolpool Temperature" value={coolpoolTemperature} onChange={setCoolpoolTemperature} />
              <N label="Coolpool Duration (min)" value={coolpoolDuration} onChange={setCoolpoolDuration} />
              <N label="Coolpool Rest (min)" value={coolpoolRestDuration} onChange={setCoolpoolRestDuration} />
            </>
          )}
          <N label="Whirlpool Duration (min)" value={whirlpoolDuration} onChange={setWhirlpoolDuration} />
          <N label="Whirlpool Rest (min)" value={whirlpoolRestDuration} onChange={setWhirlpoolRestDuration} />
          <N label="Knockout Duration (min)" value={knockoutDuration} onChange={setKnockoutDuration} />
          <N label="Knockout Temperature" value={knockoutTemperature} onChange={setKnockoutTemperature} />
        </Box>
      )}

      {tab === 3 && (
        <Box>
          <N label="Lag Temperature" value={lagTemperature} onChange={setLagTemperature} />
          <N label="Lag Duration (hrs)" value={lagDuration} onChange={setLagDuration} />
          <N label="Primary Temperature" value={primaryTemperature} onChange={setPrimaryTemperature} />
          <N label="Primary Duration (hrs)" value={primaryDuration} onChange={setPrimaryDuration} />
          <N label="Secondary Temperature" value={secondaryTemperature} onChange={setSecondaryTemperature} />
          <N label="Secondary Duration (hrs)" value={secondaryDuration} onChange={setSecondaryDuration} />
          <N label="D-Rest Temperature" value={dRestTemperature} onChange={setDRestTemperature} />
          <N label="D-Rest Duration (hrs)" value={dRestDuration} onChange={setDRestDuration} />
        </Box>
      )}

      {tab === 4 && (
        <Box>
          <TextField label="Crash Type" value={crashType} onChange={(e) => setCrashType(e.target.value)} select fullWidth margin="normal">
            <MenuItem value="">None</MenuItem>
            {['single', 'step'].map((v) => <MenuItem key={v} value={v}>{v}</MenuItem>)}
          </TextField>
          <N label="Temperature" value={crashTemperature} onChange={setCrashTemperature} />
          <N label="Duration (hrs)" value={crashDuration} onChange={setCrashDuration} />
        </Box>
      )}

      {tab === 5 && (
        <Box>
          <TextField label="Transfer Type" value={transferType} onChange={(e) => setTransferType(e.target.value)} select fullWidth margin="normal">
            <MenuItem value="">None</MenuItem>
            {['none', 'yes', 'filter'].map((v) => <MenuItem key={v} value={v}>{v}</MenuItem>)}
          </TextField>
          <N label="Bright Temperature" value={brightTemperature} onChange={setBrightTemperature} />
          <N label="Bright Duration (hrs)" value={brightDuration} onChange={setBrightDuration} />
          <N label="CO2 Volume" value={co2Volume} onChange={setCo2Volume} />
        </Box>
      )}
    </FormDialog>
  );
}
