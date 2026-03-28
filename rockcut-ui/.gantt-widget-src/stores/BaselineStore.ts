import type { Baseline, TaskBaseline, BaselineVariance } from '../models';
import type { TaskModel } from '../models';
import { TaskStore } from './TaskStore';
import { calculateVariance } from '../utils/baselineUtils';

export type BaselineEventType = 'baseline:added' | 'baseline:deleted' | 'baseline:cleared' | 'baseline:active-changed';

export interface BaselineEvent {
  type: BaselineEventType;
  baseline?: Baseline;
  baselineId?: string;
}

export type BaselineListener = (event: BaselineEvent) => void;

export class BaselineStore {
  // Maximum number of baselines
  private static readonly MAX_BASELINES = 3;

  // Current baselines
  private baselines: Map<string, Baseline> = new Map();

  // Active baseline for display
  private activeBaselineId: string | null = null;

  // Event listeners
  private listeners: Set<BaselineListener> = new Set();

  /**
   * Subscribe to baseline events.
   */
  on(listener: BaselineListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Unsubscribe from baseline events.
   */
  off(listener: BaselineListener): void {
    this.listeners.delete(listener);
  }

  private emit(event: BaselineEvent): void {
    this.listeners.forEach(listener => listener(event));
  }

  /**
   * Capture a new baseline from current task dates.
   * @param name Display name for the baseline
   * @param taskStore Source of current task data
   * @returns The created baseline
   */
  captureBaseline(name: string, taskStore: TaskStore): Baseline {
    // Check max limit
    if (this.baselines.size >= BaselineStore.MAX_BASELINES) {
      throw new Error(`Maximum of ${BaselineStore.MAX_BASELINES} baselines allowed`);
    }

    const now = new Date();
    const baseline: Baseline = {
      id: crypto.randomUUID(),
      name,
      capturedAt: now,
      tasks: new Map(),
    };

    // Capture all leaf tasks
    for (const task of taskStore.getAll()) {
      if (task.isLeaf) {
        baseline.tasks.set(task.id, {
          taskId: task.id,
          startDate: new Date(task.startDate),
          endDate: new Date(task.endDate),
          duration: task.duration,
          capturedAt: now,
        });
      }
    }

    this.baselines.set(baseline.id, baseline);

    // Auto-activate if first baseline
    if (this.baselines.size === 1) {
      this.activeBaselineId = baseline.id;
    }

    this.emit({ type: 'baseline:added', baseline });
    return baseline;
  }

  /**
   * Get a baseline by ID.
   */
  getBaseline(id: string): Baseline | undefined {
    return this.baselines.get(id);
  }

  /**
   * Get all baselines.
   */
  getAllBaselines(): Baseline[] {
    return Array.from(this.baselines.values());
  }

  /**
   * Get the active baseline for display.
   */
  getActiveBaseline(): Baseline | undefined {
    if (!this.activeBaselineId) return undefined;
    return this.baselines.get(this.activeBaselineId);
  }

  /**
   * Get the active baseline ID.
   */
  getActiveBaselineId(): string | null {
    return this.activeBaselineId;
  }

  /**
   * Set the active baseline.
   */
  setActiveBaseline(id: string | null): void {
    if (id !== null && !this.baselines.has(id)) {
      throw new Error(`Baseline not found: ${id}`);
    }
    this.activeBaselineId = id;
    this.emit({ type: 'baseline:active-changed', baselineId: id ?? undefined });
  }

  /**
   * Get baseline data for a specific task from the active baseline.
   */
  getTaskBaseline(taskId: string): TaskBaseline | undefined {
    const baseline = this.getActiveBaseline();
    if (!baseline) return undefined;
    return baseline.tasks.get(taskId);
  }

  /**
   * Get baseline data for a specific task from a specific baseline.
   */
  getTaskBaselineFrom(baselineId: string, taskId: string): TaskBaseline | undefined {
    const baseline = this.baselines.get(baselineId);
    if (!baseline) return undefined;
    return baseline.tasks.get(taskId);
  }

  /**
   * Delete a baseline.
   */
  deleteBaseline(id: string): void {
    if (!this.baselines.has(id)) return;

    this.baselines.delete(id);

    // If we deleted the active baseline, clear or reset active
    if (this.activeBaselineId === id) {
      const remaining = this.getAllBaselines();
      this.activeBaselineId = remaining.length > 0 ? remaining[0].id : null;
    }

    this.emit({ type: 'baseline:deleted', baselineId: id });
  }

  /**
   * Clear all baselines.
   */
  clearAll(): void {
    this.baselines.clear();
    this.activeBaselineId = null;
    this.emit({ type: 'baseline:cleared' });
  }

  /**
   * Calculate variance for a task against active baseline.
   */
  calculateVariance(task: TaskModel): BaselineVariance | undefined {
    const taskBaseline = this.getTaskBaseline(task.id);
    if (!taskBaseline) return undefined;

    return calculateVariance(task, taskBaseline);
  }

  /**
   * Calculate variance for all tasks.
   */
  calculateAllVariances(taskStore: TaskStore): Map<string, BaselineVariance> {
    const variances = new Map<string, BaselineVariance>();
    const baseline = this.getActiveBaseline();
    if (!baseline) return variances;

    for (const task of taskStore.getAll()) {
      const taskBaseline = baseline.tasks.get(task.id);
      if (taskBaseline) {
        variances.set(task.id, calculateVariance(task, taskBaseline));
      }
    }

    return variances;
  }

  /**
   * Get the number of baselines.
   */
  get count(): number {
    return this.baselines.size;
  }

  /**
   * Check if max baselines reached.
   */
  get isMaxReached(): boolean {
    return this.baselines.size >= BaselineStore.MAX_BASELINES;
  }
}
