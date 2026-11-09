import { describe, expect, it } from 'vitest'
import { isChannelKey } from './channels'

// D55 lead decisions 6, gap 4: a tablet says "Page not found" for a channel
// URL that can't be a channel, and "Not available" for one that can.
describe('isChannelKey', () => {
  it('knows the channel keys', () => {
    for (const k of ['all', 'managers', 'dept:brewery', 'dept:bar']) expect(isChannelKey(k)).toBe(true)
  })

  it('anything else is no channel', () => {
    for (const k of ['nope', 'dept:', 'dept:Brewery', 'all ', 'dept:bar/x', '<script>', 'managers2', ''])
      expect(isChannelKey(k)).toBe(false)
  })
})
