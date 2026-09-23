// Regenerate the PWA icons in public/ from the source logo.
// `sharp` isn't a committed dependency (icons are generated once and committed);
// install it on demand to re-run:
//   pnpm add -D sharp && node scripts/gen-pwa-icons.cjs [srcLogo] [outDir] && pnpm remove sharp
// Outputs: pwa-192x192, pwa-512x512, maskable-512x512, apple-touch-icon, favicon-32x32.
const sharp = require('sharp')
const path = require('path')

const SRC = path.resolve(process.argv[2] || 'public/rockcut-logo.png')
const OUT = path.resolve(process.argv[3] || 'public')

const CREAM = { r: 250, g: 246, b: 240, alpha: 1 } // #FAF6F0 background_color
const BROWN = { r: 92, g: 64, b: 51, alpha: 1 }    // #5C4033 primary / maskable tile

async function make({ size, out, bg, contentRatio }) {
  const inner = Math.round(size * contentRatio)
  const logo = await sharp(SRC)
    .resize({ width: inner, height: inner, fit: 'inside', withoutEnlargement: false })
    .toBuffer()
  const meta = await sharp(logo).metadata()
  const left = Math.round((size - meta.width) / 2)
  const top = Math.round((size - meta.height) / 2)
  await sharp({ create: { width: size, height: size, channels: 4, background: bg } })
    .composite([{ input: logo, left, top }])
    .png()
    .toFile(path.join(OUT, out))
  console.log('wrote', out, `${size}x${size}`)
}

async function main() {
  // Regular icons: logo on cream, modest padding.
  await make({ size: 192, out: 'pwa-192x192.png', bg: CREAM, contentRatio: 0.72 })
  await make({ size: 512, out: 'pwa-512x512.png', bg: CREAM, contentRatio: 0.72 })
  // Maskable: brand tile with a large safe zone so masking never clips the logo.
  await make({ size: 512, out: 'maskable-512x512.png', bg: BROWN, contentRatio: 0.55 })
  // Apple touch icon (iOS applies its own rounded corners).
  await make({ size: 180, out: 'apple-touch-icon.png', bg: CREAM, contentRatio: 0.72 })
  // Favicon.
  await make({ size: 32, out: 'favicon-32x32.png', bg: CREAM, contentRatio: 0.82 })
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
