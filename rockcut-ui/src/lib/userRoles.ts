// Users & Roles: which departments the actor can change on a person, and the
// memberships a save sends. D59 §4.3: only owners add or remove Owners
// (`owners_only`) members, and every member there is an employee. D58 lead
// decisions 1: a manager never sees an Owners membership (the API leaves it
// out), so there's no read-only chip.
import type { Department, Membership, Role, User } from './types'

export type RoleChoice = '' | Role

/**
 * The departments the actor can set a role in: every assignable one for an
 * owner, otherwise the ones they manage. A manager never gets an `owners_only`
 * department, even if their managed keys were to name it.
 */
export function editableDepartments(departments: Department[], isOwnerActor: boolean, managedKeys: string[]): Department[] {
  const assignable = departments.filter((d) => d.assignable !== false)
  if (isOwnerActor) return assignable
  return assignable.filter((d) => !d.owners_only && managedKeys.includes(d.key))
}

/**
 * The `memberships` body for a save. Departments the actor can't change aren't
 * sent (the API keeps them); an `owners_only` department is always employee.
 */
export function membershipsPayload(editable: Department[], roles: Record<string, RoleChoice>): { department: string; role: Role }[] {
  return editable
    .filter((d) => roles[d.key])
    .map((d) => ({ department: d.key, role: d.owners_only ? 'employee' : (roles[d.key] as Role) }))
}

/** "Brewery: manager", "Owners: member" (D59 gap 3: an `owners_only` membership is a member, as in the dialog). */
export const membershipLabel = (m: Membership): string => `${m.department_name}: ${m.owners_only ? 'member' : m.role}`

/** Memberships in the API's department order (Owners last); unknown departments at the end. */
export function sortMemberships(memberships: Membership[], departments: Department[]): Membership[] {
  const index = new Map(departments.map((d, i) => [d.key, i]))
  const at = (m: Membership) => index.get(m.department_key ?? '') ?? departments.length
  return [...memberships].sort((a, b) => at(a) - at(b))
}

/**
 * D58 §3.3: what the actor may do with a person in Users & Roles, from the
 * API's row (`can_edit`, `can_deactivate`, `addable_departments`). A row
 * without them (an older API, or a person just created) is editable, as
 * before; the API still decides.
 */
export function userAccess(user: User | null | undefined): {
  canEdit: boolean
  canDeactivate: boolean
  addable: { key: string; name: string }[]
} {
  return {
    canEdit: user?.can_edit ?? true,
    canDeactivate: user?.can_deactivate ?? true,
    addable: user?.addable_departments ?? [],
  }
}

/**
 * Why Active is greyed out (D58 decisions 3, 5). Lead decisions 1: neutral,
 * so it doesn't hint at a department the manager can't see.
 */
export const DEACTIVATE_HINT = "You can't change Active for this person."
