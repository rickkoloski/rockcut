import { TaskStore } from '../stores/TaskStore';
import { DependencyStore } from '../stores/DependencyStore';
import {
  analyzeCPM,
} from './criticalPath';
import type { CPMResult, SlackInfo } from './criticalPath';

export interface CriticalPathAnalyzerOptions {
  taskStore: TaskStore;
  dependencyStore: DependencyStore;
}

export class CriticalPathAnalyzer {
  private taskStore: TaskStore;
  private dependencyStore: DependencyStore;
  private lastResult: CPMResult | null = null;

  constructor(options: CriticalPathAnalyzerOptions) {
    this.taskStore = options.taskStore;
    this.dependencyStore = options.dependencyStore;
  }

  /**
   * Run full CPM analysis.
   */
  analyze(): CPMResult {
    const tasks = this.taskStore.getAll();
    const dependencies = this.dependencyStore.getAll();
    const taskLookup = new Map(tasks.map(t => [t.id, t]));

    this.lastResult = analyzeCPM(tasks, dependencies, taskLookup);
    return this.lastResult;
  }

  /**
   * Get the critical path task IDs.
   * Runs analysis if not already done.
   */
  getCriticalPath(): string[] {
    if (!this.lastResult) {
      this.analyze();
    }
    return this.lastResult?.criticalPath ?? [];
  }

  /**
   * Check if a specific task is on the critical path.
   */
  isCritical(taskId: string): boolean {
    if (!this.lastResult) {
      this.analyze();
    }
    const slack = this.lastResult?.slackInfo.get(taskId);
    return slack?.isCritical ?? false;
  }

  /**
   * Get slack info for a task.
   */
  getSlack(taskId: string): SlackInfo | undefined {
    if (!this.lastResult) {
      this.analyze();
    }
    return this.lastResult?.slackInfo.get(taskId);
  }

  /**
   * Get the project end date.
   */
  getProjectEndDate(): Date {
    if (!this.lastResult) {
      this.analyze();
    }
    return this.lastResult?.projectEnd ?? new Date();
  }

  /**
   * Get project start date.
   */
  getProjectStartDate(): Date {
    if (!this.lastResult) {
      this.analyze();
    }
    return this.lastResult?.projectStart ?? new Date();
  }

  /**
   * Get project duration in days.
   */
  getProjectDuration(): number {
    if (!this.lastResult) {
      this.analyze();
    }
    return this.lastResult?.projectDuration ?? 0;
  }

  /**
   * Get the last analysis result.
   */
  getLastResult(): CPMResult | null {
    return this.lastResult;
  }

  /**
   * Invalidate cached result (call after task changes).
   */
  invalidate(): void {
    this.lastResult = null;
  }
}
