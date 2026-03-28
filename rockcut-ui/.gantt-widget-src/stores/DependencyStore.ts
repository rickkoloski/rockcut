import { DependencyModel } from '../models';
import { Store } from './Store';
import { TaskStore } from './TaskStore';

export class DependencyStore extends Store<DependencyModel> {
  constructor(private taskStore: TaskStore) {
    super();
  }

  // Override add to prevent duplicate dependencies (same fromTask and toTask)
  add(item: DependencyModel): void;
  add(items: DependencyModel[]): void;
  add(itemOrItems: DependencyModel | DependencyModel[]): void {
    const items = Array.isArray(itemOrItems) ? itemOrItems : [itemOrItems];
    const nonDuplicates = items.filter(item => {
      // Check if a dependency with the same fromTask and toTask already exists
      const existing = this.getDependenciesBetween(item.fromTask, item.toTask);
      return !existing;
    });
    if (nonDuplicates.length > 0) {
      super.add(nonDuplicates);
    }
  }

  // Get all dependencies where the given task is the predecessor (outgoing)
  getDependenciesFrom(taskId: string): DependencyModel[] {
    return this.filter(dep => dep.fromTask === taskId);
  }

  // Get all dependencies where the given task is the successor (incoming)
  getDependenciesTo(taskId: string): DependencyModel[] {
    return this.filter(dep => dep.toTask === taskId);
  }

  // Get the specific dependency between two tasks
  getDependenciesBetween(fromId: string, toId: string): DependencyModel | undefined {
    return this.find(dep => dep.fromTask === fromId && dep.toTask === toId);
  }

  // Check if adding a dependency from fromId to toId would create a cycle
  wouldCreateCycle(fromId: string, toId: string): boolean {
    // Check if toId can reach fromId through existing dependencies
    // If it can, adding fromId -> toId would create a cycle
    const visited = new Set<string>();

    const canReach = (current: string, target: string): boolean => {
      if (current === target) return true;
      if (visited.has(current)) return false;
      visited.add(current);

      const outgoing = this.getDependenciesFrom(current);
      return outgoing.some(dep => canReach(dep.toTask, target));
    };

    return canReach(toId, fromId);
  }

  // Validate a dependency including checking for cycles and task existence
  validate(dep: DependencyModel): string[] {
    const errors = dep.validate();

    // Check tasks exist
    if (!this.taskStore.getById(dep.fromTask)) {
      errors.push(`fromTask '${dep.fromTask}' does not exist`);
    }
    if (!this.taskStore.getById(dep.toTask)) {
      errors.push(`toTask '${dep.toTask}' does not exist`);
    }

    // Check for cycle
    if (this.wouldCreateCycle(dep.fromTask, dep.toTask)) {
      errors.push('Dependency would create a cycle');
    }

    return errors;
  }

  // Remove all dependencies involving a specific task
  removeByTask(taskId: string): void {
    const toRemove = this.filter(
      dep => dep.fromTask === taskId || dep.toTask === taskId
    );
    if (toRemove.length > 0) {
      this.remove(toRemove.map(d => d.id));
    }
  }
}
