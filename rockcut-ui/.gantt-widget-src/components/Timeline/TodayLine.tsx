import React from 'react';

interface TodayLineProps {
  x: number;
  height: number;
  showMarker?: boolean;
  headerHeight?: number;
}

export const TodayLine: React.FC<TodayLineProps> = ({
  x,
  height,
  showMarker = true,
  headerHeight = 50,
}) => {
  if (x < 0) return null;

  return (
    <div
      data-testid="today-line"
      className="today-line absolute top-0 z-20 pointer-events-none"
      style={{
        left: x,
        height,
      }}
    >
      {/* Today marker label in header area */}
      {showMarker && (
        <div
          className="absolute -translate-x-1/2 px-1.5 py-0.5 rounded-b text-xs font-semibold whitespace-nowrap"
          style={{
            backgroundColor: 'var(--gantt-today-marker-bg, var(--gantt-today-line))',
            color: 'white',
            top: 0,
            left: 0,
          }}
          data-testid="today-marker"
        >
          Today
        </div>
      )}

      {/* Vertical line through content */}
      <div
        className="absolute w-0.5"
        style={{
          backgroundColor: 'var(--gantt-today-line)',
          top: showMarker ? headerHeight : 0,
          height: height - (showMarker ? headerHeight : 0),
          opacity: 0.7,
        }}
      />

      {/* Triangle marker at top (when no label) */}
      {!showMarker && (
        <div
          className="absolute -top-2 -left-1.5 w-0 h-0"
          style={{
            borderLeft: '6px solid transparent',
            borderRight: '6px solid transparent',
            borderTop: '8px solid var(--gantt-today-line)',
          }}
        />
      )}
    </div>
  );
};
