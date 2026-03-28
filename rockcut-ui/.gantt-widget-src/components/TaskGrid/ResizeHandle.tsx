import React, { useCallback } from 'react';

export interface ResizeHandleProps {
  columnId: string;
  columnWidth: number;
  onResizeStart: (columnId: string, startX: number, startWidth: number) => void;
  onResizeMove: (currentX: number) => void;
  onResizeEnd: () => void;
  onDoubleClick?: (columnId: string) => void;
}

export function ResizeHandle({
  columnId,
  columnWidth,
  onResizeStart,
  onResizeMove,
  onResizeEnd,
  onDoubleClick,
}: ResizeHandleProps) {
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    onResizeStart(columnId, e.clientX, columnWidth);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      onResizeMove(moveEvent.clientX);
    };

    const handleMouseUp = () => {
      onResizeEnd();
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [columnId, columnWidth, onResizeStart, onResizeMove, onResizeEnd]);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onDoubleClick?.(columnId);
  }, [columnId, onDoubleClick]);

  return (
    <div
      className="resize-handle absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-blue-500 active:bg-blue-600 z-10 group"
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
      data-testid={`resize-handle-${columnId}`}
    >
      {/* Visual indicator on hover */}
      <div className="absolute inset-y-0 right-0 w-px bg-transparent group-hover:bg-blue-500 transition-colors" />
    </div>
  );
}
