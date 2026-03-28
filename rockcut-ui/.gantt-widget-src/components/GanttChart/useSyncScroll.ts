import { useRef, useCallback } from 'react';

export interface UseSyncScrollOptions {
  direction?: 'vertical' | 'horizontal' | 'both';
}

export interface SyncScrollResult {
  leftRef: React.RefObject<HTMLDivElement | null>;
  rightRef: React.RefObject<HTMLDivElement | null>;
  handleLeftScroll: () => void;
  handleRightScroll: () => void;
}

export function useSyncScroll(
  options: UseSyncScrollOptions = {}
): SyncScrollResult {
  const { direction = 'vertical' } = options;

  const leftRef = useRef<HTMLDivElement | null>(null);
  const rightRef = useRef<HTMLDivElement | null>(null);
  const isSyncing = useRef(false);

  const handleLeftScroll = useCallback(() => {
    if (isSyncing.current) return;
    if (!leftRef.current || !rightRef.current) return;

    isSyncing.current = true;

    if (direction === 'vertical' || direction === 'both') {
      rightRef.current.scrollTop = leftRef.current.scrollTop;
    }
    if (direction === 'horizontal' || direction === 'both') {
      rightRef.current.scrollLeft = leftRef.current.scrollLeft;
    }

    requestAnimationFrame(() => {
      isSyncing.current = false;
    });
  }, [direction]);

  const handleRightScroll = useCallback(() => {
    if (isSyncing.current) return;
    if (!leftRef.current || !rightRef.current) return;

    isSyncing.current = true;

    if (direction === 'vertical' || direction === 'both') {
      leftRef.current.scrollTop = rightRef.current.scrollTop;
    }
    if (direction === 'horizontal' || direction === 'both') {
      leftRef.current.scrollLeft = rightRef.current.scrollLeft;
    }

    requestAnimationFrame(() => {
      isSyncing.current = false;
    });
  }, [direction]);

  return {
    leftRef,
    rightRef,
    handleLeftScroll,
    handleRightScroll,
  };
}
