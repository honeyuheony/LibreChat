import { cn } from '~/utils';

/**
 * The deployment's logo file used as a mask, so the shape comes from the brand asset
 * while the fill follows the theme's brand token (a navy file on a dark surface would vanish).
 */
const logoMask = {
  maskImage: 'url(assets/logo.svg)',
  WebkitMaskImage: 'url(assets/logo.svg)',
  maskSize: 'contain',
  WebkitMaskSize: 'contain',
  maskRepeat: 'no-repeat',
  WebkitMaskRepeat: 'no-repeat',
  maskPosition: 'center',
  WebkitMaskPosition: 'center',
} as const;

export default function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn('inline-block flex-shrink-0 bg-accent-primary', className)}
      style={logoMask}
    />
  );
}
