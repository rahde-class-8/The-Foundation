/** "Thu, Nov 12" in the learner's timezone. */
export function formatDay(instant: string | null, timeZone: string): string {
  if (!instant) return '—';
  try {
    return new Intl.DateTimeFormat(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      timeZone,
    }).format(new Date(instant));
  } catch {
    return new Date(instant).toDateString();
  }
}

export function formatDateTime(instant: string, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone,
    }).format(new Date(instant));
  } catch {
    return new Date(instant).toLocaleString();
  }
}
