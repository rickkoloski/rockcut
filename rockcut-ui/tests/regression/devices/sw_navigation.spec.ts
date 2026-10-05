import { test, expect } from '@playwright/test'
import { SW_NAVIGATION_DENYLIST } from '../../../src/lib/swNavigation'

// DEV pass 3 G2: the service worker serves the app shell for every page,
// including D33's /devices, so a reload offline still opens the app. Only
// /api and /dev (whole path segments) go to the network.
const leftToNetwork = (path: string) => SW_NAVIGATION_DENYLIST.some((re) => re.test(path))

test('the app shell is served for app pages, /devices included', () => {
  for (const path of ['/', '/devices', '/devices/12', '/developer', '/schedule', '/profile', '/apiary']) {
    expect(leftToNetwork(path), path).toBe(false)
  }
})

test('/api and /dev still go to the network', () => {
  for (const path of ['/api', '/api/me', '/dev', '/dev/sw.js']) {
    expect(leftToNetwork(path), path).toBe(true)
  }
})
