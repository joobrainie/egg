import type { CalculationsSnapshot } from '@/types';
import { getEarningsMultiplierAt, getNextEventBoundary, getResearchPriceMultiplierAt } from '@/lib/time';

/**
 * Integrated rate from 0 to T: integral from 0 to T of min(R * min(P0 + I*t, HabCap), S) dt
 */
export function solveForTime(
  targetAmount: number,
  P0: number,
  I: number,
  R: number,
  S: number,
  HabCap: number = Infinity
): number {
  if (targetAmount <= 0) return 0;

  const CapRate = Math.min(S, R * HabCap);

  if (R * P0 >= CapRate) {
    return CapRate > 0 ? targetAmount / CapRate : Infinity;
  }

  // Time when rate hits CapRate
  let Tcap = Infinity;
  if (I > 0) {
    Tcap = (CapRate / R - P0) / I;
  }

  const Gcap = I > 0 && Tcap !== Infinity ? R * (P0 * Tcap + 0.5 * I * Tcap * Tcap) : Infinity;

  if (targetAmount <= Gcap) {
    const a = 0.5 * R * I;
    const b = R * P0;
    const c = -targetAmount;
    if (a === 0) return b > 0 ? targetAmount / b : Infinity;
    return (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a);
  } else {
    const Tremaining = (targetAmount - Gcap) / CapRate;
    return Tcap + Tremaining;
  }
}

/**
 * Integrated rate from 0 to T: integral from 0 to T of min(R * min(P0 + I*t, HabCap), S) dt
 */
export function integrateRate(seconds: number, P0: number, I: number, R: number, S: number, HabCap: number): number {
  if (seconds <= 0) return 0;

  const CapRate = Math.min(S, R * HabCap);

  let Tcap = Infinity;
  if (I > 0) {
    Tcap = (CapRate / R - P0) / I;
  } else if (R * P0 >= CapRate) {
    Tcap = 0;
  }

  if (Tcap <= 0) {
    return CapRate * seconds;
  } else if (seconds <= Tcap) {
    return R * (P0 * seconds + 0.5 * I * seconds * seconds);
  } else {
    const Gcap = R * (P0 * Tcap + 0.5 * I * Tcap * Tcap);
    const Gafter = CapRate * (seconds - Tcap);
    return Gcap + Gafter;
  }
}

/**
 * Calculate the total earnings integrated over a period of time [0, seconds].
 */
export function calculateEarningsForTime(seconds: number, prevSnapshot: CalculationsSnapshot): number {
  const V = prevSnapshot.elr > 0 ? prevSnapshot.offlineEarnings / prevSnapshot.elr : 0;
  if (V <= 0) return 0;

  const totalEggs = integrateRate(
    seconds,
    prevSnapshot.population,
    prevSnapshot.offlineIHR / 60,
    prevSnapshot.ratePerChickenPerSecond,
    prevSnapshot.shippingCapacity,
    prevSnapshot.habCapacity
  );

  return V * totalEggs;
}

/**
 * Calculate the total eggs delivered integrated over a period of time [0, seconds].
 */
export function calculateEggsDeliveredForTime(seconds: number, prevSnapshot: CalculationsSnapshot): number {
  return integrateRate(
    seconds,
    prevSnapshot.population,
    prevSnapshot.offlineIHR / 60,
    prevSnapshot.ratePerChickenPerSecond,
    prevSnapshot.shippingCapacity,
    prevSnapshot.habCapacity
  );
}

/**
 * Helper to get time to save for a cost, accounting for population growth, caps,
 * and recurring earnings events.
 */
export function getTimeToSave(cost: number, prevSnapshot: CalculationsSnapshot): number {
  const { timeToSave } = getTimeToSaveWithDetails(cost, prevSnapshot);
  return timeToSave;
}

/**
 * Detailed version of getTimeToSave that also returns metadata about the calculation.
 */
export function getTimeToSaveWithDetails(
  cost: number,
  prevSnapshot: CalculationsSnapshot
): {
  timeToSave: number;
  affectedByEvent: boolean;
} {
  const effectiveCost = Math.max(0, cost - (prevSnapshot.bankValue || 0));
  if (effectiveCost <= 0) return { timeToSave: 0, affectedByEvent: false };

  // Neutralize current event multiplier from offlineEarnings to get a "base" rate.
  // offlineEarnings already includes the eventMultiplier if active.
  const currentEarningsBoost = prevSnapshot.earningsBoost.active ? prevSnapshot.earningsBoost.multiplier : 1;
  const V_base = prevSnapshot.elr > 0 ? prevSnapshot.offlineEarnings / currentEarningsBoost / prevSnapshot.elr : 0;
  if (V_base <= 0) return { timeToSave: Infinity, affectedByEvent: false };

  // Similarly, if the cost provided already includes a research sale discount,
  // we need the "base" cost (with only permanent discounts) to apply the 0.3 multiplier correctly in the loop.
  const currentResearchSaleMult =
    prevSnapshot.currentEgg === 'curiosity' && prevSnapshot.activeSales.research ? 0.3 : 1.0;
  const baseCost = cost / currentResearchSaleMult;

  let currentTimestampMs = (prevSnapshot.lastStepTime || 0) * 1000;
  let totalSeconds = 0;
  let totalEarnings = prevSnapshot.bankValue || 0;
  let affectedByEvent = false;

  const P0 = prevSnapshot.population;
  const I = prevSnapshot.offlineIHR / 60;
  const R = prevSnapshot.ratePerChickenPerSecond;
  const S = prevSnapshot.shippingCapacity;
  const HabCap = prevSnapshot.habCapacity;

  // To prevent infinite loops in degenerate cases
  let iterations = 0;
  const MAX_ITERATIONS = 100;

  // Cache boundary search results if they haven't changed
  let lastBoundaryMs = 0;

  while (iterations < MAX_ITERATIONS) {
    iterations++;

    const earningsMult = getEarningsMultiplierAt(currentTimestampMs);
    if (earningsMult > 1) affectedByEvent = true;

    const priceMult = prevSnapshot.currentEgg === 'curiosity' ? getResearchPriceMultiplierAt(currentTimestampMs) : 1.0;
    const currentTargetPrice = baseCost * priceMult;

    if (totalEarnings >= currentTargetPrice) {
      return { timeToSave: totalSeconds, affectedByEvent };
    }

    const V_current = V_base * earningsMult;
    const nextBoundaryMs = getNextEventBoundary(currentTimestampMs);
    const secondsToNextBoundary = (nextBoundaryMs - currentTimestampMs) / 1000;

    const currentP0 = Math.min(HabCap, P0 + I * totalSeconds);
    const maxEarningsInInterval = integrateRate(secondsToNextBoundary, currentP0, I, R, S, HabCap) * V_current;

    if (totalEarnings + maxEarningsInInterval >= currentTargetPrice) {
      // We finish in this interval
      const neededFromInterval = currentTargetPrice - totalEarnings;
      const intervalSeconds = solveForTime(neededFromInterval / V_current, currentP0, I, R, S, HabCap);
      return { timeToSave: totalSeconds + intervalSeconds, affectedByEvent };
    } else {
      // Use whole interval
      totalSeconds += secondsToNextBoundary;
      totalEarnings += maxEarningsInInterval;
      currentTimestampMs = nextBoundaryMs;
    }
  }

  return { timeToSave: Infinity, affectedByEvent };
}
