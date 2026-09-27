import celebrate, { CELEBRATE_MS } from '../celebrate';

function preferReducedMotion(reduce: boolean) {
  window.matchMedia = jest.fn((query: string) => ({
    matches: reduce && query === '(prefers-reduced-motion: reduce)',
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  }));
}

const overlay = () => document.body.querySelector('[data-celebrate]');

describe('celebrate', () => {
  const originalMatchMedia = window.matchMedia;
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    jest.useRealTimers();
    window.matchMedia = originalMatchMedia;
    document.body.innerHTML = '';
  });

  it('drops confetti over the page that screen readers skip and clears it afterwards', () => {
    preferReducedMotion(false);
    celebrate();

    const layer = overlay();
    expect(layer).toHaveAttribute('aria-hidden', 'true');
    expect(layer?.children).toHaveLength(36);
    jest.advanceTimersByTime(CELEBRATE_MS);
    expect(overlay()).toBeNull();
  });

  it('shows nothing when the reader asked for reduced motion', () => {
    preferReducedMotion(true);
    celebrate();
    expect(overlay()).toBeNull();
  });
});
