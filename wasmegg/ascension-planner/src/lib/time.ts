/**
 * Utilities for managing Egg Inc event schedules (Pacific Time).
 */

// Friday 9:00 AM Pacific Time
const RESEARCH_SALE_START_DAY = 5; // Friday
const RESEARCH_SALE_START_HOUR = 9;
const RESEARCH_SALE_DURATION_SEC = 24 * 3600;

// Monday 9:00 AM Pacific Time
const EARNINGS_EVENT_START_DAY = 1; // Monday
const EARNINGS_EVENT_START_HOUR = 9;
const EARNINGS_EVENT_DURATION_SEC = 24 * 3600;

let lastOffset: number | null = null;
let lastTimestamp: number | null = null;

/**
 * Get the current offset of Pacific Time from UTC in seconds.
 * Los Angeles: PST (UTC-8) or PDT (UTC-7).
 * Cached for 1 hour to avoid expensive toLocaleString calls.
 */
export function getPacificOffsetSeconds(timestampMs: number): number {
  if (lastTimestamp !== null && Math.abs(timestampMs - lastTimestamp) < 3600000) {
    return lastOffset!;
  }

  const date = new Date(timestampMs);
  const laString = date.toLocaleString('en-US', { timeZone: 'America/Los_Angeles', timeZoneName: 'short' });
  const offset = laString.includes('PDT') ? -7 * 3600 : -8 * 3600;

  lastOffset = offset;
  lastTimestamp = timestampMs;
  return offset;
}

/**
 * Get the next occurrence of a specific weekly event.
 * @param timestampMs The starting timestamp
 * @param dayOfWeek 0-6 (Sunday-Saturday)
 * @param hour 0-23
 * @returns Timestamp in milliseconds
 */
export function getNextWeeklyEvent(timestampMs: number, dayOfWeek: number, hour: number): number {
  const date = new Date(timestampMs);

  const getOccurrence = (d: Date, day: number, hr: number) => {
    const result = new Date(d);
    const offset = getPacificOffsetSeconds(d.getTime());
    result.setUTCHours(hr - offset / 3600, 0, 0, 0);

    let daysUntil = (day - result.getUTCDay() + 7) % 7;
    // If it's already past the hour today, move to next week
    if (daysUntil === 0 && d.getTime() >= result.getTime()) {
      daysUntil = 7;
    }
    result.setUTCDate(result.getUTCDate() + daysUntil);
    return result.getTime();
  };

  return getOccurrence(date, dayOfWeek, hour);
}

/**
 * Returns the range [start, end] for the research sale containing or following this timestamp.
 */
export function getResearchSaleWindow(timestampMs: number): [number, number] {
  const offset = getPacificOffsetSeconds(timestampMs) * 1000;
  const date = new Date(timestampMs);

  // Check if currently in a sale
  const currentStart = new Date(date);
  currentStart.setUTCHours(RESEARCH_SALE_START_HOUR - offset / 3600000, 0, 0, 0);
  let daysDiff = (currentStart.getUTCDay() - RESEARCH_SALE_START_DAY + 7) % 7;
  currentStart.setUTCDate(currentStart.getUTCDate() - daysDiff);

  const start = currentStart.getTime();
  const end = start + RESEARCH_SALE_DURATION_SEC * 1000;

  if (timestampMs >= start && timestampMs < end) {
    return [start, end];
  }

  // Otherwise return next
  const nextStart = getNextWeeklyEvent(timestampMs, RESEARCH_SALE_START_DAY, RESEARCH_SALE_START_HOUR);
  return [nextStart, nextStart + RESEARCH_SALE_DURATION_SEC * 1000];
}

/**
 * Returns the range [start, end] for the earnings event containing or following this timestamp.
 */
export function getEarningsEventWindow(timestampMs: number): [number, number] {
  const offset = getPacificOffsetSeconds(timestampMs) * 1000;
  const date = new Date(timestampMs);

  const currentStart = new Date(date);
  currentStart.setUTCHours(EARNINGS_EVENT_START_HOUR - offset / 3600000, 0, 0, 0);
  let daysDiff = (currentStart.getUTCDay() - EARNINGS_EVENT_START_DAY + 7) % 7;
  currentStart.setUTCDate(currentStart.getUTCDate() - daysDiff);

  const start = currentStart.getTime();
  const end = start + EARNINGS_EVENT_DURATION_SEC * 1000;

  if (timestampMs >= start && timestampMs < end) {
    return [start, end];
  }

  const nextStart = getNextWeeklyEvent(timestampMs, EARNINGS_EVENT_START_DAY, EARNINGS_EVENT_START_HOUR);
  return [nextStart, nextStart + EARNINGS_EVENT_DURATION_SEC * 1000];
}

export function isResearchSaleActiveAt(timestampMs: number): boolean {
  const [start, end] = getResearchSaleWindow(timestampMs);
  return timestampMs >= start && timestampMs < end;
}

export function isEarningsEventActiveAt(timestampMs: number): boolean {
  const [start, end] = getEarningsEventWindow(timestampMs);
  return timestampMs >= start && timestampMs < end;
}

export function getEarningsMultiplierAt(timestampMs: number): number {
  return isEarningsEventActiveAt(timestampMs) ? 2 : 1;
}

export function getResearchPriceMultiplierAt(timestampMs: number): number {
  return isResearchSaleActiveAt(timestampMs) ? 0.3 : 1.0;
}

/**
 * Returns the next timestamp (ms) where any scheduled event starts or ends.
 */
export function getNextEventBoundary(timestampMs: number): number {
  const researchWindow = getResearchSaleWindow(timestampMs);
  const earningsWindow = getEarningsEventWindow(timestampMs);
  const boundaries = [researchWindow[0], researchWindow[1], earningsWindow[0], earningsWindow[1]];

  // Filter out past boundaries and find the nearest future one
  let nearest = Infinity;
  for (const b of boundaries) {
    if (b > timestampMs && b < nearest) {
      nearest = b;
    }
  }

  return nearest === Infinity ? timestampMs + 86400000 : nearest;
}
