/**
 * Baseline data for a single task.
 * Captures the planned dates at a point in time.
 */
export interface TaskBaseline {
  taskId: string;

  // Baseline dates
  startDate: Date;
  endDate: Date;
  duration: number;

  // Metadata
  capturedAt: Date; // When baseline was captured
}

/**
 * A baseline snapshot of the entire project schedule.
 */
export interface Baseline {
  id: string;
  name: string; // e.g., "Original Plan", "Q1 Baseline"
  capturedAt: Date; // When this baseline was captured
  tasks: Map<string, TaskBaseline>;
}

/**
 * Variance between current task and baseline.
 */
export interface BaselineVariance {
  taskId: string;

  // Start variance (negative = early, positive = late)
  startVariance: number; // days

  // Finish variance (negative = early, positive = late)
  finishVariance: number; // days

  // Duration variance (negative = shorter, positive = longer)
  durationVariance: number; // days

  // Status
  status: 'on-track' | 'ahead' | 'behind';
}
