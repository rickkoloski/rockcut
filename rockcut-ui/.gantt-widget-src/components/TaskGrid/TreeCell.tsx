import React from 'react';
import { TaskModel } from '../../models';
import { ChevronRight, ChevronDown, Dot, Diamond } from './icons';
import { INDENT_WIDTH } from './types';
import { Tooltip } from '../common';

interface TreeCellProps {
  task: TaskModel;
  wbsValue: string;
  depth: number;
  onToggleExpand: (taskId: string) => void;
  showWbs?: boolean;
}

export const TreeCell: React.FC<TreeCellProps> = ({
  task,
  wbsValue,
  depth,
  onToggleExpand,
  showWbs = true,
}) => {
  const indentPx = depth * INDENT_WIDTH;

  const handleIconClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (task.isParent) {
      onToggleExpand(task.id);
    }
  };

  const renderIcon = () => {
    if (task.isMilestone) {
      return <Diamond className="text-[var(--gantt-milestone)]" size={14} />;
    }
    if (task.isParent) {
      return task.expanded ? (
        <ChevronDown className="cursor-pointer hover:text-[var(--color-primary)]" />
      ) : (
        <ChevronRight className="cursor-pointer hover:text-[var(--color-primary)]" />
      );
    }
    return <Dot className="text-[var(--color-text-muted)]" size={12} />;
  };

  // Only show tooltip if name is likely to be truncated
  const needsTooltip = task.name.length > 25;

  return (
    <div className="flex items-center h-full gap-1 overflow-hidden">
      {showWbs && (
        <span
          className="text-[var(--color-text-muted)] text-xs shrink-0 w-10 text-right pr-2"
        >
          {wbsValue}
        </span>
      )}
      <div
        className="flex items-center shrink-0"
        style={{ paddingLeft: `${indentPx}px` }}
      >
        <span
          className="w-5 h-5 flex items-center justify-center shrink-0"
          onClick={handleIconClick}
          data-testid="tree-icon"
        >
          {renderIcon()}
        </span>
      </div>
      <Tooltip content={task.name} disabled={!needsTooltip}>
        <span className={`truncate ${task.isParent ? 'font-medium' : ''}`}>
          {task.name}
        </span>
      </Tooltip>
    </div>
  );
};
