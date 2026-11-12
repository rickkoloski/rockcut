import { test, expect } from '@playwright/test'
import { authFile } from '../../config/test-env'

// D58 §3.9 (5206): an Idea Board card URL that names no card on the board (a
// missing card or a bad id) shows the board with a notice, and the URL becomes
// the board's. Read-only, so it runs in `chromium`.

const NOTICE = 'That card wasn’t found (it may have been deleted).'

for (const [persona, key] of [
  ['brewer1', 'brewery'],
  ['taproomDevice', 'bar'],
] as const) {
  test.describe(persona, () => {
    test.use({ storageState: authFile(persona) })

    for (const cardId of ['999999999', 'abc']) {
      test(`/boards/${key}/cards/${cardId} shows the board with the notice`, async ({ page }) => {
        await page.goto(`/boards/${key}/cards/${cardId}`)
        await expect(page.getByTestId('idea-toast')).toHaveText(NOTICE)
        await expect(page).toHaveURL(new RegExp(`/boards/${key}$`))
        await expect(page.getByTestId('board-title')).toBeVisible()
        await expect(page.getByTestId('idea-card-dialog')).toHaveCount(0)
      })
    }
  })
}
