import { TaskModel } from '../models';
import { Store } from './Store';
import { differenceInDays } from '../utils/dateUtils';

export class TaskStore extends Store<TaskModel> {
  // After bulk operations, rebuild children arrays from parentId
  rebuildChildren(): void {
    // Clear all children arrays
    this.getAll().forEach(task => (task.children = []));

    // Rebuild from parentId
    this.getAll().forEach(task => {
      if (task.parentId) {
        const parent = this.getById(task.parentId);
        if (parent) {
          parent.children.push(task);
        }
      }
    });
  }

  // Override add to rebuild children BEFORE emitting event
  // This ensures listeners see correct parent-child relationships
  add(item: TaskModel): void;
  add(items: TaskModel[]): void;
  add(itemOrItems: TaskModel | TaskModel[]): void {
    const items = Array.isArray(itemOrItems) ? itemOrItems : [itemOrItems];
    // Add to map without emitting
    items.forEach(item => this.items.set(item.id, item));
    // Rebuild children BEFORE emitting
    this.rebuildChildren();
    // Now emit the event
    this.emit({ type: 'add', items });
  }

  // Override remove to rebuild children BEFORE emitting event
  remove(id: string): void;
  remove(ids: string[]): void;
  remove(idOrIds: string | string[]): void {
    const ids = Array.isArray(idOrIds) ? idOrIds : [idOrIds];
    const removed = ids.map(id => this.items.get(id)).filter(Boolean) as TaskModel[];
    ids.forEach(id => this.items.delete(id));
    if (removed.length > 0) {
      // Rebuild children BEFORE emitting
      this.rebuildChildren();
      // Now emit the event
      this.emit({ type: 'remove', items: removed });
    }
  }

  // Tree queries
  getRoots(): TaskModel[] {
    return this.filter(task => task.parentId === null);
  }

  getChildren(parentId: string): TaskModel[] {
    return this.filter(task => task.parentId === parentId);
  }

  getDescendants(parentId: string): TaskModel[] {
    const descendants: TaskModel[] = [];
    const collectDescendants = (id: string) => {
      const children = this.getChildren(id);
      children.forEach(child => {
        descendants.push(child);
        collectDescendants(child.id);
      });
    };
    collectDescendants(parentId);
    return descendants;
  }

  getAncestors(id: string): TaskModel[] {
    const ancestors: TaskModel[] = [];
    let current = this.getById(id);
    while (current?.parentId) {
      const parent = this.getById(current.parentId);
      if (parent) {
        ancestors.push(parent);
        current = parent;
      } else {
        break;
      }
    }
    return ancestors;
  }

  // Tree mutations
  setParent(id: string, newParentId: string | null): void {
    this.update(id, { parentId: newParentId } as Partial<TaskModel>);
    this.rebuildChildren();
  }

  moveAfter(id: string, afterId: string): void {
    // Reorder sibling - this is a simplified implementation
    // Full implementation would manage explicit ordering
    const task = this.getById(id);
    const afterTask = this.getById(afterId);
    if (task && afterTask) {
      this.setParent(id, afterTask.parentId);
    }
  }

  moveBefore(id: string, beforeId: string): void {
    // Reorder sibling - this is a simplified implementation
    const task = this.getById(id);
    const beforeTask = this.getById(beforeId);
    if (task && beforeTask) {
      this.setParent(id, beforeTask.parentId);
    }
  }

  /**
   * Get all siblings at the same level (including self)
   */
  getSiblings(taskId: string): TaskModel[] {
    const task = this.getById(taskId);
    if (!task) return [];

    // Return all tasks at same level (same parent)
    return task.parentId
      ? this.getChildren(task.parentId)
      : this.getRoots();
  }

  /**
   * Get previous sibling in display order
   */
  getPreviousSibling(taskId: string): TaskModel | null {
    const task = this.getById(taskId);
    if (!task) return null;

    // Get siblings with same parent (including self)
    const allSiblings = task.parentId
      ? this.getChildren(task.parentId)
      : this.getRoots();

    const index = allSiblings.findIndex(s => s.id === taskId);
    return index > 0 ? allSiblings[index - 1] : null;
  }

  /**
   * Get next sibling in display order
   */
  getNextSibling(taskId: string): TaskModel | null {
    const task = this.getById(taskId);
    if (!task) return null;

    const allSiblings = task.parentId
      ? this.getChildren(task.parentId)
      : this.getRoots();

    const index = allSiblings.findIndex(s => s.id === taskId);
    return index < allSiblings.length - 1 ? allSiblings[index + 1] : null;
  }

  /**
   * Check if task can be indented (has previous sibling)
   */
  canIndent(taskId: string): boolean {
    return this.getPreviousSibling(taskId) !== null;
  }

  /**
   * Check if task can be outdented (has parent)
   */
  canOutdent(taskId: string): boolean {
    const task = this.getById(taskId);
    return task?.parentId != null;
  }

  /**
   * Move task to be after another task (reorder)
   */
  reorderAfter(taskId: string, afterId: string): void {
    // This updates the task to have the same parent as the target
    // and repositions it in the internal array for ordering
    const task = this.getById(taskId);
    const afterTask = this.getById(afterId);
    if (!task || !afterTask) return;

    // Update parent if different
    if (task.parentId !== afterTask.parentId) {
      this.setParent(taskId, afterTask.parentId);
    }

    // Reorder in the internal items map by recreating it
    const itemsArray = Array.from(this.items.entries());
    const taskIndex = itemsArray.findIndex(([id]) => id === taskId);
    const afterIndex = itemsArray.findIndex(([id]) => id === afterId);

    if (taskIndex !== -1 && afterIndex !== -1) {
      // Remove task from current position
      const [taskEntry] = itemsArray.splice(taskIndex, 1);
      // Insert after target (adjust index if task was before target)
      const insertIndex = taskIndex < afterIndex ? afterIndex : afterIndex + 1;
      itemsArray.splice(insertIndex, 0, taskEntry);

      // Rebuild items map
      this.items.clear();
      itemsArray.forEach(([id, item]) => this.items.set(id, item));

      this.rebuildChildren();
      this.emit({ type: 'update', items: [task] });
    }
  }

  indent(id: string): boolean {
    // Find previous sibling, make this task its child
    const task = this.getById(id);
    if (!task) return false;

    const previousSibling = this.getPreviousSibling(id);
    if (!previousSibling) return false;

    this.setParent(id, previousSibling.id);
    // Expand parent so indented task is visible
    this.expand(previousSibling.id);
    return true;
  }

  outdent(id: string): boolean {
    // Make this task a sibling of its parent
    const task = this.getById(id);
    if (!task?.parentId) return false;

    const parent = this.getById(task.parentId);
    if (!parent) return false;

    this.setParent(id, parent.parentId);
    // Reorder to be after old parent
    this.reorderAfter(id, parent.id);
    return true;
  }

  // Flat list for rendering (respects expanded state)
  toFlatList(): TaskModel[] {
    const result: TaskModel[] = [];

    const addTaskAndChildren = (task: TaskModel) => {
      result.push(task);
      if (task.expanded && task.children.length > 0) {
        task.children.forEach(child => addTaskAndChildren(child));
      }
    };

    this.getRoots().forEach(root => addTaskAndChildren(root));
    return result;
  }

  // Expand/collapse
  expand(id: string): void {
    this.update(id, { expanded: true } as Partial<TaskModel>);
  }

  collapse(id: string): void {
    this.update(id, { expanded: false } as Partial<TaskModel>);
  }

  expandAll(): void {
    this.batch(() => {
      this.getAll().forEach(task => {
        if (task.children.length > 0) {
          this.update(task.id, { expanded: true } as Partial<TaskModel>);
        }
      });
    });
  }

  collapseAll(): void {
    this.batch(() => {
      this.getAll().forEach(task => {
        if (task.children.length > 0) {
          this.update(task.id, { expanded: false } as Partial<TaskModel>);
        }
      });
    });
  }

  isExpanded(id: string): boolean {
    return this.getById(id)?.expanded ?? false;
  }

  // WBS (Work Breakdown Structure) value
  getWbsValue(id: string): string {
    const task = this.getById(id);
    if (!task) return '';

    const ancestors = this.getAncestors(id).reverse();
    const indices: number[] = [];

    // Get index at each level
    let siblings = this.getRoots();
    for (const ancestor of ancestors) {
      const index = siblings.findIndex(s => s.id === ancestor.id);
      indices.push(index + 1);
      siblings = ancestor.children;
    }

    // Add this task's index among its siblings
    const selfIndex = siblings.findIndex(s => s.id === id);
    indices.push(selfIndex + 1);

    return indices.join('.');
  }

  /**
   * Recalculate summary (parent) task dates based on children.
   * Summary task start = earliest child start
   * Summary task end = latest child end
   * Duration is recalculated from new dates.
   *
   * @param taskId - The task that was modified (will update all ancestors)
   */
  recalculateSummaryDates(taskId: string): void {
    const ancestors = this.getAncestors(taskId);

    // Process from immediate parent up to root
    for (const parent of ancestors) {
      this.recalculateSingleSummary(parent.id);
    }
  }

  /**
   * Recalculate a single summary task's dates from its children.
   * Only considers leaf task dates to avoid stale intermediate parent dates.
   */
  private recalculateSingleSummary(parentId: string): void {
    const parent = this.getById(parentId);
    if (!parent) return;

    const children = this.getChildren(parentId);
    if (children.length === 0) return;

    // Collect only LEAF task dates to avoid stale intermediate parent dates
    const allDescendants = this.getDescendants(parentId);
    const dates: Date[] = [];

    for (const descendant of allDescendants) {
      // Only include leaf tasks (no children) in date calculation
      if (descendant.isLeaf) {
        if (descendant.startDate) dates.push(descendant.startDate);
        if (descendant.endDate) dates.push(descendant.endDate);
      }
    }

    if (dates.length === 0) return;

    const minTime = Math.min(...dates.map(d => d.getTime()));
    const maxTime = Math.max(...dates.map(d => d.getTime()));

    const newStartDate = new Date(minTime);
    const newEndDate = new Date(maxTime);
    const newDuration = differenceInDays(newEndDate, newStartDate);

    // Only update if dates actually changed
    if (
      parent.startDate?.getTime() !== newStartDate.getTime() ||
      parent.endDate?.getTime() !== newEndDate.getTime()
    ) {
      this.update(parentId, {
        startDate: newStartDate,
        endDate: newEndDate,
        duration: newDuration,
      });
    }
  }

  /**
   * Recalculate all summary tasks in the tree (bottom-up).
   * Useful after bulk operations.
   */
  recalculateAllSummaries(): void {
    // Get all leaf tasks and trigger recalculation from each
    const leaves = this.filter(task => task.isLeaf);
    const processedParents = new Set<string>();

    for (const leaf of leaves) {
      const ancestors = this.getAncestors(leaf.id);
      for (const ancestor of ancestors) {
        if (!processedParents.has(ancestor.id)) {
          this.recalculateSingleSummary(ancestor.id);
          processedParents.add(ancestor.id);
        }
      }
    }
  }
}
