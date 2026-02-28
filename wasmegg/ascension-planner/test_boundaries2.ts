import { getNextEventBoundary, getEarningsEventWindow, isEarningsEventActiveAt, getPacificOffsetSeconds, getNextWeeklyEvent } from './src/lib/time';

const startTimeMs = new Date("2026-03-02T17:00:00Z").getTime(); // Monday exactly at 9 AM PST
console.log("Start time:", new Date(startTimeMs).toISOString());
const nextBoundaryMs = getNextEventBoundary(startTimeMs);
console.log("Next boundary:", new Date(nextBoundaryMs).toISOString());
