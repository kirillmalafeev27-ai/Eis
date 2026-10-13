/** Склонение по числу через Intl.PluralRules (11.2.1). */
const rules = new Map<string, Intl.PluralRules>();

export function plural(locale: string, n: number, forms: Partial<Record<Intl.LDMLPluralRule, string>>): string {
  let r = rules.get(locale);
  if (!r) {
    r = new Intl.PluralRules(locale);
    rules.set(locale, r);
  }
  const key = r.select(n);
  return forms[key] ?? forms.other ?? forms.many ?? '';
}
