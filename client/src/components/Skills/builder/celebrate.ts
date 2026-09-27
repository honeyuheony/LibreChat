/** 게시 직후 화면 위로 떨어지는 색종이(와이어프레임 `confetti`). 움직임 줄이기를 켠 사람에게는 띄우지 않는다. */
export const CELEBRATE_MS = 2300;

const PIECES = 36;
const COLORS = [
  '--ring-primary',
  '--surface-submit',
  '--status-warning',
  '--status-success-strong',
];

function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

function piece(index: number): HTMLElement {
  const element = document.createElement('i');
  const turn = Math.random() * 360;
  Object.assign(element.style, {
    position: 'absolute',
    top: '-14px',
    left: `${Math.random() * 100}%`,
    width: '9px',
    height: '14px',
    borderRadius: '2px',
    background: `rgb(var(${COLORS[index % COLORS.length]}))`,
    transform: `rotate(${turn}deg)`,
  });
  element.animate?.(
    [
      { top: '-14px', transform: `rotate(${turn}deg)` },
      { top: '105%', transform: `rotate(${turn + 720}deg) translateX(40px)`, opacity: 0.9 },
    ],
    {
      duration: 1100 + Math.random() * 800,
      delay: Math.random() * 250,
      easing: 'ease-in',
      fill: 'forwards',
    },
  );
  return element;
}

export default function celebrate(): void {
  if (prefersReducedMotion()) {
    return;
  }
  const layer = document.createElement('div');
  layer.dataset.celebrate = '';
  layer.setAttribute('aria-hidden', 'true');
  Object.assign(layer.style, {
    position: 'fixed',
    inset: '0',
    pointerEvents: 'none',
    overflow: 'hidden',
    zIndex: '300',
  });
  for (let i = 0; i < PIECES; i++) {
    layer.appendChild(piece(i));
  }
  document.body.appendChild(layer);
  setTimeout(() => layer.remove(), CELEBRATE_MS);
}
