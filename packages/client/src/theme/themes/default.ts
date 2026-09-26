import { IThemeRGB } from '../types';

/**
 * Default light theme: brand violet on violet-tinted grays. "wireframe" labels name the token in
 * the planner's AgentHub wireframe (docs/agent-hub-prototype_v29.html, "AgentHub 테마 v2");
 * "mock" labels are the earlier status palette the wireframe does not restate.
 */
export const defaultTheme: IThemeRGB = {
  // Text colors
  'rgb-text-primary': '21 21 28', // #15151c (wireframe gray-900)
  'rgb-text-secondary': '59 59 73', // #3b3b49 (wireframe gray-700)
  'rgb-text-secondary-alt': '86 86 102', // #565666 (wireframe gray-600)
  'rgb-text-tertiary': '86 86 102', // #565666 (wireframe gray-600)
  'rgb-text-muted': '107 107 124', // #6b6b7c (wireframe gray-500 darkened to clear AA, 5.22:1 on white)
  'rgb-text-warning': '146 64 14', // #92400e (amber-800), AA on the #f3f3f8 surface-primary-alt
  'rgb-text-destructive': '185 28 28', // #b91c1c (red-700), AA on the #f3f3f8 surface-primary-alt
  'rgb-shimmer-base': '21 21 28', // #15151c (wireframe gray-900, matching text-primary)
  'rgb-shimmer-dip': '129 130 134', // #818286

  // Link and accent colors
  /** 와이어프레임 브랜드 보라(brand-700). 흰 배경 대비 7.10:1, hover 인 brand-800 은 8.98:1
   *  (스크립트로 계산). AA 하한은 semanticTokens.spec.ts 가 brand-subtle 위에서 검사한다. */
  'rgb-link': '109 40 217', // #6d28d9 (wireframe brand-700)
  'rgb-link-hover': '91 33 182', // #5b21b6 (wireframe brand-800)
  'rgb-link-visited': '147 51 234', // #9333ea (purple-600)
  'rgb-accent-primary': '109 40 217', // #6d28d9 (wireframe brand-700)
  'rgb-accent-primary-hover': '91 33 182', // #5b21b6 (wireframe brand-800)

  // Ring colors
  'rgb-ring-primary': '139 92 246', // #8b5cf6 (wireframe brand-500, the focus-ring token)

  // Header colors
  'rgb-header-primary': '251 251 253', // #fbfbfd (wireframe bg)
  'rgb-header-hover': '243 243 248', // #f3f3f8 (wireframe gray-100)
  'rgb-header-button-hover': '243 243 248', // #f3f3f8 (wireframe gray-100)

  // Surface colors
  'rgb-surface-active': '231 231 239', // #e7e7ef (wireframe gray-200)
  'rgb-surface-active-alt': '231 231 239', // #e7e7ef (wireframe gray-200)
  'rgb-surface-hover': '231 231 239', // #e7e7ef (wireframe gray-200)
  'rgb-surface-hover-alt': '211 211 222', // #d3d3de (wireframe gray-300)
  'rgb-surface-composer-hover': '231 231 239', // #e7e7ef (wireframe gray-200)
  'rgb-surface-primary': '255 255 255', // #ffffff (wireframe surface)
  'rgb-chart-widget-surface': '255 255 255', // #fff (Click UI chart widget)
  'rgb-chart-widget-stroke': '230 231 233', // #e6e7e9 (Click UI chart widget)
  'rgb-surface-primary-alt': '243 243 248', // #f3f3f8 (wireframe gray-100)
  'rgb-surface-primary-contrast': '243 243 248', // #f3f3f8 (wireframe gray-100)
  'rgb-surface-secondary': '250 250 252', // #fafafc (wireframe gray-50)
  'rgb-surface-secondary-alt': '231 231 239', // #e7e7ef (wireframe gray-200)
  'rgb-surface-tertiary': '243 243 248', // #f3f3f8 (wireframe gray-100)
  'rgb-surface-tertiary-alt': '255 255 255', // #ffffff (wireframe surface)
  'rgb-surface-dialog': '255 255 255', // #ffffff (wireframe surface)
  'rgb-surface-overlay': '89 89 89', // #595959 (gray-500)
  /** 흰 글자 위 대비 5.70:1(스크립트로 계산). 보내기 버튼은 style.css 에서 보라→분홍
   *  그라데이션을 덧입히고, 이 값은 그라데이션을 못 그리는 곳의 단색이다. */
  'rgb-surface-submit': '124 58 237', // #7c3aed (wireframe brand-600)
  'rgb-surface-submit-hover': '109 40 217', // #6d28d9 (wireframe brand-700)
  'rgb-surface-message-user': '237 233 254', // #ede9fe (wireframe brand-100 user bubble)
  'rgb-surface-brand-subtle': '245 243 255', // #f5f3ff (wireframe brand-50)
  'rgb-surface-destructive': '185 28 28', // #b91c1c (red-700)
  'rgb-surface-destructive-hover': '153 27 27', // #991b1b (red-800)
  'rgb-surface-chat': '255 255 255', // #ffffff (wireframe surface)
  'rgb-surface-code': '243 243 248', // #f3f3f8 (wireframe gray-100)
  'rgb-surface-inverted': '21 21 28', // #15151c (wireframe gray-900)
  'rgb-surface-inverted-hover': '59 59 73', // #3b3b49 (wireframe gray-700)
  'rgb-text-inverted': '255 255 255', // #fff (white)
  'rgb-surface-fixed': '255 255 255', // #fff (white) — same in light + dark
  'rgb-surface-fixed-hover': '243 243 248', // #f3f3f8 (wireframe gray-100, same in light + dark)
  'rgb-text-fixed': '21 21 28', // #15151c (wireframe gray-900, same in light + dark)

  // Border colors
  'rgb-border-light': '231 231 239', // #e7e7ef (wireframe gray-200)
  'rgb-border-medium': '211 211 222', // #d3d3de (wireframe gray-300)
  'rgb-border-medium-alt': '211 211 222', // #d3d3de (wireframe gray-300)
  'rgb-border-brand': '221 214 254', // #ddd6fe (wireframe brand-200)
  'rgb-border-heavy': '166 166 182', // #a6a6b6 (wireframe gray-400)
  'rgb-border-xheavy': '86 86 102', // #565666 (wireframe gray-600)
  'rgb-border-destructive': '220 38 38', // #dc2626 (red-600)

  // Status colors
  'rgb-status-success': '25 116 71', // #197447 (mock ok)
  'rgb-status-success-subtle': '227 242 234', // #e3f2ea (mock okSoft)
  'rgb-status-success-border': '110 231 183', // #6ee7b7 (green-300)
  'rgb-status-success-strong': '2 133 94', // #02855e
  'rgb-status-info': '37 99 235', // #2563eb (blue-600)
  'rgb-status-info-subtle': '239 246 255', // #eff6ff (blue-50)
  'rgb-status-info-border': '147 197 253', // #93c5fd (blue-300)
  'rgb-status-info-strong': '86 86 102', // #565666 (wireframe gray-600)
  'rgb-status-warning': '180 83 9', // #b45309 (amber-700)
  'rgb-status-warning-subtle': '255 251 235', // #fffbeb (amber-50)
  'rgb-status-warning-border': '252 211 77', // #fcd34d (amber-300)
  'rgb-status-warning-strong': '199 82 9', // #c75209
  'rgb-status-error': '185 28 28', // #b91c1c (red-700)
  'rgb-status-error-subtle': '254 242 242', // #fef2f2 (red-50)
  'rgb-status-error-border': '252 165 165', // #fca5a5 (red-300)
  'rgb-status-error-strong': '224 47 31', // #e02f1f
  'rgb-status-neutral': '86 86 102', // #565666 (wireframe gray-600)
  'rgb-status-neutral-subtle': '243 243 248', // #f3f3f8 (wireframe gray-100)
  'rgb-status-neutral-border': '211 211 222', // #d3d3de (wireframe gray-300)
  /** Verified mark. `blue-600` doubles as `status-info` here, and that is the
   *  point: one blue for "this is informational/first-party", 5.17:1 under the
   *  white label and 4.90:1 against the panel. */
  'rgb-status-verified': '37 99 235', // #2563eb (blue-600)
  'rgb-text-on-status': '255 255 255', // #fff (white)

  // Brand colors
  'rgb-brand-purple': '126 34 206', // #7e22ce (purple-700)

  /** Code syntax highlighting, measured against the `surface-code` fill. */
  'rgb-syntax-text': '21 21 28', // #15151c (wireframe gray-900)
  'rgb-syntax-comment': '86 86 102', // #565666 (wireframe gray-600)
  'rgb-syntax-meta': '59 59 73', // #3b3b49 (wireframe gray-700)
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
  'rgb-presentation': '251 251 253', // #fbfbfd (wireframe bg)
};
