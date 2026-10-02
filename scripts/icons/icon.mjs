/**
 * Source artwork for the app icons: a football on a turf-green tile.
 *
 * `inset` scales the football so maskable icons keep it inside the 80% safe zone that Android
 * crops to; `rounded` gives the plain icon its own corners (maskable and Apple icons are
 * cropped by the OS, so they stay square and opaque).
 */
export function iconSvg({ size, inset = 1, rounded = false }) {
  const bg = "#166534";
  const ball = "#fafafa";
  const radius = rounded ? size * 0.22 : 0;
  const s = (size / 512) * inset; // artwork is drawn on a 512 grid around the centre
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${radius}" fill="${bg}"/>
  <g transform="translate(${size / 2} ${size / 2}) scale(${s}) rotate(-40)">
    <path d="M -190 0 Q 0 -230 190 0 Q 0 230 -190 0 Z" fill="${ball}"/>
    <g stroke="${bg}" stroke-linecap="round">
      <line x1="-70" y1="0" x2="70" y2="0" stroke-width="18"/>
      ${[-48, -16, 16, 48].map((x) => `<line x1="${x}" y1="-24" x2="${x}" y2="24" stroke-width="14"/>`).join("")}
      <path d="M -150 -28 Q -128 0 -150 28" fill="none" stroke-width="12"/>
      <path d="M 150 -28 Q 128 0 150 28" fill="none" stroke-width="12"/>
    </g>
  </g>
</svg>`;
}
