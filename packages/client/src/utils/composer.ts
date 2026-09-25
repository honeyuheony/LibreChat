import { cn } from './utils';

/**
 * Shared composer-surface appearance: every input surface that should read as
 * "the composer" (main chat form, subagent control footer) draws its border,
 * background, and text colors from this one semantic decision. Layout, radius,
 * padding, and feature-specific overrides stay with each owner.
 */
export const composerSurfaceClasses = (): string =>
  cn('border border-border-light bg-surface-chat text-text-primary transition-all duration-200');

/** Elevation states for the composer surface. `within` is the CSS-only
 *  equivalent of the managed focused/blurred pair for surfaces that do not
 *  track focus in state. */
export const composerSurfaceShadow = {
  focused: 'shadow-lg',
  blurred: 'shadow-md',
  within: 'shadow-md focus-within:shadow-lg',
} as const;

/**
 * The composer's submit slot: send, stop, and the during-run send button that
 * takes their place while a run generates. One recipe because all three swap
 * into the same position and must be indistinguishable in everything but the
 * icon they carry.
 *
 * The fill is the brand's submit colour and the icon inherits the button's text
 * colour, so every face draws the same white glyph on the same square.
 *
 * Wherever touch is reachable it is the row's one 44px target. `size-theme-control` is
 * 36px, which a thumb aimed at the bottom corner of a phone clips or misses
 * outright, and below `sm` the composer surface runs to the viewport floor by
 * design, so the target has to grow upward instead of gaining a band of padding
 * beneath it. Centering is `flex` rather than the icon's fit inside
 * `p-theme-compact`, which only held while the box was exactly icon-sized.
 */
export const composerSubmitClasses = (): string =>
  cn(
    'flex items-center justify-center',
    'size-theme-control touch:size-theme-control-touch',
    'rounded-theme-control bg-surface-submit p-theme-compact text-white hover:bg-surface-submit-hover',
    'outline-offset-4 transition-all duration-theme-normal',
    'disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-surface-submit',
  );

/**
 * Shared appearance for a labeled control in the composer's action row — the
 * capability checkboxes, the MCP selector, the code-approval selector. Border,
 * radius, height, spacing and elevation are one decision here so a row of them
 * reads as a single set of controls no matter which primitive each is built
 * from. Width, responsive label collapsing and selected/open fills stay with
 * each owner.
 */
export const composerControlClasses = (): string =>
  cn(
    'group relative inline-flex items-center justify-center gap-theme-compact',
    'h-theme-control rounded-theme-control-round border border-border-medium',
    'bg-transparent text-sm font-medium text-text-primary shadow-sm transition-all',
    'hover:bg-surface-hover hover:shadow-md active:shadow-inner',
  );
