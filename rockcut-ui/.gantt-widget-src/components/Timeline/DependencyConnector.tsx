export interface DependencyConnectorProps {
  taskId: string;
  position: 'start' | 'end';
  x: number;
  y: number;
  visible: boolean;
  onDragStart: (taskId: string, position: 'start' | 'end', x: number, y: number) => void;
}

export function DependencyConnector({
  taskId,
  position,
  x,
  y,
  visible,
  onDragStart,
}: DependencyConnectorProps) {
  if (!visible) return null;

  const handleMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onDragStart(taskId, position, x, y);
  };

  return (
    <circle
      cx={x}
      cy={y}
      r={6}
      className="fill-white stroke-gray-400 stroke-2 cursor-crosshair hover:fill-blue-100 hover:stroke-blue-500 transition-colors"
      onMouseDown={handleMouseDown}
      data-testid={`dependency-connector-${taskId}-${position}`}
    />
  );
}
