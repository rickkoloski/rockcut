// Users & Roles: which departments the actor can change on a person, and the
// memberships a save sends. D59 §4.3: only owners add or remove Owners
// (`owners_only`) members, and every member there is an employee.
import type { Department, Membership, Role } from './types'

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

/**
 * The person's `owners_only` memberships the actor can't change: shown as
 * read-only chips. From the membership itself (D59 decision 9): a manager's
 * `/api/departments` leaves Owners out.
 */
export function readOnlyOwnersOnly(memberships: Membership[] | null | undefined, editable: Department[]): { key: string; name: string }[] {
  const editableKeys = new Set(editable.map((d) => d.key))
  return (memberships ?? [])
    .filter((m) => m.owners_only && m.department_key && !editableKeys.has(m.department_key))
    .map((m) => ({ key: m.department_key as string, name: m.department_name ?? m.department_key as string }))
}

/** "Brewery: manager", "Owners: member" (D59 gap 3: an `owners_only` membership is a member, as in the dialog). */
export const membershipLabel = (m: Membership): string => `${m.department_name}: ${m.owners_only ? 'member' : m.role}`

/** Memberships in the API's department order (Owners last); unknown departments at the end. */
export function sortMemberships(memberships: Membership[], departments: Department[]): Membership[] {
  const index = new Map(departments.map((d, i) => [d.key, i]))
  const at = (m: Membership) => index.get(m.department_key ?? '') ?? departments.length
  return [...memberships].sort((a, b) => at(a) - at(b))
}
