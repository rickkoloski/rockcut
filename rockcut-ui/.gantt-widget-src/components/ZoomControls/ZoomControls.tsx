import React from 'react';
import { ZoomSlider } from './ZoomSlider';
import { ViewPresetButton } from './ViewPresetButton';
import { CriticalPathToggle } from './CriticalPathToggle';
import {
  VIEW_PRESETS,
  findClosestPreset,
  MIN_PIXELS_PER_DAY,
  MAX_PIXELS_PER_DAY,
} from './types';

interface ZoomControlsProps {
  pixelsPerDay: number;
  onPixelsPerDayChange: (ppd: number) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitToScreen: () => void;
  onScrollToToday: () => void;
  onScrollToSelected?: () => void;
  hasSelection?: boolean;
  showCriticalPath?: boolean;
  onShowCriticalPathChange?: (show: boolean) => void;
  criticalTaskCount?: number;
  className?: string;
}

export const ZoomControls: React.FC<ZoomControlsProps> = ({
  pixelsPerDay,
  onPixelsPerDayChange,
  onZoomIn,
  onZoomOut,
  onFitToScreen,
  onScrollToToday,
  onScrollToSelected,
  hasSelection = false,
  showCriticalPath = false,
  onShowCriticalPathChange,
  criticalTaskCount,
  className = '',
}) => {
  const activePreset = findClosestPreset(pixelsPerDay);
  const canZoomIn = pixelsPerDay < MAX_PIXELS_PER_DAY;
  const canZoomOut = pixelsPerDay > MIN_PIXELS_PER_DAY;

  const handlePresetClick = (preset: typeof VIEW_PRESETS[number]) => {
    onPixelsPerDayChange(preset.pixelsPerDay);
  };

  return (
    <div
      className={`flex items-center gap-2 px-3 py-2 bg-[var(--color-surface)] border-b border-[var(--color-border)] ${className}`}
      data-testid="zoom-controls"
    >
      {/* Zoom out button */}
      <button
        onClick={onZoomOut}
        disabled={!canZoomOut}
        className="w-7 h-7 flex items-center justify-center rounded hover:bg-[var(--color-surface-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
        aria-label="Zoom out"
        data-testid="zoom-out-btn"
      >
        <span className="text-lg font-bold">−</span>
      </button>

      {/* Zoom slider */}
      <ZoomSlider
        value={pixelsPerDay}
        onChange={onPixelsPerDayChange}
      />

      {/* Zoom in button */}
      <button
        onClick={onZoomIn}
        disabled={!canZoomIn}
        className="w-7 h-7 flex items-center justify-center rounded hover:bg-[var(--color-surface-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
        aria-label="Zoom in"
        data-testid="zoom-in-btn"
      >
        <span className="text-lg font-bold">+</span>
      </button>

      {/* Separator */}
      <div className="w-px h-5 bg-[var(--color-border)] mx-1" />

      {/* View presets */}
      <div className="flex items-center gap-1">
        {VIEW_PRESETS.map((preset) => (
          <ViewPresetButton
            key={preset.id}
            preset={preset}
            isActive={activePreset?.id === preset.id}
            onClick={() => handlePresetClick(preset)}
          />
        ))}
      </div>

      {/* Separator */}
      <div className="w-px h-5 bg-[var(--color-border)] mx-1" />

      {/* Navigation buttons */}
      <button
        onClick={onScrollToToday}
        className="px-2 py-1 text-xs rounded hover:bg-[var(--color-surface-hover)]"
        aria-label="Scroll to today"
        title="Scroll to today"
        data-testid="scroll-today-btn"
      >
        Today
      </button>

      <button
        onClick={onFitToScreen}
        className="px-2 py-1 text-xs rounded hover:bg-[var(--color-surface-hover)]"
        aria-label="Fit to screen"
        title="Fit all tasks on screen"
        data-testid="fit-screen-btn"
      >
        Fit
      </button>

      {onScrollToSelected && (
        <button
          onClick={onScrollToSelected}
          disabled={!hasSelection}
          className="px-2 py-1 text-xs rounded hover:bg-[var(--color-surface-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label="Scroll to selected task"
          title="Scroll to selected task"
          data-testid="scroll-selected-btn"
        >
          Selected
        </button>
      )}

      {/* Critical Path Toggle */}
      {onShowCriticalPathChange && (
        <>
          <div className="w-px h-5 bg-[var(--color-border)] mx-1" />
          <CriticalPathToggle
            enabled={showCriticalPath}
            onChange={onShowCriticalPathChange}
            criticalCount={criticalTaskCount}
          />
        </>
      )}
    </div>
  );
};
