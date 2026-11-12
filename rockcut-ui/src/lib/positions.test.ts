import { describe, expect, it } from 'vitest'
import { canWriteTemplate, positionGroups } from './positions'
import type { Department, Position, ScheduleTemplate } from './types'

const depts: Department[] = [
  { id: 1, key: 'brewery', name: 'Brewery' },
  { id: 2, key: 'bar', name: 'Taproom' },
  { id: 3, key: 'office', name: 'Office' },
]
const pos = (id: number, department_id: number): Position => ({ id, name: `P${id}`, group: null, active: true, department_id, color_shade: null })
const positions = [pos(10, 1), pos(11, 2), pos(12, 1)]

describe('positionGroups (D58)', () => {
  it("shows a manager's departments as editable, even empty, and others' with positions read-only", () => {
    const groups = positionGroups(depts, positions, (id) => id === 1 || id === 3)
    expect(groups.map((g) => [g.department.key, g.positions.map((p) => p.id), g.editable])).toEqual([
      ['brewery', [10, 12], true],
      ['bar', [11], false],
      ['office', [], true],
    ])
  })

  it('leaves out a read-only department with no positions', () => {
    expect(positionGroups(depts, positions, (id) => id === 2).map((g) => g.department.key)).toEqual(['brewery', 'bar'])
  })
})

describe('canWriteTemplate (D58)', () => {
  const template = (deptIds: number[]): ScheduleTemplate =>
    ({
      id: 1,
      name: 'T',
      kind: 'week',
      items: deptIds.map((d, i) => ({ id: i, position_id: i, position: pos(i, d), assignee_id: null, day_index: 0, start_time: '07:00:00', end_time: '15:00:00', notes: null })),
    }) as ScheduleTemplate

  it('needs every position in a managed department', () => {
    expect(canWriteTemplate(template([1, 1]), (id) => id === 1)).toBe(true)
    expect(canWriteTemplate(template([1, 2]), (id) => id === 1)).toBe(false)
    expect(canWriteTemplate(template([]), () => false)).toBe(true)
  })
})
