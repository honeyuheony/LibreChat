import { IThemeRGB } from '../types';

/**
 * Dark theme: brand navy on cool grays. "mock" labels name the palette key in the
 * platform repo's docs/design-web-claude-style.md mockups; "derived" values are interpolated.
 */
export const darkTheme: IThemeRGB = {
  // Text colors
  'rgb-text-primary': '238 241 245', // #eef1f5 (mock text)
  'rgb-text-secondary': '195 201 211', // #c3c9d3 (mock text2)
  'rgb-text-secondary-alt': '152 160 173', // #98a0ad (mock text3)
  'rgb-text-tertiary': '152 160 173', // #98a0ad (mock text3)
  'rgb-text-muted': '179 182 189', // #b3b6bd (Click UI text.muted)
  'rgb-text-warning': '245 158 11', // #f59e0b (amber-500)
  'rgb-text-destructive': '248 113 113', // #f87171 (red-400)
  'rgb-shimmer-base': '255 255 255', // #ffffff, carried at 0.8 alpha
  'rgb-shimmer-dip': '179 179 179', // #b3b3b3

  // Link and accent colors
  /** 브랜드 네이비(#06377b)를 어두운 배경에서도 읽히도록 밝힌 시안 톤. 사이드바(#141920)
   *  위 9.0:1, 본문 바탕(#0f1217) 위 9.6:1(스크립트로 계산). */
  'rgb-link': '157 187 232', // #9dbbe8 (mock brandText)
  'rgb-link-hover': '193 212 240', // #c1d4f0 (mock brandText, lightened)
  'rgb-link-visited': '192 132 252', // #c084fc (purple-400)
  'rgb-accent-primary': '157 187 232', // #9dbbe8 (mock brandText)
  'rgb-accent-primary-hover': '193 212 240', // #c1d4f0 (mock brandText, lightened)

  // Ring colors
  'rgb-ring-primary': '123 159 214', // #7b9fd6 (cool navy, derived: 4.25:1 on the #313a47 hover)

  // Header colors
  'rgb-header-primary': '15 18 23', // #0f1217 (mock bg)
  'rgb-header-hover': '34 42 53', // #222a35 (mock tile)
  'rgb-header-button-hover': '34 42 53', // #222a35 (mock tile)

  // Surface colors
  'rgb-surface-active': '35 43 55', // #232b37 (mock active)
  'rgb-surface-active-alt': '42 49 60', // #2a313c (mock border)
  'rgb-surface-hover': '38 46 58', // #262e3a (cool gray, derived)
  'rgb-surface-hover-alt': '49 58 71', // #313a47 (cool gray, derived)
  'rgb-surface-composer-hover': '49 58 71', // #313a47 (cool gray, derived)
  'rgb-surface-primary': '26 32 41', // #1a2029 (mock surface)
  'rgb-chart-widget-surface': '40 40 40', // #282828 (Click UI chart widget)
  'rgb-chart-widget-stroke': '50 50 50', // #323232 (Click UI chart widget)
  'rgb-surface-primary-alt': '20 25 32', // #141920 (mock side)
  'rgb-surface-primary-contrast': '22 28 36', // #161c24 (mock sub)
  'rgb-surface-secondary': '22 28 36', // #161c24 (mock sub)
  'rgb-surface-secondary-alt': '34 42 53', // #222a35 (mock tile)
  'rgb-surface-tertiary': '34 42 53', // #222a35 (mock tile)
  'rgb-surface-tertiary-alt': '34 42 53', // #222a35 (mock tile)
  'rgb-surface-dialog': '26 32 41', // #1a2029 (mock surface)
  'rgb-surface-overlay': '0 0 0', // #000 (black)
  /** #06377b 는 어두운 바탕에서 묻히므로 시안의 밝은 네이비를 쓴다. 흰 글자 위 6.2:1. */
  'rgb-surface-submit': '47 95 174', // #2f5fae (mock brand)
  'rgb-surface-submit-hover': '38 79 146', // #264f92 (mock brand, darkened)
  'rgb-surface-destructive': '153 27 27', // #991b1b (red-800)
  'rgb-surface-destructive-hover': '127 29 29', // #7f1d1d (red-900)
  'rgb-surface-chat': '34 42 53', // #222a35 (mock tile)
  'rgb-surface-code': '20 26 34', // #141a22 (mock code)
  'rgb-surface-inverted': '255 255 255', // #fff (white)
  'rgb-surface-inverted-hover': '238 241 245', // #eef1f5 (mock text)
  'rgb-text-inverted': '21 24 30', // #15181e (light mock text)
  'rgb-surface-fixed': '255 255 255', // #fff (white) — same in light + dark
  'rgb-surface-fixed-hover': '238 241 245', // #eef1f5 (mock tile, same in light + dark)
  'rgb-text-fixed': '21 24 30', // #15181e (mock text, same in light + dark)

  // Border colors
  'rgb-border-light': '42 49 60', // #2a313c (mock border)
  'rgb-border-medium': '58 66 79', // #3a424f (cool gray, derived)
  'rgb-border-medium-alt': '58 66 79', // #3a424f (cool gray, derived)
  'rgb-border-heavy': '83 92 106', // #535c6a (cool gray, derived)
  'rgb-border-xheavy': '152 160 173', // #98a0ad (mock text3)
  'rgb-border-destructive': '239 68 68', // #ef4444 (red-500)

  // Status colors
  'rgb-status-success': '111 207 154', // #6fcf9a (mock ok)
  'rgb-status-success-subtle': '22 48 31', // #16301f (mock okSoft)
  'rgb-status-success-border': '6 95 70', // #065f46 (green-800)
  /** Not `green-800` like its border twin: this fill also paints bare marks
   *  (selection checks, the version timeline rail, prompt chips) that have to
   *  clear 3:1 against the `surface-secondary` panel, where green-800 falls
   *  short. Balanced instead, the same way light's `#02855e` is: 4.55:1 under
   *  the white `text-on-status` label and 3.77:1 against the #161c24 panel. */
  'rgb-status-success-strong': '8 135 89', // #088759
  'rgb-status-info': '147 197 253', // #93c5fd (blue-300)
  'rgb-status-info-subtle': '23 37 84', // #172554 (blue-950)
  'rgb-status-info-border': '30 64 175', // #1e40af (blue-800)
  'rgb-status-info-strong': '58 66 79', // #3a424f (cool gray, derived)
  'rgb-status-warning': '252 211 77', // #fcd34d (amber-300)
  'rgb-status-warning-subtle': '69 26 3', // #451a03 (amber-950)
  'rgb-status-warning-border': '146 64 14', // #92400e (amber-800)
  'rgb-status-warning-strong': '146 64 14', // #92400e (amber-800)
  'rgb-status-error': '252 165 165', // #fca5a5 (red-300)
  'rgb-status-error-subtle': '69 10 10', // #450a0a (red-950)
  'rgb-status-error-border': '153 27 27', // #991b1b (red-800)
  'rgb-status-error-strong': '153 27 27', // #991b1b (red-800)
  'rgb-status-neutral': '195 201 211', // #c3c9d3 (mock mute)
  'rgb-status-neutral-subtle': '38 45 56', // #262d38 (mock muteSoft)
  'rgb-status-neutral-border': '42 49 60', // #2a313c (mock border)
  /** Verified mark. Not `status-info`'s `blue-300`, which is a text hue and
   *  leaves a white check at 1.35:1. The card it sits on is `surface-dialog`
   *  at rest and `surface-tertiary` (#222a35) on hover, and that hover is the
   *  binding constraint. Both relationships are graphical (WCAG 1.4.11): 3.50:1
   *  against the hover surface, 3.95:1 against the resting dialog, and 4.14:1
   *  under the white `text-on-status` check. */
  'rgb-status-verified': '26 127 216', // #1a7fd8
  'rgb-text-on-status': '255 255 255', // #fff (white)

  // Brand colors
  'rgb-brand-purple': '171 104 255', // #ab68ff

  /** Code syntax highlighting, measured against the `surface-code` fill. The
   *  comment and meta values are the flattened equivalents of the alpha-blended
   *  whites this palette used before it was tokenized: 50% and 60% white over
   *  the #212121 code surface. */
  'rgb-syntax-text': '255 255 255', // #fff (white)
  'rgb-syntax-comment': '144 144 144', // #909090
  'rgb-syntax-meta': '166 166 166', // #a6a6a6
  'rgb-syntax-builtin': '233 149 12', // #e9950c
  'rgb-syntax-keyword': '46 149 211', // #2e95d3
  'rgb-syntax-string': '0 166 125', // #00a67d
  'rgb-syntax-attr': '223 48 121', // #df3079
  'rgb-syntax-title': '242 44 61', // #f22c3d

  /** Categorical series scale — the same eight hues stepped for the #212121
   *  surface: worst adjacent CVD ΔE 13.0, normal-vision ΔE 19.0, all ≥ 3:1.
   *  Slot 8 is muted rather than the light mode's saturated indigo because a
   *  slot also fills a badge chip under `text-on-status` white: #8c98e6 carried
   *  that glyph at only 2.71:1, this reads 3.66:1 and still clears 3.66:1 on
   *  every series surface. */
  'rgb-series-1': '9 140 238', // #098cee (cerulean)
  'rgb-series-2': '217 87 35', // #d95723 (orange)
  'rgb-series-3': '6 158 152', // #069e98 (aqua)
  'rgb-series-4': '200 133 12', // #c8850c (amber)
  'rgb-series-5': '213 82 130', // #d55282 (magenta)
  'rgb-series-6': '171 104 254', // #ab68fe (violet)
  'rgb-series-7': '80 167 49', // #50a731 (green)
  'rgb-series-8': '120 130 190', // #8082be (indigo)

  /** Unchecked switch track. 3.47:1 against the `surface-primary` thumb,
   *  4.72:1 against the checked `surface-inverted` track. */
  'rgb-switch-unchecked': '107 116 130', // #6b7482 (cool gray, derived)

  // Presentation
  'rgb-presentation': '15 18 23', // #0f1217 (mock bg)
};
