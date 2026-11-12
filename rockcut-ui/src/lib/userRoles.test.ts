import { describe, expect, it } from 'vitest'
import { editableDepartments, membershipLabel, membershipsPayload, readOnlyOwnersOnly, sortMemberships } from './userRoles'
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

describe('readOnlyOwnersOnly', () => {
  it("shows a manager the person's Owners membership, from the membership alone", () => {
    // D59 decision 9: a manager's department list has no Owners.
    const managerDepts = depts.filter((d) => !d.owners_only)
    const editable = editableDepartments(managerDepts, false, ['office'])
    expect(readOnlyOwnersOnly([m('office'), m('owners')], editable)).toEqual([{ key: 'owners', name: 'Owners' }])
  })

  it('nothing for an owner (they can change it) or a person not in Owners', () => {
    expect(readOnlyOwnersOnly([m('owners')], editableDepartments(depts, true, []))).toEqual([])
    expect(readOnlyOwnersOnly([m('office')], editableDepartments(depts, false, ['office']))).toEqual([])
    expect(readOnlyOwnersOnly(null, [])).toEqual([])
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
