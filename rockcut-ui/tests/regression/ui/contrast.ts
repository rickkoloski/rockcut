import type { Locator } from '@playwright/test'

/**
 * WCAG contrast of an element's text/icon color (`color`, which icons fill
 * with) against the background it sits on: the nearest backgrounds up the
 * tree, see-through ones blended down. D43 DEV QA G1–G3.
 */
export async function contrastOf(locator: Locator): Promise<number> {
  return locator.evaluate((el) => {
    type C = [number, number, number, number]
    const parse = (s: string): C => {
      const m = (s.match(/[\d.]+/g) ?? ['0', '0', '0', '0']).map(Number)
      return [m[0], m[1], m[2], m.length > 3 ? m[3] : 1]
    }
    const over = (top: C, under: C): C => {
      const a = top[3]
      return [top[0] * a + under[0] * (1 - a), top[1] * a + under[1] * (1 - a), top[2] * a + under[2] * (1 - a), 1]
    }
    const layers: C[] = []
    for (let n: Element | null = el; n; n = n.parentElement) {
      const c = parse(getComputedStyle(n).backgroundColor)
      if (c[3] > 0) layers.push(c)
      if (c[3] >= 1) break
    }
    let bg: C = [255, 255, 255, 1]
    for (const layer of layers.reverse()) bg = over(layer, bg)
    const fg = over(parse(getComputedStyle(el).color), bg)
    const lum = (c: C) => {
      const f = (v: number) => (v / 255 <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4)
      return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2])
    }
    const [hi, lo] = [lum(fg), lum(bg)].sort((x, y) => y - x)
    return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100
  })
}

/** Every visible, enabled icon-only button under `root`, with its contrast (aria-label or test id to name it). */
export async function iconButtonContrasts(root: Locator): Promise<{ name: string; ratio: number }[]> {
  const buttons = root.locator('button.MuiIconButton-root:visible:not(.Mui-disabled)')
  const out: { name: string; ratio: number }[] = []
  for (const b of await buttons.all()) {
    const name = (await b.getAttribute('aria-label')) ?? (await b.getAttribute('data-testid')) ?? '?'
    out.push({ name, ratio: await contrastOf(b) })
  }
  return out
}
