import React from 'react';
import { MIN_PIXELS_PER_DAY, MAX_PIXELS_PER_DAY } from './types';

interface ZoomSliderProps {
  value: number;
  onChange: (value: number) => void;
  className?: string;
}

export const ZoomSlider: React.FC<ZoomSliderProps> = ({
  value,
  onChange,
  className = '',
}) => {
  // Use logarithmic scale for better UX (small values more sensitive)
  const minLog = Math.log(MIN_PIXELS_PER_DAY);
  const maxLog = Math.log(MAX_PIXELS_PER_DAY);

  const valueToSlider = (val: number): number => {
    const log = Math.log(Math.max(MIN_PIXELS_PER_DAY, Math.min(MAX_PIXELS_PER_DAY, val)));
    return ((log - minLog) / (maxLog - minLog)) * 100;
  };

  const sliderToValue = (slider: number): number => {
    const log = minLog + (slider / 100) * (maxLog - minLog);
    return Math.exp(log);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const sliderValue = parseFloat(e.target.value);
    const newValue = sliderToValue(sliderValue);
    onChange(Math.round(newValue * 10) / 10); // Round to 1 decimal
  };

  return (
    <input
      type="range"
      min={0}
      max={100}
      step={1}
      value={valueToSlider(value)}
      onChange={handleChange}
      className={`w-24 h-1 bg-[var(--color-border)] rounded-lg appearance-none cursor-pointer ${className}`}
      aria-label="Zoom level"
      data-testid="zoom-slider"
    />
  );
};
