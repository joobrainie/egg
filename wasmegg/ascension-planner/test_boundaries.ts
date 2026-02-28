import { getNextEventBoundary, getEarningsEventWindow, isEarningsEventActiveAt } from './src/lib/time';

const startTimeMs = new Date("2026-03-01T12:00:00Z").getTime(); // Sunday
console.log("Start time:", new Date(startTimeMs).toISOString());
const nextBoundaryMs = getNextEventBoundary(startTimeMs);
console.log("Next boundary:", new Date(nextBoundaryMs).toISOString());
const isBoostNow = isEarningsEventActiveAt(nextBoundaryMs + 100);
console.log("isBoostNow:", isBoostNow);
const [start, end] = getEarningsEventWindow(nextBoundaryMs + 100);
console.log("Earnings event window: [", new Date(start).toISOString(), ",", new Date(end).toISOString(), "]");
