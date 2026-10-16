import { describe, expect, it } from 'vitest'
import { contrastRatio, contrastText, departmentShades, shiftColor } from './colors'

// D43 DEV QA G3: chip text on the light shift fills (Brewer #D6934A, Bar-mid
// #7EABDE) was white at about 2.5:1.
describe('contrastText', () => {
  it('picks black on the light fills QA named', () => {
    expect(contrastText('#D6934A')).toBe('#000000')
    expect(contrastText('#7EABDE')).toBe('#000000')
  })

  it('keeps white on dark fills', () => {
    expect(contrastText('#1F4E8C')).toBe('#ffffff')
    expect(contrastText('#2F5A20')).toBe('#ffffff')
  })

  it('reaches 4.5:1 on every shade a position can pick, for every department hue', () => {
    for (const base of ['#C8782F', '#2E7D4F', '#3567B5', '#7E57C2', '#6b7280', '#D6934A']) {
      for (const { hex, fg } of departmentShades(base)) expect(contrastRatio(hex, fg), `${fg} on ${hex}`).toBeGreaterThanOrEqual(4.5)
      for (let id = 0; id < 7; id++) {
        const { bg, fg } = shiftColor(base, id)
        expect(contrastRatio(bg, fg), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5)
      }
    }
  })
})
