import { fishSvg } from './icons';

/** Рыба летит по дуге из мира в ячейку корзины (11.3): координаты канвы → DOM. */
export function flyFish(
  parent: HTMLElement,
  from: { x: number; y: number },
  to: { x: number; y: number },
  ms: number,
  done: () => void,
): void {
  const host = parent.getBoundingClientRect();
  const e = document.createElement('div');
  e.className = 'fish-flight';
  e.innerHTML = fishSvg('is-caught');
  e.style.left = `${from.x - host.left}px`;
  e.style.top = `${from.y - host.top}px`;
  parent.appendChild(e);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lift = Math.min(160, Math.abs(dx) * 0.5 + 60);
  const frames: Keyframe[] = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    const x = dx * t;
    const y = dy * t - Math.sin(Math.PI * t) * lift;
    frames.push({
      transform: `translate(${x}px, ${y}px) rotate(${t * 540}deg) scale(${1.6 - 0.7 * t})`,
      offset: t,
    });
  }
  const anim = e.animate(frames, { duration: ms, easing: 'cubic-bezier(0.3, 0.1, 0.4, 1)' });
  anim.onfinish = () => {
    e.remove();
    done();
  };
}
