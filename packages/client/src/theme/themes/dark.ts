import { IThemeRGB } from '../types';

/**
 * Dark theme. The planner's AgentHub wireframe (docs/agent-hub-prototype_v29.html) has no dark
 * mode, so "wireframe" values reuse its violet palette at the light steps and "violet gray,
 * derived" values keep the old cool-gray luminance with the wireframe grays' violet cast.
 * "mock" labels are the earlier status palette the wireframe does not restate.
 */
export const darkTheme: IThemeRGB = {
  // Text colors
  'rgb-text-primary': '243 243 248', // #f3f3f8 (wireframe gray-100)
  'rgb-text-secondary': '211 211 222', // #d3d3de (wireframe gray-300)
  'rgb-text-secondary-alt': '166 166 182', // #a6a6b6 (wireframe gray-400)
  'rgb-text-tertiary': '166 166 182', // #a6a6b6 (wireframe gray-400)
  'rgb-text-muted': '179 182 189', // #b3b6bd (Click UI text.muted)
  'rgb-text-warning': '245 158 11', // #f59e0b (amber-500)
  'rgb-text-destructive': '248 113 113', // #f87171 (red-400)
  'rgb-shimmer-base': '255 255 255', // #ffffff, carried at 0.8 alpha
  'rgb-shimmer-dip': '179 179 179', // #b3b3b3

  // Link and accent colors
  /** 와이어프레임 보라의 밝은 단계(brand-300). surface-primary-alt(#18181f) 위 9.56:1,
   *  본문 바탕(#111117) 위 10.19:1(스크립트로 계산). */
  'rgb-link': '196 181 253', // #c4b5fd (wireframe brand-300)
  'rgb-link-hover': '221 214 254', // #ddd6fe (wireframe brand-200)
  'rgb-link-visited': '192 132 252', // #c084fc (purple-400)
  'rgb-accent-primary': '196 181 253', // #c4b5fd (wireframe brand-300)
  'rgb-accent-primary-hover': '221 214 254', // #ddd6fe (wireframe brand-200)

  // Ring colors
  'rgb-ring-primary': '167 139 250', // #a78bfa (wireframe brand-400: 4.18:1 on the #393945 hover)

  // Header colors
  'rgb-header-primary': '17 17 23', // #111117 (violet gray, derived)
  'rgb-header-hover': '40 40 50', // #282832 (violet gray, derived)
  'rgb-header-button-hover': '40 40 50', // #282832 (violet gray, derived)

  // Surface colors
  'rgb-surface-active': '42 42 52', // #2a2a34 (violet gray, derived)
  'rgb-surface-active-alt': '48 48 59', // #30303b (violet gray, derived)
  'rgb-surface-hover': '45 45 56', // #2d2d38 (violet gray, derived)
  'rgb-surface-hover-alt': '57 57 69', // #393945 (violet gray, derived)
  'rgb-surface-composer-hover': '57 57 69', // #393945 (violet gray, derived)
  'rgb-surface-primary': '31 31 40', // #1f1f28 (violet gray, derived)
  'rgb-chart-widget-surface': '40 40 40', // #282828 (Click UI chart widget)
  'rgb-chart-widget-stroke': '50 50 50', // #323232 (Click UI chart widget)
  'rgb-surface-primary-alt': '24 24 31', // #18181f (violet gray, derived)
  'rgb-surface-primary-contrast': '27 27 35', // #1b1b23 (violet gray, derived)
  'rgb-surface-secondary': '27 27 35', // #1b1b23 (violet gray, derived)
  'rgb-surface-secondary-alt': '40 40 50', // #282832 (violet gray, derived)
  'rgb-surface-tertiary': '40 40 50', // #282832 (violet gray, derived)
  'rgb-surface-tertiary-alt': '40 40 50', // #282832 (violet gray, derived)
  'rgb-surface-dialog': '31 31 40', // #1f1f28 (violet gray, derived)
  'rgb-surface-overlay': '0 0 0', // #000 (black)
  /** 라이트와 같은 brand-600. 흰 글자 위 5.70:1(스크립트로 계산). */
  'rgb-surface-submit': '124 58 237', // #7c3aed (wireframe brand-600)
  'rgb-surface-submit-hover': '109 40 217', // #6d28d9 (wireframe brand-700)
  'rgb-surface-message-user': '40 40 50', // #282832 (violet gray, derived)
  'rgb-surface-brand-subtle': '34 31 61', // #221f3d (wireframe ink-2)
  'rgb-surface-destructive': '153 27 27', // #991b1b (red-800)
  'rgb-surface-destructive-hover': '127 29 29', // #7f1d1d (red-900)
  'rgb-surface-chat': '40 40 50', // #282832 (violet gray, derived)
  'rgb-surface-code': '25 25 33', // #191921 (violet gray, derived)
  'rgb-surface-inverted': '255 255 255', // #fff (white)
  'rgb-surface-inverted-hover': '243 243 248', // #f3f3f8 (wireframe gray-100)
  'rgb-text-inverted': '21 21 28', // #15151c (wireframe gray-900)
  'rgb-surface-fixed': '255 255 255', // #fff (white) — same in light + dark
  'rgb-surface-fixed-hover': '243 243 248', // #f3f3f8 (wireframe gray-100, same in light + dark)
  'rgb-text-fixed': '21 21 28', // #15151c (wireframe gray-900, same in light + dark)

  // Border colors
  'rgb-border-light': '48 48 59', // #30303b (violet gray, derived)
  'rgb-border-medium': '65 65 78', // #41414e (violet gray, derived)
  'rgb-border-medium-alt': '65 65 78', // #41414e (violet gray, derived)
  'rgb-border-brand': '47 43 82', // #2f2b52 (wireframe ink-3)
  'rgb-border-heavy': '91 91 106', // #5b5b6a (violet gray, derived)
  'rgb-border-xheavy': '166 166 182', // #a6a6b6 (wireframe gray-400)
  'rgb-border-destructive': '239 68 68', // #ef4444 (red-500)

  // Status colors
  'rgb-status-success': '111 207 154', // #6fcf9a (mock ok)
  'rgb-status-success-subtle': '22 48 31', // #16301f (mock okSoft)
  'rgb-status-success-border': '6 95 70', // #065f46 (green-800)
  /** Not `green-800` like its border twin: this fill also paints bare marks
   *  (selection checks, the version timeline rail, prompt chips) that have to
   *  clear 3:1 against the `surface-secondary` panel, where green-800 falls
   *  short. Balanced instead, the same way light's `#02855e` is: 4.55:1 under
   *  the white `text-on-status` label and 3.76:1 against the #1b1b23 panel. */
  'rgb-status-success-strong': '8 135 89', // #088759
  'rgb-status-info': '147 197 253', // #93c5fd (blue-300)
  'rgb-status-info-subtle': '23 37 84', // #172554 (blue-950)
  'rgb-status-info-border': '30 64 175', // #1e40af (blue-800)
  'rgb-status-info-strong': '65 65 78', // #41414e (violet gray, derived)
  'rgb-status-warning': '252 211 77', // #fcd34d (amber-300)
  'rgb-status-warning-subtle': '69 26 3', // #451a03 (amber-950)
  'rgb-status-warning-border': '146 64 14', // #92400e (amber-800)
  'rgb-status-warning-strong': '146 64 14', // #92400e (amber-800)
  'rgb-status-error': '252 165 165', // #fca5a5 (red-300)
  'rgb-status-error-subtle': '69 10 10', // #450a0a (red-950)
  'rgb-status-error-border': '153 27 27', // #991b1b (red-800)
  'rgb-status-error-strong': '153 27 27', // #991b1b (red-800)
  'rgb-status-neutral': '211 211 222', // #d3d3de (wireframe gray-300)
  'rgb-status-neutral-subtle': '44 44 55', // #2c2c37 (violet gray, derived)
  'rgb-status-neutral-border': '48 48 59', // #30303b (violet gray, derived)
  /** Verified mark. Not `status-info`'s `blue-300`, which is a text hue and
   *  leaves a white check at 1.35:1. The card it sits on is `surface-dialog`
   *  at rest and `surface-tertiary` (#282832) on hover, and that hover is the
   *  binding constraint. Both relationships are graphical (WCAG 1.4.11): 3.52:1
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

  /** Unchecked switch track. 3.51:1 against the `surface-primary` thumb,
   *  4.66:1 against the checked `surface-inverted` track. */
  'rgb-switch-unchecked': '115 115 130', // #737382 (violet gray, derived)

  // Presentation
  'rgb-presentation': '17 17 23', // #111117 (violet gray, derived)
};
