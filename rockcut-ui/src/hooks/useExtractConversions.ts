/**
 * WS-4: useExtractConversions Hook
 *
 * Form-level reactive calculations for extract unit conversions.
 * This is a NEW pattern distinct from grid formulas — it handles
 * bidirectional conversion between four extract measurement units.
 *
 * The user picks which measurement is the "editable" input field.
 * The other three auto-compute from it. Changing moisture recalculates all.
 */

import { useState, useCallback, useMemo } from 'react'
import {
  convertExtract,
  type ExtractMeasurement,
  type ExtractValues,
} from '../lib/brewingConversions'

export interface UseExtractConversionsProps {
  /** Which field is the editable input (default: 'cgai') */
  measurement?: ExtractMeasurement
  /** Moisture as a decimal (e.g. 0.04 for 4%). Default: 0.04 */
  moisture?: number
  /** Initial value for the editable field */
  initialValue?: number
}

export interface UseExtractConversionsReturn {
  /** All four computed values */
  values: ExtractValues
  /** Update the editable field's numeric value */
  setEditableValue: (val: number) => void
  /** Update moisture (decimal, e.g. 0.04) */
  setMoisture: (val: number) => void
  /** Change which field is the editable input */
  setMeasurement: (m: ExtractMeasurement) => void
  /** Which field is currently editable */
  editableField: ExtractMeasurement
  /** Current moisture value */
  moisture: number
}

const NULL_VALUES: ExtractValues = { cgai: null, fgdb: null, ppg: null, l_deg_kg: null }

export function useExtractConversions(
  props?: UseExtractConversionsProps,
): UseExtractConversionsReturn {
  const [editableField, setEditableFieldState] = useState<ExtractMeasurement>(
    props?.measurement ?? 'cgai',
  )
  const [editableValue, setEditableValueState] = useState<number | null>(
    props?.initialValue ?? null,
  )
  const [moisture, setMoistureState] = useState<number>(props?.moisture ?? 0.04)

  // Compute all values whenever input, measurement type, or moisture changes
  const values: ExtractValues = useMemo(() => {
    if (editableValue === null || editableValue === undefined || isNaN(editableValue)) {
      return NULL_VALUES
    }
    return convertExtract(editableField, editableValue, moisture)
  }, [editableField, editableValue, moisture])

  const setEditableValue = useCallback((val: number) => {
    setEditableValueState(val)
  }, [])

  const setMoisture = useCallback((val: number) => {
    setMoistureState(val)
  }, [])

  const setMeasurement = useCallback(
    (m: ExtractMeasurement) => {
      // When changing measurement type, convert the current value to the new unit
      // so the display stays consistent. If we have computed values, use the
      // value for the new measurement from the current conversion.
      if (values[m] !== null && values[m] !== undefined) {
        setEditableValueState(values[m])
      }
      setEditableFieldState(m)
    },
    [values],
  )

  return {
    values,
    setEditableValue,
    setMoisture,
    setMeasurement,
    editableField,
    moisture,
  }
}
