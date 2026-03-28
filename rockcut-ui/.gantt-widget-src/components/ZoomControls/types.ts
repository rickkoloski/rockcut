export interface ViewPreset {
  id: string;
  name: string;
  pixelsPerDay: number;
}

export const VIEW_PRESETS: ViewPreset[] = [
  { id: 'day', name: 'Day', pixelsPerDay: 80 },
  { id: 'week', name: 'Week', pixelsPerDay: 40 },
  { id: 'month', name: 'Month', pixelsPerDay: 12 },
  { id: 'quarter', name: 'Qtr', pixelsPerDay: 4 },
  { id: 'year', name: 'Year', pixelsPerDay: 1 },
];

export const MIN_PIXELS_PER_DAY = 1;
export const MAX_PIXELS_PER_DAY = 120;
export const DEFAULT_PIXELS_PER_DAY = 40;
export const ZOOM_FACTOR = 1.5;

/**
 * Find the closest preset to a given pixelsPerDay value
 */
export function findClosestPreset(pixelsPerDay: number): ViewPreset | null {
  let closest: ViewPreset | null = null;
  let minDiff = Infinity;

  for (const preset of VIEW_PRESETS) {
    const diff = Math.abs(preset.pixelsPerDay - pixelsPerDay);
    if (diff < minDiff) {
      minDiff = diff;
      closest = preset;
    }
  }

  // Only return if within 20% of a preset
  if (closest && minDiff / closest.pixelsPerDay < 0.2) {
    return closest;
  }
  return null;
}
