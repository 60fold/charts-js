/** Stable theme identifiers shipped by Sixtyfold. */
export const PUBLIC_THEME_IDS = Object.freeze([
  "default",
  "mainframe",
  "blueprint",
  "porcelain",
  "azulejo",
  "arizona",
  "neon",
  "shibuya",
  "arcology",
  "riviera",
  "bauhaus",
  "washi",
  "botanica",
  "newsprint",
] as const);

/** Stable identifier accepted by the public theme catalog. */
export type ChartThemeId = (typeof PUBLIC_THEME_IDS)[number];
