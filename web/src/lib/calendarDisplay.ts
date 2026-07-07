export function formatCalendarLabel(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return '';

  if (trimmed.includes('/')) {
    const last = trimmed.split('/').pop() || trimmed;
    return humanizeCalendarToken(last);
  }

  return trimmed;
}

export function colorWithAlpha(color: string, alphaHex = '22') {
  const trimmed = color.trim();
  if (!trimmed) return '#6366f122';
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
    return `${trimmed}${alphaHex}`;
  }
  if (/^#[0-9a-fA-F]{8}$/.test(trimmed)) {
    return `${trimmed.slice(0, 7)}${alphaHex}`;
  }
  return trimmed;
}

function humanizeCalendarToken(value: string) {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
