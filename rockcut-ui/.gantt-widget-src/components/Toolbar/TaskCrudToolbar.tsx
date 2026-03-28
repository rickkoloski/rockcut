export interface TaskCrudToolbarProps {
  selectedTaskId: string | null;
  onAddTask: () => void;
  onAddSubtask: () => void;
  onDeleteTask: () => void;
  onIndent: () => void;
  onOutdent: () => void;
  canAddSubtask: boolean;
  canDelete: boolean;
  canIndent: boolean;
  canOutdent: boolean;
}

export function TaskCrudToolbar({
  onAddTask,
  onAddSubtask,
  onDeleteTask,
  onIndent,
  onOutdent,
  canAddSubtask,
  canDelete,
  canIndent,
  canOutdent,
}: TaskCrudToolbarProps) {
  const buttonBase = "flex items-center gap-1 px-2 py-1.5 text-sm rounded border border-[var(--color-border)] hover:bg-[var(--color-surface-hover)] transition-colors";
  const buttonDisabled = "disabled:opacity-50 disabled:cursor-not-allowed";

  return (
    <div className="flex items-center gap-1" data-testid="task-crud-toolbar">
      {/* Add Task */}
      <button
        onClick={onAddTask}
        className={`${buttonBase}`}
        title="Add Task"
        data-testid="add-task-btn"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        <span>Add</span>
      </button>

      {/* Add Subtask */}
      <button
        onClick={onAddSubtask}
        disabled={!canAddSubtask}
        className={`${buttonBase} ${buttonDisabled}`}
        title="Add Subtask (requires selection)"
        data-testid="add-subtask-btn"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        <span>Subtask</span>
      </button>

      <div className="w-px h-5 bg-[var(--color-border)] mx-1" />

      {/* Delete */}
      <button
        onClick={onDeleteTask}
        disabled={!canDelete}
        className={`${buttonBase} ${buttonDisabled} text-red-600 dark:text-red-400`}
        title="Delete Task"
        data-testid="delete-task-btn"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      </button>

      <div className="w-px h-5 bg-[var(--color-border)] mx-1" />

      {/* Indent */}
      <button
        onClick={onIndent}
        disabled={!canIndent}
        className={`${buttonBase} ${buttonDisabled}`}
        title="Indent (make child of previous sibling)"
        data-testid="indent-btn"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7" />
        </svg>
      </button>

      {/* Outdent */}
      <button
        onClick={onOutdent}
        disabled={!canOutdent}
        className={`${buttonBase} ${buttonDisabled}`}
        title="Outdent (move up one level)"
        data-testid="outdent-btn"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7" />
        </svg>
      </button>
    </div>
  );
}
