import { describe, expect, it } from 'vitest'
import { editableDepartments, membershipLabel, membershipsPayload, sortMemberships, userAccess } from './userRoles'
import type { Department, Membership, User } from './types'

// API order: by name, Owners last (D59 §4.4).
const depts: Department[] = [
  { id: 1, key: 'brewery', name: 'Brewery', assignable: true },
  { id: 5, key: 'other', name: 'Other', assignable: false },
  { id: 3, key: 'office', name: 'Office', assignable: true },
  { id: 4, key: 'sales', name: 'Sales', assignable: true },
  { id: 2, key: 'bar', name: 'Taproom', assignable: true },
  { id: 9, key: 'owners', name: 'Owners', assignable: true, scheduling: false, owners_only: true },
]

const m = (key: string, role: 'manager' | 'employee' = 'employee'): Membership => ({
  department_id: depts.find((d) => d.key === key)?.id ?? 0,
  department_key: key,
  department_name: depts.find((d) => d.key === key)?.name ?? key,
  owners_only: key === 'owners',
  role,
})

describe('editableDepartments', () => {
  it('gives an owner every assignable department, Owners included and last', () => {
    expect(editableDepartments(depts, true, []).map((d) => d.key)).toEqual(['brewery', 'office', 'sales', 'bar', 'owners'])
  })

  it('never gives a manager Owners, even if their keys name it', () => {
    expect(editableDepartments(depts, false, ['office', 'owners']).map((d) => d.key)).toEqual(['office'])
  })
})

describe('membershipsPayload', () => {
  it('sends Owners as employee whatever the role says', () => {
    const editable = editableDepartments(depts, true, [])
    expect(membershipsPayload(editable, { office: 'manager', owners: 'manager', sales: '' })).toEqual([
      { department: 'office', role: 'manager' },
      { department: 'owners', role: 'employee' },
    ])
  })

  it("a manager's save never sends Owners", () => {
    const editable = editableDepartments(depts, false, ['office'])
    expect(membershipsPayload(editable, { office: 'employee', owners: 'employee' })).toEqual([{ department: 'office', role: 'employee' }])
  })
})

describe('membershipLabel', () => {
  it('calls an Owners membership "member", others by role', () => {
    expect(membershipLabel(m('owners'))).toBe('Owners: member')
    expect(membershipLabel(m('office'))).toBe('Office: employee')
    expect(membershipLabel(m('brewery', 'manager'))).toBe('Brewery: manager')
  })
})

describe('sortMemberships', () => {
  it('follows the department order, Owners last', () => {
    expect(sortMemberships([m('owners'), m('bar'), m('brewery', 'manager')], depts).map((x) => x.department_key)).toEqual(['brewery', 'bar', 'owners'])
  })
})

describe('userAccess (D58)', () => {
  const base = { id: 1, email: 'a@x', name: 'A', active: true, is_owner: false, must_reset_password: false, memberships: [], inserted_at: '', updated_at: '' } as User

  it('reads the row the API sent', () => {
    expect(
      userAccess({ ...base, can_edit: false, can_deactivate: false, addable_departments: [{ key: 'brewery', name: 'Brewery' }] }),
    ).toEqual({ canEdit: false, canDeactivate: false, addable: [{ key: 'brewery', name: 'Brewery' }] })
  })

  it('treats a row without them as editable, with nothing to add', () => {
    expect(userAccess(base)).toEqual({ canEdit: true, canDeactivate: true, addable: [] })
    expect(userAccess(null)).toEqual({ canEdit: true, canDeactivate: true, addable: [] })
  })
})
