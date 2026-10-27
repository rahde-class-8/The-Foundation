export const percent = (value: number | null) =>
  value === null ? '—' : `${Math.round(value * 100)}%`;
