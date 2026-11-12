// Manage positions (D58, task 5769): a manager changes only their own
// departments' positions and templates; other departments' are shown read-only.
import type { Department, Position, ScheduleTemplate } from './types'

export interface PositionGroup {
  department: Department
  positions: Position[]
  editable: boolean
}

/**
 * The dialog's groups, in `departments` order: every department the actor
 * can edit (owners: all, so each can be colored), and any other department
 * that has positions, read-only.
 */
export function positionGroups(departments: Department[], positions: Position[], canManage: (departmentId: number) => boolean): PositionGroup[] {
  return departments
    .map((d) => ({ department: d, positions: positions.filter((p) => p.department_id === d.id), editable: canManage(d.id) }))
    .filter((g) => g.editable || g.positions.length > 0)
}

/** True if every position on the template is in a department the actor manages (the API's rule). */
export function canWriteTemplate(template: ScheduleTemplate, canManage: (departmentId: number) => boolean): boolean {
  return template.items.every((i) => i.position?.department_id == null || canManage(i.position.department_id))
}
