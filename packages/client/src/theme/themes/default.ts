import { IThemeRGB } from '../types';

/**
 * Default light theme: brand navy on cool grays. "mock" labels name the palette key in the
 * platform repo's docs/design-web-claude-style.md mockups; "derived" values are interpolated.
 */
export const defaultTheme: IThemeRGB = {
  // Text colors
  'rgb-text-primary': '21 24 30', // #15181e (mock text)
  'rgb-text-secondary': '60 65 74', // #3c414a (mock text2)
  'rgb-text-secondary-alt': '93 100 112', // #5d6470 (mock text3)
  'rgb-text-tertiary': '93 100 112', // #5d6470 (mock text3)
  'rgb-text-muted': '105 110 121', // #696e79 (Click UI text.muted)
  'rgb-text-warning': '146 64 14', // #92400e (amber-800), AA on the #eff2f6 sidebar
  'rgb-text-destructive': '185 28 28', // #b91c1c (red-700), AA on the #eff2f6 sidebar
  'rgb-shimmer-base': '21 24 30', // #15181e (mock text, matching text-primary)
  'rgb-shimmer-dip': '129 130 134', // #818286

  // Link and accent colors
  /** 브랜드 네이비(#06377b) 계열. 흰 배경 대비 11.4:1(수동 계산, 자동 회귀 검증은
   *  하지 못함)로 기존 blue-600(4.5:1대)보다 대비가 높아지므로 접근성은 낮아지지 않는다. */
  'rgb-link': '6 55 123', // #06377b (brand navy)
  'rgb-link-hover': '5 44 98', // #052c62 (brand navy, darkened ~20%)
  'rgb-link-visited': '147 51 234', // #9333ea (purple-600)
  'rgb-accent-primary': '6 55 123', // #06377b (brand navy)
  'rgb-accent-primary-hover': '5 44 98', // #052c62 (brand navy, darkened ~20%)

  // Ring colors
  'rgb-ring-primary': '80 118 175', // #5076af (ndesign 초점 표시 지정 색)

  // Header colors
  'rgb-header-primary': '247 248 250', // #f7f8fa (mock bg)
  'rgb-header-hover': '238 241 245', // #eef1f5 (mock tile)
  'rgb-header-button-hover': '238 241 245', // #eef1f5 (mock tile)

  // Surface colors
  'rgb-surface-active': '227 232 239', // #e3e8ef (mock active)
  'rgb-surface-active-alt': '221 226 234', // #dde2ea (mock border)
  'rgb-surface-hover': '227 232 239', // #e3e8ef (mock active)
  'rgb-surface-hover-alt': '211 217 226', // #d3d9e2 (cool gray, derived)
  'rgb-surface-composer-hover': '227 232 239', // #e3e8ef (mock active)
  'rgb-surface-primary': '255 255 255', // #ffffff (mock surface)
  'rgb-chart-widget-surface': '255 255 255', // #fff (Click UI chart widget)
  'rgb-chart-widget-stroke': '230 231 233', // #e6e7e9 (Click UI chart widget)
  'rgb-surface-primary-alt': '239 242 246', // #eff2f6 (mock side)
  'rgb-surface-primary-contrast': '236 239 243', // #eceff3 (mock muteSoft)
  'rgb-surface-secondary': '247 249 251', // #f7f9fb (mock sub)
  'rgb-surface-secondary-alt': '227 232 239', // #e3e8ef (mock active)
  'rgb-surface-tertiary': '238 241 245', // #eef1f5 (mock tile)
  'rgb-surface-tertiary-alt': '255 255 255', // #ffffff (mock surface)
  'rgb-surface-dialog': '255 255 255', // #ffffff (mock surface)
  'rgb-surface-overlay': '89 89 89', // #595959 (gray-500)
  /** 흰 글자 위 대비 11.4:1(수동 계산). 다크 테마는 시안의 밝은 네이비를 쓴다 (dark.ts 참고). */
  'rgb-surface-submit': '6 55 123', // #06377b (brand navy)
  'rgb-surface-submit-hover': '5 44 98', // #052c62 (brand navy, darkened ~20%)
  'rgb-surface-destructive': '185 28 28', // #b91c1c (red-700)
  'rgb-surface-destructive-hover': '153 27 27', // #991b1b (red-800)
  'rgb-surface-chat': '255 255 255', // #ffffff (mock surface)
  'rgb-surface-code': '244 246 249', // #f4f6f9 (mock code)
  'rgb-surface-inverted': '21 24 30', // #15181e (mock text)
  'rgb-surface-inverted-hover': '60 65 74', // #3c414a (mock text2)
  'rgb-text-inverted': '255 255 255', // #fff (white)
  'rgb-surface-fixed': '255 255 255', // #fff (white) — same in light + dark
  'rgb-surface-fixed-hover': '238 241 245', // #eef1f5 (mock tile, same in light + dark)
  'rgb-text-fixed': '21 24 30', // #15181e (mock text, same in light + dark)

  // Border colors
  'rgb-border-light': '221 226 234', // #dde2ea (mock border)
  'rgb-border-medium': '200 207 217', // #c8cfd9 (cool gray, derived)
  'rgb-border-medium-alt': '200 207 217', // #c8cfd9 (cool gray, derived)
  'rgb-border-heavy': '152 160 173', // #98a0ad (cool gray, derived)
  'rgb-border-xheavy': '93 100 112', // #5d6470 (mock text3)
  'rgb-border-destructive': '220 38 38', // #dc2626 (red-600)

  // Status colors
  'rgb-status-success': '25 116 71', // #197447 (mock ok)
  'rgb-status-success-subtle': '227 242 234', // #e3f2ea (mock okSoft)
  'rgb-status-success-border': '110 231 183', // #6ee7b7 (green-300)
  'rgb-status-success-strong': '2 133 94', // #02855e
  'rgb-status-info': '37 99 235', // #2563eb (blue-600)
  'rgb-status-info-subtle': '239 246 255', // #eff6ff (blue-50)
  'rgb-status-info-border': '147 197 253', // #93c5fd (blue-300)
  'rgb-status-info-strong': '93 100 112', // #5d6470 (mock text3)
  'rgb-status-warning': '180 83 9', // #b45309 (amber-700)
  'rgb-status-warning-subtle': '255 251 235', // #fffbeb (amber-50)
  'rgb-status-warning-border': '252 211 77', // #fcd34d (amber-300)
  'rgb-status-warning-strong': '199 82 9', // #c75209
  'rgb-status-error': '185 28 28', // #b91c1c (red-700)
  'rgb-status-error-subtle': '254 242 242', // #fef2f2 (red-50)
  'rgb-status-error-border': '252 165 165', // #fca5a5 (red-300)
  'rgb-status-error-strong': '224 47 31', // #e02f1f
  'rgb-status-neutral': '74 81 92', // #4a515c (mock mute)
  'rgb-status-neutral-subtle': '236 239 243', // #eceff3 (mock muteSoft)
  'rgb-status-neutral-border': '200 207 217', // #c8cfd9 (cool gray, derived)
  /** Verified mark. `blue-600` doubles as `status-info` here, and that is the
   *  point: one blue for "this is informational/first-party", 5.17:1 under the
   *  white label and 4.90:1 against the panel. */
  'rgb-status-verified': '37 99 235', // #2563eb (blue-600)
  'rgb-text-on-status': '255 255 255', // #fff (white)

  // Brand colors
  'rgb-brand-purple': '126 34 206', // #7e22ce (purple-700)

  /** Code syntax highlighting, measured against the `surface-code` fill. */
  'rgb-syntax-text': '21 24 30', // #15181e (mock text)
  'rgb-syntax-comment': '93 100 112', // #5d6470 (mock text3)
  'rgb-syntax-meta': '60 65 74', // #3c414a (mock text2)
  'rgb-syntax-builtin': '154 103 0', // #9a6700
  'rgb-syntax-keyword': '5 80 174', // #0550ae
  'rgb-syntax-string': '10 123 98', // #0a7b62
  'rgb-syntax-attr': '154 47 106', // #9a2f6a
  'rgb-syntax-title': '180 35 24', // #b42318

  /** Categorical series scale. Steps clear 3:1 against BOTH the popover surface
   *  and the #ececec meter track, with worst adjacent CVD ΔE 12.4 and worst
   *  adjacent normal-vision ΔE 19.0. Slot order is the CVD-safety mechanism:
   *  indigo(8) sits beside green(7) because blue separates from green under
   *  protanopia/deuteranopia where red would not. */
  'rgb-series-1': '5 110 189', // #056ebd (cerulean)
  'rgb-series-2': '233 86 13', // #e9560d (orange)
  'rgb-series-3': '0 148 142', // #00948e (aqua)
  'rgb-series-4': '182 123 5', // #b67b05 (amber)
  'rgb-series-5': '216 90 142', // #d85a8e (magenta)
  'rgb-series-6': '126 35 205', // #7e23cd (violet)
  'rgb-series-7': '1 131 1', // #018301 (green)
  'rgb-series-8': '63 81 181', // #3f51b5 (indigo)

  /** Unchecked switch track. 3.03:1 against the white page and the
   *  `surface-primary` thumb, 5.86:1 against the checked `surface-inverted`
   *  track, so the control reads in either state. */
  'rgb-switch-unchecked': '148 148 148', // #949494

  // Presentation
  'rgb-presentation': '247 248 250', // #f7f8fa (mock bg)
};
