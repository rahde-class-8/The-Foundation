// Calendar math in the learner's timezone without dependencies (SPACED_REPETITION §2).
// A LocalDate is "YYYY-MM-DD" in the learner's IANA timezone.

export type LocalDate = string;

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let cached = formatterCache.get(timeZone);
  if (!cached) {
    cached = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    formatterCache.set(timeZone, cached);
  }
  return cached;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    formatter(timeZone);
    return true;
  } catch {
    return false;
  }
}

function parts(instant: Date, timeZone: string) {
  const values: Record<string, number> = {};
  for (const part of formatter(timeZone).formatToParts(instant)) {
    if (part.type !== 'literal') values[part.type] = Number(part.value);
  }
  return values as {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second: number;
  };
}

/** The learner's calendar date at a given instant. */
export function localDateOf(instant: Date, timeZone: string): LocalDate {
  const { year, month, day } = parts(instant, timeZone);
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function addDays(date: LocalDate, days: number): LocalDate {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return shifted.toISOString().slice(0, 10);
}

/** Offset of the zone from UTC at an instant, in milliseconds (positive east of UTC). */
function offsetMs(instant: Date, timeZone: string): number {
  const p = parts(instant, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/**
 * The UTC instant of 00:00 local time on a date. If midnight does not exist (a DST gap at
 * midnight), returns the first instant of that local day.
 */
export function startOfLocalDay(date: LocalDate, timeZone: string): Date {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  const naiveUtc = Date.UTC(year, month - 1, day);
  let candidate = naiveUtc - offsetMs(new Date(naiveUtc), timeZone);
  // Re-evaluate the offset at the candidate: it differs when a DST change falls in between.
  candidate = naiveUtc - offsetMs(new Date(candidate), timeZone);
  if (localDateOf(new Date(candidate), timeZone) !== date) {
    // Midnight fell into a DST gap: step forward to the first instant on the local date.
    for (let minutes = 15; minutes <= 180; minutes += 15) {
      const later = new Date(candidate + minutes * 60_000);
      if (localDateOf(later, timeZone) === date) return later;
    }
  }
  return new Date(candidate);
}
