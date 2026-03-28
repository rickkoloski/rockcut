import React, { useState, useRef, useCallback, useEffect, type ReactNode } from 'react';
import { Divider } from './Divider';

export interface SplitPaneProps {
  children: [ReactNode, ReactNode];
  defaultLeftWidth?: number;
  minLeftWidth?: number;
  maxLeftWidth?: number;
  minRightWidth?: number;
  onResize?: (leftWidth: number) => void;
  className?: string;
}

const DIVIDER_WIDTH = 4;
const KEYBOARD_STEP = 10;

export function SplitPane({
  children,
  defaultLeftWidth = 300,
  minLeftWidth = 150,
  maxLeftWidth = 600,
  minRightWidth = 200,
  onResize,
  className = '',
}: SplitPaneProps) {
  const [leftWidth, setLeftWidth] = useState(defaultLeftWidth);
  const [isDragging, setIsDragging] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const clampWidth = useCallback(
    (width: number) => {
      const containerWidth = containerRef.current?.clientWidth ?? 1000;
      const maxAllowed = containerWidth - minRightWidth - DIVIDER_WIDTH;
      return Math.min(maxLeftWidth, Math.max(minLeftWidth, Math.min(width, maxAllowed)));
    },
    [minLeftWidth, maxLeftWidth, minRightWidth]
  );

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    startXRef.current = e.clientX;
    startWidthRef.current = leftWidth;
  }, [leftWidth]);

  const handleDrag = useCallback(
    (e: MouseEvent) => {
      const deltaX = e.clientX - startXRef.current;
      const newWidth = clampWidth(startWidthRef.current + deltaX);
      setLeftWidth(newWidth);
    },
    [clampWidth]
  );

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
    onResize?.(leftWidth);
  }, [leftWidth, onResize]);

  useEffect(() => {
    if (!isDragging) return;

    document.addEventListener('mousemove', handleDrag);
    document.addEventListener('mouseup', handleDragEnd);

    return () => {
      document.removeEventListener('mousemove', handleDrag);
      document.removeEventListener('mouseup', handleDragEnd);
    };
  }, [isDragging, handleDrag, handleDragEnd]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      let newWidth = leftWidth;

      switch (e.key) {
        case 'ArrowLeft':
          newWidth = leftWidth - KEYBOARD_STEP;
          e.preventDefault();
          break;
        case 'ArrowRight':
          newWidth = leftWidth + KEYBOARD_STEP;
          e.preventDefault();
          break;
        case 'Home':
          newWidth = minLeftWidth;
          e.preventDefault();
          break;
        case 'End':
          newWidth = maxLeftWidth;
          e.preventDefault();
          break;
        default:
          return;
      }

      const clampedWidth = clampWidth(newWidth);
      setLeftWidth(clampedWidth);
      onResize?.(clampedWidth);
    },
    [leftWidth, minLeftWidth, maxLeftWidth, clampWidth, onResize]
  );

  const [leftChild, rightChild] = children;

  return (
    <div
      ref={containerRef}
      className={`
        flex h-full
        ${isDragging ? 'select-none' : ''}
        ${className}
      `}
      data-testid="split-pane"
    >
      {/* Left pane */}
      <div
        style={{ width: leftWidth, flexShrink: 0 }}
        className="overflow-hidden"
        data-testid="split-pane-left"
      >
        {leftChild}
      </div>

      {/* Divider */}
      <Divider
        onMouseDown={handleDragStart}
        isDragging={isDragging}
        onKeyDown={handleKeyDown}
      />

      {/* Right pane */}
      <div
        className="flex-1 overflow-hidden"
        data-testid="split-pane-right"
      >
        {rightChild}
      </div>
    </div>
  );
}
