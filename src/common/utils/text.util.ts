/**
 * The first value that actually says something.
 *
 * Written out rather than `a ?? b`, because the two are not the same here: a
 * translation field can be an empty string as easily as a null — a form input
 * cleared but not removed — and both mean "not translated". `??` would keep the
 * empty one and blank the product name.
 */
export function firstFilled(...values: (string | null | undefined)[]): string {
  for (const value of values) {
    if (value !== null && value !== undefined && value.trim() !== '') return value;
  }

  return '';
}

/** Text with the padding removed, or null when there was nothing but padding. */
export function trimmedOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();

  return trimmed === undefined || trimmed === '' ? null : trimmed;
}
