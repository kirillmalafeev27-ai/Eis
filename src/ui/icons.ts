/** Маленькие инлайн-SVG интерфейса: снежинка-заряд, рыба, корзина, термометр. */
export function snowflakeSvg(filled: boolean): string {
  const arms = Array.from({ length: 6 }, (_, i) => {
    const r = i * 60;
    return `<g transform="rotate(${r} 12 12)"><path d="M12 12 V2.6 M12 6.4 L9.3 3.9 M12 6.4 L14.7 3.9"/></g>`;
  }).join('');
  return `<svg class="sf ${filled ? 'sf-on' : 'sf-off'}" viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke-linecap="round" stroke-width="2.1">${arms}</g><circle cx="12" cy="12" r="2.6"/></svg>`;
}

export function fishSvg(cls = ''): string {
  return `<svg class="fish-ico ${cls}" viewBox="0 0 40 22" aria-hidden="true">
    <path class="fish-tail" d="M30 11 L39 3 L37.5 11 L39 19 Z"/>
    <path class="fish-body" d="M2 11 C6 3 16 1 24 4 C28 5.5 30 8 31 11 C30 14 28 16.5 24 18 C16 21 6 19 2 11 Z"/>
    <path class="fish-belly" d="M5 12.5 C10 17 18 18 26 15 C21 18.5 11 19 5 12.5 Z"/>
    <path class="fish-fin" d="M14 4.5 L19 1.5 L20 5 Z"/>
    <circle class="fish-eye" cx="8.5" cy="9.5" r="1.6"/>
  </svg>`;
}
