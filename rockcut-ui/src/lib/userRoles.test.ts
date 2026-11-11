import { describe, expect, it } from 'vitest'
import { editableDepartments, membershipsPayload, readOnlyOwnersOnly, sortMemberships } from './userRoles'
import type { Department, Membership } from './types'

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
  department_name: key,
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

describe('readOnlyOwnersOnly', () => {
  it("shows a manager the person's Owners membership", () => {
    const editable = editableDepartments(depts, false, ['office'])
    expect(readOnlyOwnersOnly([m('office'), m('owners')], depts, editable).map((d) => d.key)).toEqual(['owners'])
  })

  it('nothing for an owner (they can change it) or a person not in Owners', () => {
    expect(readOnlyOwnersOnly([m('owners')], depts, editableDepartments(depts, true, []))).toEqual([])
    expect(readOnlyOwnersOnly([m('office')], depts, editableDepartments(depts, false, ['office']))).toEqual([])
    expect(readOnlyOwnersOnly(null, depts, [])).toEqual([])
  })
})

describe('sortMemberships', () => {
  it('follows the department order, Owners last', () => {
    expect(sortMemberships([m('owners'), m('bar'), m('brewery', 'manager')], depts).map((x) => x.department_key)).toEqual(['brewery', 'bar', 'owners'])
  })
})
