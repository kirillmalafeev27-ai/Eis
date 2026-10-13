/** Маленький помощник для DOM-экранов. */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls = '',
  attrs: Record<string, string> = {},
  children: (Node | string | null | undefined)[] = [],
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  for (const c of children) if (c !== null && c !== undefined) e.append(c);
  return e;
}

export function button(
  text: string,
  cls: string,
  onClick: () => void,
  attrs: Record<string, string> = {},
): HTMLButtonElement {
  const b = el('button', `paper-btn ${cls}`, { type: 'button', ...attrs }, [text]);
  b.addEventListener('click', onClick);
  return b;
}

/** Поставить фокус на первую кнопку экрана (клавиатура, 11.6.3). */
export function focusFirst(root: HTMLElement): void {
  const b = root.querySelector<HTMLElement>('button:not([disabled]), [tabindex="0"]');
  b?.focus({ preventScroll: true });
}
