import { TaskModel, DependencyModel } from '../models';

/**
 * Topologically sort tasks based on dependencies.
 * Tasks with no predecessors come first, followed by their successors.
 * Uses Kahn's algorithm.
 *
 * @throws Error if a cycle is detected
 */
export function topologicalSort(
  tasks: TaskModel[],
  dependencies: DependencyModel[]
): string[] {
  const inDegree = new Map<string, number>();
  const adjList = new Map<string, string[]>();

  // Initialize all tasks with 0 in-degree
  for (const task of tasks) {
    inDegree.set(task.id, 0);
    adjList.set(task.id, []);
  }

  // Build adjacency list and calculate in-degrees
  for (const dep of dependencies) {
    if (!dep.active) continue;

    // Only process if both tasks exist in our task list
    if (!inDegree.has(dep.fromTask) || !inDegree.has(dep.toTask)) {
      continue;
    }

    const neighbors = adjList.get(dep.fromTask) ?? [];
    neighbors.push(dep.toTask);
    adjList.set(dep.fromTask, neighbors);

    inDegree.set(dep.toTask, (inDegree.get(dep.toTask) ?? 0) + 1);
  }

  // Kahn's algorithm
  const queue: string[] = [];
  const result: string[] = [];

  // Start with tasks that have no predecessors
  for (const [taskId, degree] of inDegree) {
    if (degree === 0) {
      queue.push(taskId);
    }
  }

  while (queue.length > 0) {
    const taskId = queue.shift()!;
    result.push(taskId);

    for (const neighbor of adjList.get(taskId) ?? []) {
      const newDegree = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, newDegree);

      if (newDegree === 0) {
        queue.push(neighbor);
      }
    }
  }

  // Check for cycles
  if (result.length !== tasks.length) {
    throw new Error('Dependency cycle detected');
  }

  return result;
}

/**
 * Get all transitive successors of a task.
 * Returns task IDs in topological order.
 */
export function getTransitiveSuccessors(
  taskId: string,
  dependencies: DependencyModel[]
): string[] {
  const result: string[] = [];
  const visited = new Set<string>();
  const queued = new Set<string>();
  const queue = [taskId];
  queued.add(taskId);

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);

    // Find successors of current task
    const successorDeps = dependencies.filter(
      d => d.fromTask === current && d.active
    );

    for (const dep of successorDeps) {
      // Check both visited and queued to prevent duplicates in diamond patterns
      if (!visited.has(dep.toTask) && !queued.has(dep.toTask)) {
        result.push(dep.toTask);
        queue.push(dep.toTask);
        queued.add(dep.toTask);
      }
    }
  }

  return result;
}

/**
 * Get all predecessors of a task (tasks this task depends on).
 */
export function getPredecessors(
  taskId: string,
  dependencies: DependencyModel[]
): string[] {
  return dependencies
    .filter(d => d.toTask === taskId && d.active)
    .map(d => d.fromTask);
}
