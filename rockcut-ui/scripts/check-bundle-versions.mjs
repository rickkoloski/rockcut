#!/usr/bin/env node
// Release-gate check (task 3999): confirm a deployed UI bundle carries the
// versions pnpm-lock.yaml pins, for the packages whose version is visible in
// the built JS. Run after every DEV and prod UI deploy:
//
//   node scripts/check-bundle-versions.mjs https://rockcut-ui-dev.fly.dev
//   node scripts/check-bundle-versions.mjs https://rockcut-ui.fly.dev
//
// Exits 1 on any mismatch. Pair it with `pnpm audit --prod` (workflow §5).
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const base = (process.argv[2] || '').replace(/\/$/, '')
if (!base) {
  console.error('usage: node scripts/check-bundle-versions.mjs <ui-url>')
  process.exit(2)
}

const lockPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../pnpm-lock.yaml')
const lock = readFileSync(lockPath, 'utf8')
const lockVersion = (name) => lock.match(new RegExp(`^  ${name}@([0-9][^:(]*):`, 'm'))?.[1]

// How each package stamps its version into the minified bundle.
const probes = {
  axios: (js) => {
    const id = js.match(/"User-Agent","axios\/"\+([\w$]+)/)?.[1]
    return id && js.match(new RegExp(`[^\\w$]${id.replace(/\$/g, '\\$')}="([0-9.]+)"`))?.[1]
  },
  'react-router': (js) => js.match(/__reactRouterVersion="([0-9.]+)"/)?.[1],
}

const html = await (await fetch(`${base}/`)).text()
const scripts = [...new Set(html.match(/\/assets\/[^"]+\.js/g) || [])]
if (scripts.length === 0) {
  console.error(`no /assets/*.js found in ${base}/`)
  process.exit(1)
}
const js = (await Promise.all(scripts.map(async (s) => (await fetch(base + s)).text()))).join('\n')

let failed = false
for (const [name, probe] of Object.entries(probes)) {
  const want = lockVersion(name)
  const got = probe(js)
  const ok = want && got === want
  if (!ok) failed = true
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}: bundle ${got ?? 'not found'}, lockfile ${want ?? 'not found'}`)
}
console.log(`checked ${scripts.join(', ')} on ${base}`)
process.exit(failed ? 1 : 0)
