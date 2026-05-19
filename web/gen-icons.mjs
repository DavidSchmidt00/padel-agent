import { Resvg } from '@resvg/resvg-js'
import { readFileSync, writeFileSync } from 'fs'

// ── Maskable icon SVG ────────────────────────────────────────────────────────
// Full-bleed background, racket at 62% scale + 12° tilt so everything stays
// well inside the 80% safe zone. Sparkle repositioned to (325,138) — computed
// from where the top-right of the tilted head lands after both transforms,
// confirmed within the safe zone. Radial glow adds depth behind the racket.
const maskableSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="grad" x1="0" y1="0" x2="512" y2="512" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#22ff7a"/>
      <stop offset="100%" stop-color="#00d4ff"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="48%" r="44%">
      <stop offset="0%" stop-color="#22ff7a" stop-opacity="0.14"/>
      <stop offset="100%" stop-color="#22ff7a" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <!-- Full-bleed background -->
  <rect width="512" height="512" fill="#0f1117"/>

  <!-- Soft green glow behind the racket -->
  <rect width="512" height="512" fill="url(#glow)"/>

  <!--
    Racket: scaled to 62% around the visual centroid (256,262),
    then rotated –12° around the same point.
    Bounding box after both transforms stays within the 80% safe zone.
  -->
  <g transform="rotate(-12,256,262) translate(256,262) scale(0.62) translate(-256,-262)">
    <path
      d="M 194,303 A 125,125 0 1 1 318,303 L 281,326 L 281,450 A 25,25 0 0 1 231,450 L 231,326 Z"
      fill="url(#grad)"
    />
    <circle cx="256" cy="195" r="100" fill="#091510"/>
    <circle cx="216" cy="120" r="11" fill="url(#grad)"/>
    <circle cx="256" cy="120" r="11" fill="url(#grad)"/>
    <circle cx="296" cy="120" r="11" fill="url(#grad)"/>
    <circle cx="196" cy="153" r="11" fill="url(#grad)"/>
    <circle cx="236" cy="153" r="11" fill="url(#grad)"/>
    <circle cx="276" cy="153" r="11" fill="url(#grad)"/>
    <circle cx="316" cy="153" r="11" fill="url(#grad)"/>
    <circle cx="176" cy="186" r="11" fill="url(#grad)"/>
    <circle cx="216" cy="186" r="11" fill="url(#grad)"/>
    <circle cx="256" cy="186" r="11" fill="url(#grad)"/>
    <circle cx="296" cy="186" r="11" fill="url(#grad)"/>
    <circle cx="336" cy="186" r="11" fill="url(#grad)"/>
    <circle cx="196" cy="219" r="11" fill="url(#grad)"/>
    <circle cx="236" cy="219" r="11" fill="url(#grad)"/>
    <circle cx="276" cy="219" r="11" fill="url(#grad)"/>
    <circle cx="316" cy="219" r="11" fill="url(#grad)"/>
    <circle cx="216" cy="252" r="11" fill="url(#grad)"/>
    <circle cx="256" cy="252" r="11" fill="url(#grad)"/>
    <circle cx="296" cy="252" r="11" fill="url(#grad)"/>
    <rect x="231" y="350" width="50" height="5" rx="2" fill="#0f1117" opacity="0.45"/>
    <rect x="231" y="370" width="50" height="5" rx="2" fill="#0f1117" opacity="0.45"/>
    <rect x="231" y="390" width="50" height="5" rx="2" fill="#0f1117" opacity="0.45"/>
    <rect x="231" y="410" width="50" height="5" rx="2" fill="#0f1117" opacity="0.45"/>
  </g>

  <!--
    AI sparkle — outside the rotated racket group so it doesn't inherit
    the transform. Positioned at (325,138): top-right of the tilted head
    after scale+rotate, confirmed well inside the 80% safe zone.
    Center (325,138), outer R=18, inner r=7.
  -->
  <path
    d="M343,138 L330,133 L325,120 L320,133 L307,138 L320,143 L325,156 L330,143 Z"
    fill="white"
  />
</svg>`

const pub = 'public'
const tasks = [
  { file: 'android-icon-192x192.png', svg: maskableSvg,                              size: 192 },
  { file: 'apple-icon-180x180.png',   svg: readFileSync(`${pub}/icon.svg`, 'utf8'),   size: 180 },
  { file: 'favicon-32x32.png',        svg: readFileSync(`${pub}/icon.svg`, 'utf8'),   size: 32  },
]

for (const { file, svg, size } of tasks) {
  const buf = new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng()
  writeFileSync(`${pub}/${file}`, buf)
  console.log('✓', file, `${size}px`)
}
