// D52: department icons Material doesn't have, drawn on its 24px grid in the
// outlined style (mockup: docs/current_work/reference/nav_icons_mockup.html).
import { createSvgIcon } from '@mui/material'

const line = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

// Brewery: a conical fermenter on straight legs, with a manway on the front.
export const FermenterIcon = createSvgIcon(
  <>
    <path d="M6.8 6C8.1 4.1 9.9 3.3 12 3.3s3.9.8 5.2 2.7v6.8l-4.2 4.6h-2l-4.2-4.6z" {...line} />
    <path d="M11.1 17.6h1.8v2.6h-1.8zM11.2 1.6h1.6v1.4h-1.6z" />
    <ellipse cx="12" cy="9" rx="2.2" ry="1.5" {...line} strokeWidth={1.3} />
    <path d="M6.8 12.6v8.9M17.2 12.6v8.9" {...line} />
  </>,
  'Fermenter',
)

// Brewery → Production: two smaller fermenters, the cellar the schedule plans.
const smallTank = (x: number) => (
  <>
    <path d={`M${x - 3.7} 6.6C${x - 2.9} 5.2 ${x - 1.6} 4.5 ${x} 4.5s2.9.7 3.7 2.1v6.2l-2.9 3.4h-1.6l-2.9-3.4z`} {...line} strokeWidth={1.4} />
    <path d={`M${x - 0.5} 16.1h1v1.6h-1zM${x - 0.5} 3.1h1v1.3h-1z`} />
    <ellipse cx={x} cy="8.6" rx="1.5" ry="1" {...line} strokeWidth={1.1} />
    <path d={`M${x - 3.7} 12.6v8.6M${x + 3.7} 12.6v8.6`} {...line} strokeWidth={1.4} />
  </>
)
export const FermentersIcon = createSvgIcon(
  <>
    {smallTank(6.4)}
    {smallTank(17.6)}
  </>,
  'Fermenters',
)

// Brewery → Ingredient Library: the head of a barley stalk, kernels in two
// staggered rows on the stem, each with its awn.
const kernel = (cx: number, cy: number, tilt: number) => (
  <ellipse key={`${cx}-${cy}`} cx={cx} cy={cy} rx="1.1" ry="2.05" transform={`rotate(${tilt} ${cx} ${cy})`} />
)
export const BarleyIcon = createSvgIcon(
  <>
    <path d="M12 22.5V6.5" {...line} strokeWidth={1.25} />
    {kernel(12, 5.2, 0)}
    {[8.2, 11.9, 15.6].map((y) => kernel(9.9, y, -27))}
    {[10.05, 13.75, 17.45].map((y) => kernel(14.1, y, 27))}
    <path d="M12 3.1V.6M9.0 6.4 6.7 1.6M9.0 10.1 6.7 5.3M9.0 13.8 6.7 9.0M15.0 8.2 17.3 3.4M15.0 11.9 17.3 7.1M15.0 15.6 17.3 10.8" {...line} strokeWidth={0.85} />
  </>,
  'Barley',
)

// Taproom → Buy-a-Beer Board: the outlined beer mug (Material SportsBarOutlined)
// with a ribbon round the glass and a bow on the front: a beer bought as a gift.
const MUG =
  'M15 19H8v-6.63c1.26-.34 2.11-1.27 2.77-1.99C11.6 9.47 12.08 9 13 9h2zM10 2.02c-1.89 0-3.51 1.11-4.27 2.71C4.15 5.26 3 6.74 3 8.5c0 1.86 1.28 3.41 3 3.86V21h11v-2h2c1.1 0 2-.9 2-2v-6c0-1.1-.9-2-2-2h-1.56c.35-.59.56-1.27.56-2 0-2.21-1.79-4-4-4-.34 0-.66.05-.98.13-.82-.68-1.86-1.11-3.02-1.11M7 10.5c-1.1 0-2-.9-2-2 0-.85.55-1.6 1.37-1.88l.8-.27.36-.76C8 4.62 8.94 4.02 10 4.02c.79 0 1.39.35 1.74.65l.78.65S13.16 5 13.99 5c1.1 0 2 .9 2 2h-3C9.67 7 9.15 10.5 7 10.5M17 17v-6h2v6z'
const BOW = 'M11.5 14.6 6.4 11.7v5.8zM11.5 14.6l5.1-2.9v5.8z'
export const GiftMugIcon = createSvgIcon(
  <>
    <defs>
      {/* A gap in the mug round the bow, so the bow stands clear of the glass. */}
      <mask id="rockcut-gift-mug-gap" maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
        <rect width="24" height="24" fill="#fff" />
        <path d={BOW} fill="#000" stroke="#000" strokeWidth={1.6} strokeLinejoin="round" />
        <circle cx="11.5" cy="14.6" r="2.2" fill="#000" />
      </mask>
    </defs>
    <path d={MUG} mask="url(#rockcut-gift-mug-gap)" />
    {/* The bow, solid so it reads at nav size, with its knot. */}
    <path d={BOW} />
    <circle cx="11.5" cy="14.6" r="1.4" />
  </>,
  'GiftMug',
)

// Sales: a delivery van.
export const DeliveryVanIcon = createSvgIcon(
  <>
    <path d="M2.3 15.5V7.2c0-.5.4-.9.9-.9h11.7c.3 0 .6.1.8.4l3.5 3.9 1.9.8c.4.2.7.6.7 1v3.1" {...line} />
    <path d="M15.2 7.6h.4l2.3 2.6h-2.7zM8.3 14.8h7.4v1.6H8.3zM1.5 14.8h2.3v1.6H1.5zM20.2 14.8h2.3v1.6h-2.3z" />
    <circle cx="6" cy="16.6" r="1.9" {...line} />
    <circle cx="18" cy="16.6" r="1.9" {...line} />
  </>,
  'DeliveryVan',
)
