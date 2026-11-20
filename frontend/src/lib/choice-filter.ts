/* POL-FE-117 — how a searchable dropdown narrows its choices as you type.
   Pure, and kept apart from the place data so every page with a
   SearchSelect doesn't bundle the catalogue. */

/** Names that start with what's typed first, then any word that starts with
 *  it, then anywhere in the name; an exact code matches too. Ties keep the
 *  list's own order (A to Z, or the groups). */
export function filterChoices<T extends { value: string; label: string }>(options: readonly T[], text: string): T[] {
  const q = text.trim().toLowerCase();
  if (!q) return [...options];
  const rank = (o: T) => {
    const l = o.label.toLowerCase();
    if (o.value.toLowerCase() === q || l === q) return 0;
    if (l.startsWith(q)) return 1;
    if (l.split(/[\s\-/(),.]+/).some((w) => w.startsWith(q))) return 2;
    if (l.includes(q)) return 3;
    return 9;
  };
  return options
    .map((o, i) => [rank(o), i, o] as const)
    .filter(([r]) => r < 9)
    .sort((a, b) => a[0] - b[0] || a[1] - b[1])
    .map(([, , o]) => o);
}
