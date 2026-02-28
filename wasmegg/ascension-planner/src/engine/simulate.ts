import type { Action, CalculationsSnapshot } from '@/types';
import type { EngineState, SimulationContext, SimulationResult } from './types';
import {
  applyAction,
  computePassiveEggsDelivered,
  applyPassiveEggs,
  applyTime,
  getActionDuration,
  refreshActionPayload,
} from './apply';
import { computeSnapshot } from './compute';
import { computeDeltas } from '@/lib/actions/snapshot';
import {
  getNextEventBoundary,
  isResearchSaleActiveAt,
  isEarningsEventActiveAt,
  getEarningsMultiplierAt,
  getResearchPriceMultiplierAt,
} from '@/lib/time';
import { generateActionId } from '@/types';

/**
 * Simulate a list of actions to produce a timeline of states.
 * @param actions The list of actions to simulate (including start_ascension)
 * @param context Global context (epic research, colleggtibles)
 * @param baseState The specific starting state (TE, shift count, empty farm)
 * @returns The list of actions with updated endState and deltas
 */
/**
 * Simulate a list of actions to produce a timeline of states.
 * @param actions The list of actions to simulate (including start_ascension)
 * @param context Global context (epic research, colleggtibles)
 * @param baseState The specific starting state (TE, shift count, empty farm)
 * @param startIndex The index offset for the first action in the list (default 0)
 * @returns The list of actions with updated endState and deltas
 */
export function simulate(
  actions: Action[],
  context: SimulationContext,
  baseState: EngineState,
  startIndex: number = 0
): Action[] {
  const results: Action[] = [];
  let previousSnapshot: CalculationsSnapshot | null = null;

  // We need a way to treat baseState as a Snapshot for delta computation of the first action.
  // However, computeDeltas expects a full CalculationsSnapshot.
  // We can compute the "base snapshot" once.
  const baseSnapshot = computeSnapshot(baseState, context);

  let currentState = baseState;
  let currentSnapshot = baseSnapshot;

  let i = 0;
  while (i < actions.length) {
    let action = actions[i];
    const actualIndex = startIndex + results.length;

    // 0. Refresh dynamic payloads (e.g. wait_for_te duration based on new ELR)
    action = refreshActionPayload(action, currentSnapshot, context);

    // 0b. Misalignment check: if the event starts EXACTLY at the start of this action,
    // the state may not match the temporal truth.
    // We skip this check for system-managed toggles to prevent infinite generation loops.
    const startTimeMs = currentSnapshot.lastStepTime * 1000;
    const isSystemToggle =
      (action.type === 'toggle_sale' || action.type === 'toggle_earnings_boost') &&
      (action as Action<'toggle_sale'>).payload.systemManaged === true;

    const realSale = isResearchSaleActiveAt(startTimeMs);
    const stateSale = !!currentSnapshot.activeSales.research;
    const realBoost = isEarningsEventActiveAt(startTimeMs);
    const stateBoost = currentSnapshot.earningsBoost.active;

    if (!isSystemToggle) {
      const componentsToInsert: Action[] = [];

      if (stateSale !== realSale && currentSnapshot.currentEgg === 'curiosity') {
        const toggleAction: Action<'toggle_sale'> = {
          id: generateActionId(),
          index: actualIndex,
          timestamp: Date.now(),
          type: 'toggle_sale',
          payload: { saleType: 'research', active: realSale, multiplier: realSale ? 0.3 : 1.0, systemManaged: true },
          cost: 0,
          dependsOn: [],
          dependents: [],
          startState: currentSnapshot,
          endState: currentSnapshot,
          totalTimeSeconds: 0,
          elrDelta: 0,
          offlineEarningsDelta: 0,
          eggValueDelta: 0,
          habCapacityDelta: 0,
          layRateDelta: 0,
          shippingCapacityDelta: 0,
          ihrDelta: 0,
          bankDelta: 0,
          populationDelta: 0,
        };
        componentsToInsert.push(toggleAction);
      }

      if (stateBoost !== realBoost) {
        const toggleAction: Action<'toggle_earnings_boost'> = {
          id: generateActionId(),
          index: actualIndex + componentsToInsert.length,
          timestamp: Date.now(),
          type: 'toggle_earnings_boost',
          payload: { active: realBoost, multiplier: realBoost ? 2.0 : 1.0, systemManaged: true },
          cost: 0,
          dependsOn: [],
          dependents: [],
          startState: currentSnapshot,
          endState: currentSnapshot,
          totalTimeSeconds: 0,
          elrDelta: 0,
          offlineEarningsDelta: 0,
          eggValueDelta: 0,
          habCapacityDelta: 0,
          layRateDelta: 0,
          shippingCapacityDelta: 0,
          ihrDelta: 0,
          bankDelta: 0,
          populationDelta: 0,
        };
        componentsToInsert.push(toggleAction);
      }

      if (componentsToInsert.length > 0) {
        actions.splice(i, 0, ...componentsToInsert);
        continue;
      }
    }

    // 1. Check for event boundaries CROSSING within this action's duration
    const durationSeconds = getActionDuration(action, currentSnapshot);
    const endTimeMs = (currentSnapshot.lastStepTime + durationSeconds) * 1000;
    const nextBoundaryMs = getNextEventBoundary(startTimeMs);

    if (nextBoundaryMs < endTimeMs - 100 && Math.abs(nextBoundaryMs - startTimeMs) > 100) {
      // A boundary is crossed during this action!
      // We insert a toggle action and a wait action before this one.
      const secondsToBoundary = (nextBoundaryMs - startTimeMs) / 1000;

      // Convert wait_for_time to a targetTimestamp so it safely resumes after splitting
      if (action.type === 'wait_for_time') {
        const payload = action.payload as import('@/types').WaitForTimePayload;
        if (typeof payload.targetTimestamp !== 'number') {
          action.payload = { ...payload, targetTimestamp: currentSnapshot.lastStepTime + payload.totalTimeSeconds };
        }
      }

      const waitAction: Action<'wait_for_time'> = {
        id: generateActionId(),
        index: actualIndex,
        timestamp: Date.now(),
        type: 'wait_for_time',
        payload: { totalTimeSeconds: secondsToBoundary, targetTimestamp: nextBoundaryMs / 1000 },
        cost: 0,
        dependsOn: [],
        dependents: [],
        startState: currentSnapshot,
        endState: currentSnapshot, // Will be updated by simulation loop
        totalTimeSeconds: secondsToBoundary,
        elrDelta: 0,
        offlineEarningsDelta: 0,
        eggValueDelta: 0,
        habCapacityDelta: 0,
        layRateDelta: 0,
        shippingCapacityDelta: 0,
        ihrDelta: 0,
        bankDelta: 0,
        populationDelta: 0,
      };

      const isSaleNow = isResearchSaleActiveAt(nextBoundaryMs + 100);
      const isBoostNow = isEarningsEventActiveAt(nextBoundaryMs + 100);

      const componentsToInsert: Action[] = [waitAction];

      if (stateSale !== isSaleNow && currentSnapshot.currentEgg === 'curiosity') {
        const toggleAction: Action<'toggle_sale'> = {
          id: generateActionId(),
          index: actualIndex + 1,
          timestamp: Date.now(),
          type: 'toggle_sale',
          payload: { saleType: 'research', active: isSaleNow, multiplier: isSaleNow ? 0.3 : 1.0, systemManaged: true },
          cost: 0,
          dependsOn: [],
          dependents: [],
          startState: currentSnapshot,
          endState: currentSnapshot,
          totalTimeSeconds: 0,
          elrDelta: 0,
          offlineEarningsDelta: 0,
          eggValueDelta: 0,
          habCapacityDelta: 0,
          layRateDelta: 0,
          shippingCapacityDelta: 0,
          ihrDelta: 0,
          bankDelta: 0,
          populationDelta: 0,
        };
        componentsToInsert.push(toggleAction);
      }

      if (stateBoost !== isBoostNow) {
        const toggleAction: Action<'toggle_earnings_boost'> = {
          id: generateActionId(),
          index: actualIndex + 1 + (componentsToInsert.length - 1),
          timestamp: Date.now(),
          type: 'toggle_earnings_boost',
          payload: { active: isBoostNow, multiplier: isBoostNow ? 2.0 : 1.0, systemManaged: true },
          cost: 0,
          dependsOn: [],
          dependents: [],
          startState: currentSnapshot,
          endState: currentSnapshot,
          totalTimeSeconds: 0,
          elrDelta: 0,
          offlineEarningsDelta: 0,
          eggValueDelta: 0,
          habCapacityDelta: 0,
          layRateDelta: 0,
          shippingCapacityDelta: 0,
          ihrDelta: 0,
          bankDelta: 0,
          populationDelta: 0,
        };
        componentsToInsert.push(toggleAction);
      }

      actions.splice(i, 0, ...componentsToInsert);
      continue;
    }

    // 2. Apply action to get new pure state
    currentState = applyAction(currentState, action);

    // 2b. Add passively delivered eggs during this action's duration
    // Uses the PREVIOUS snapshot's ELR (eggs are shipped at the old rate while saving for the action)
    // If a boundary was crossed, durationSeconds might be less than the original action's duration.
    const finalDuration = getActionDuration(action, currentSnapshot);
    const passiveEggs = computePassiveEggsDelivered(action, currentSnapshot, finalDuration);
    currentState = applyPassiveEggs(currentState, passiveEggs);

    currentState = applyTime(currentState, finalDuration, currentSnapshot);

    // 3. Compute full snapshot
    const newSnapshot = computeSnapshot(currentState, context);

    // 4. Compute deltas vs previous state
    // For the first action, we compare against baseSnapshot.
    // For subsequent actions, we compare against the endState of the previous result.
    const prevSnap = results.length === 0 ? baseSnapshot : results[results.length - 1].endState;
    const deltas = computeDeltas(prevSnap, newSnapshot);

    // 5. Update action with new results and correct index
    results.push({
      ...action,
      index: actualIndex,
      ...deltas,
      totalTimeSeconds: finalDuration,
      startState: currentSnapshot,
      endState: newSnapshot, // Caller should markRaw this if using Vue
    });

    // 6. Update currentState for the next iteration.
    // This is CRITICAL: simulation must propagate the computed state
    // (population, egg delivery, etc.) to the next action or else
    // subsequent actions will start from stale states.
    currentState = {
      ...currentState,
      population: newSnapshot.population,
      bankValue: newSnapshot.bankValue,
      lastStepTime: newSnapshot.lastStepTime,
      // Also ensure cumulative lifecycle eggs/fuel are preserved from computeSnapshot if they changed
      eggsDelivered: { ...newSnapshot.eggsDelivered },
      fuelTankAmounts: { ...newSnapshot.fuelTankAmounts },
    };

    // previousSnapshot = newSnapshot; // No longer needed
    currentSnapshot = newSnapshot;
    i++;
  }

  // Append final states if ended precisely on a boundary
  const finalTimeMs = currentSnapshot.lastStepTime * 1000;
  const finalSale = isResearchSaleActiveAt(finalTimeMs);
  const finalStateSale = !!currentSnapshot.activeSales.research;
  const finalBoost = isEarningsEventActiveAt(finalTimeMs);
  const finalStateBoost = currentSnapshot.earningsBoost.active;

  if (finalSale !== finalStateSale && currentSnapshot.currentEgg === 'curiosity') {
    const toggleAction: Action<'toggle_sale'> = {
      id: generateActionId(),
      index: startIndex + results.length,
      timestamp: Date.now(),
      type: 'toggle_sale',
      payload: { saleType: 'research', active: finalSale, multiplier: finalSale ? 0.3 : 1.0, systemManaged: true },
      cost: 0,
      dependsOn: [],
      dependents: [],
      startState: currentSnapshot,
      endState: currentSnapshot,
      totalTimeSeconds: 0,
      elrDelta: 0,
      offlineEarningsDelta: 0,
      eggValueDelta: 0,
      habCapacityDelta: 0,
      layRateDelta: 0,
      shippingCapacityDelta: 0,
      ihrDelta: 0,
      bankDelta: 0,
      populationDelta: 0,
    };
    actions.push(toggleAction);

    currentState = applyAction(currentState, toggleAction);
    const newSnapshot = computeSnapshot(currentState, context);
    const deltas = computeDeltas(currentSnapshot, newSnapshot);

    results.push({ ...toggleAction, ...deltas, endState: newSnapshot });
    currentSnapshot = newSnapshot;
  }

  if (finalBoost !== finalStateBoost) {
    const toggleAction: Action<'toggle_earnings_boost'> = {
      id: generateActionId(),
      index: startIndex + results.length,
      timestamp: Date.now(),
      type: 'toggle_earnings_boost',
      payload: { active: finalBoost, multiplier: finalBoost ? 2.0 : 1.0, systemManaged: true },
      cost: 0,
      dependsOn: [],
      dependents: [],
      startState: currentSnapshot,
      endState: currentSnapshot,
      totalTimeSeconds: 0,
      elrDelta: 0,
      offlineEarningsDelta: 0,
      eggValueDelta: 0,
      habCapacityDelta: 0,
      layRateDelta: 0,
      shippingCapacityDelta: 0,
      ihrDelta: 0,
      bankDelta: 0,
      populationDelta: 0,
    };
    actions.push(toggleAction);

    currentState = applyAction(currentState, toggleAction);
    const newSnapshot = computeSnapshot(currentState, context);
    const deltas = computeDeltas(currentSnapshot, newSnapshot);

    results.push({ ...toggleAction, ...deltas, endState: newSnapshot });
    currentSnapshot = newSnapshot;
  }

  return results;
}

/**
 * Async version of simulate that yields to the event loop to allow UI updates.
 */
export async function simulateAsync(
  actions: Action[],
  context: SimulationContext,
  baseState: EngineState,
  onProgress?: (current: number, total: number) => void,
  startIndex: number = 0
): Promise<Action[]> {
  const results: Action[] = [];
  const baseSnapshot = computeSnapshot(baseState, context);

  let currentState = baseState;
  let currentSnapshot = baseSnapshot;

  // Yield every 20 actions to keep UI responsive
  // A smaller number makes the UI smoother but total time slightly longer
  const YIELD_INTERVAL = 20;

  let i = 0;
  const initialActionCount = actions.length;

  while (i < actions.length) {
    // Yield check
    if (results.length % YIELD_INTERVAL === 0) {
      if (onProgress) onProgress(i, initialActionCount); // Use i for progress relative to original
      await new Promise(resolve => setTimeout(resolve, 0));
    }

    let action = actions[i];
    const actualIndex = startIndex + results.length;

    // 0b. Misalignment check
    const startTimeMs = currentSnapshot.lastStepTime * 1000;
    const isSystemToggle =
      (action.type === 'toggle_sale' || action.type === 'toggle_earnings_boost') &&
      (action as Action<'toggle_sale'>).payload.systemManaged === true;

    const realSale = isResearchSaleActiveAt(startTimeMs);
    const stateSale = !!currentSnapshot.activeSales.research;
    const realBoost = isEarningsEventActiveAt(startTimeMs);
    const stateBoost = currentSnapshot.earningsBoost.active;

    if (!isSystemToggle) {
      const componentsToInsert: Action[] = [];

      if (stateSale !== realSale && currentSnapshot.currentEgg === 'curiosity') {
        const toggleAction: Action<'toggle_sale'> = {
          id: generateActionId(),
          index: actualIndex,
          timestamp: Date.now(),
          type: 'toggle_sale',
          payload: { saleType: 'research', active: realSale, multiplier: realSale ? 0.3 : 1.0, systemManaged: true },
          cost: 0,
          dependsOn: [],
          dependents: [],
          startState: currentSnapshot,
          endState: currentSnapshot,
          totalTimeSeconds: 0,
          elrDelta: 0,
          offlineEarningsDelta: 0,
          eggValueDelta: 0,
          habCapacityDelta: 0,
          layRateDelta: 0,
          shippingCapacityDelta: 0,
          ihrDelta: 0,
          bankDelta: 0,
          populationDelta: 0,
        };
        componentsToInsert.push(toggleAction);
      }

      if (stateBoost !== realBoost) {
        const toggleAction: Action<'toggle_earnings_boost'> = {
          id: generateActionId(),
          index: actualIndex + componentsToInsert.length,
          timestamp: Date.now(),
          type: 'toggle_earnings_boost',
          payload: { active: realBoost, multiplier: realBoost ? 2.0 : 1.0, systemManaged: true },
          cost: 0,
          dependsOn: [],
          dependents: [],
          startState: currentSnapshot,
          endState: currentSnapshot,
          totalTimeSeconds: 0,
          elrDelta: 0,
          offlineEarningsDelta: 0,
          eggValueDelta: 0,
          habCapacityDelta: 0,
          layRateDelta: 0,
          shippingCapacityDelta: 0,
          ihrDelta: 0,
          bankDelta: 0,
          populationDelta: 0,
        };
        componentsToInsert.push(toggleAction);
      }

      if (componentsToInsert.length > 0) {
        actions.splice(i, 0, ...componentsToInsert);
        continue;
      }
    }

    // Boundary logic
    const durationSeconds = getActionDuration(action, currentSnapshot);
    const endTimeMs = (currentSnapshot.lastStepTime + durationSeconds) * 1000;
    const nextBoundaryMs = getNextEventBoundary(startTimeMs);

    if (nextBoundaryMs < endTimeMs - 100 && Math.abs(nextBoundaryMs - startTimeMs) > 100) {
      const secondsToBoundary = (nextBoundaryMs - startTimeMs) / 1000;
      // Convert wait_for_time to a targetTimestamp so it safely resumes after splitting
      if (action.type === 'wait_for_time') {
        const payload = action.payload as import('@/types').WaitForTimePayload;
        if (typeof payload.targetTimestamp !== 'number') {
          action.payload = { ...payload, targetTimestamp: currentSnapshot.lastStepTime + payload.totalTimeSeconds };
        }
      }

      const waitAction: Action<'wait_for_time'> = {
        id: generateActionId(),
        index: actualIndex,
        timestamp: Date.now(),
        type: 'wait_for_time',
        payload: { totalTimeSeconds: secondsToBoundary, targetTimestamp: nextBoundaryMs / 1000 },
        cost: 0,
        dependsOn: [],
        dependents: [],
        startState: currentSnapshot,
        endState: currentSnapshot,
        totalTimeSeconds: secondsToBoundary,
        elrDelta: 0,
        offlineEarningsDelta: 0,
        eggValueDelta: 0,
        habCapacityDelta: 0,
        layRateDelta: 0,
        shippingCapacityDelta: 0,
        ihrDelta: 0,
        bankDelta: 0,
        populationDelta: 0,
      };

      const isSaleNow = isResearchSaleActiveAt(nextBoundaryMs + 100);
      const isBoostNow = isEarningsEventActiveAt(nextBoundaryMs + 100);

      const componentsToInsert: Action[] = [waitAction];

      if (stateSale !== isSaleNow && currentSnapshot.currentEgg === 'curiosity') {
        const toggleAction: Action<'toggle_sale'> = {
          id: generateActionId(),
          index: actualIndex + 1,
          timestamp: Date.now(),
          type: 'toggle_sale',
          payload: { saleType: 'research', active: isSaleNow, multiplier: isSaleNow ? 0.3 : 1.0, systemManaged: true },
          cost: 0,
          dependsOn: [],
          dependents: [],
          startState: currentSnapshot,
          endState: currentSnapshot,
          totalTimeSeconds: 0,
          elrDelta: 0,
          offlineEarningsDelta: 0,
          eggValueDelta: 0,
          habCapacityDelta: 0,
          layRateDelta: 0,
          shippingCapacityDelta: 0,
          ihrDelta: 0,
          bankDelta: 0,
          populationDelta: 0,
        };
        componentsToInsert.push(toggleAction);
      }

      if (stateBoost !== isBoostNow) {
        const toggleAction: Action<'toggle_earnings_boost'> = {
          id: generateActionId(),
          index: actualIndex + 1 + (componentsToInsert.length - 1),
          timestamp: Date.now(),
          type: 'toggle_earnings_boost',
          payload: { active: isBoostNow, multiplier: isBoostNow ? 2.0 : 1.0, systemManaged: true },
          cost: 0,
          dependsOn: [],
          dependents: [],
          startState: currentSnapshot,
          endState: currentSnapshot,
          totalTimeSeconds: 0,
          elrDelta: 0,
          offlineEarningsDelta: 0,
          eggValueDelta: 0,
          habCapacityDelta: 0,
          layRateDelta: 0,
          shippingCapacityDelta: 0,
          ihrDelta: 0,
          bankDelta: 0,
          populationDelta: 0,
        };
        componentsToInsert.push(toggleAction);
      }

      actions.splice(i, 0, ...componentsToInsert);
      continue;
    }

    currentState = applyAction(currentState, action);
    const finalDuration = getActionDuration(action, currentSnapshot);
    currentState = applyPassiveEggs(currentState, computePassiveEggsDelivered(action, currentSnapshot, finalDuration));
    currentState = applyTime(currentState, finalDuration, currentSnapshot);

    const newSnapshot = computeSnapshot(currentState, context);
    const prevSnap = results.length === 0 ? baseSnapshot : results[results.length - 1].endState;
    const deltas = computeDeltas(prevSnap, newSnapshot);

    results.push({
      ...action,
      index: actualIndex,
      ...deltas,
      totalTimeSeconds: finalDuration,
      startState: currentSnapshot,
      endState: newSnapshot,
    });

    currentState = {
      ...currentState,
      population: newSnapshot.population,
      bankValue: newSnapshot.bankValue,
      lastStepTime: newSnapshot.lastStepTime,
      eggsDelivered: { ...newSnapshot.eggsDelivered },
      fuelTankAmounts: { ...newSnapshot.fuelTankAmounts },
    };

    currentSnapshot = newSnapshot;
    i++;
  }

  // Append final states if ended precisely on a boundary
  const finalTimeMs = currentSnapshot.lastStepTime * 1000;
  const finalSale = isResearchSaleActiveAt(finalTimeMs);
  const finalStateSale = !!currentSnapshot.activeSales.research;
  const finalBoost = isEarningsEventActiveAt(finalTimeMs);
  const finalStateBoost = currentSnapshot.earningsBoost.active;

  if (finalSale !== finalStateSale && currentSnapshot.currentEgg === 'curiosity') {
    const toggleAction: Action<'toggle_sale'> = {
      id: generateActionId(),
      index: startIndex + results.length,
      timestamp: Date.now(),
      type: 'toggle_sale',
      payload: { saleType: 'research', active: finalSale, multiplier: finalSale ? 0.3 : 1.0, systemManaged: true },
      cost: 0,
      dependsOn: [],
      dependents: [],
      startState: currentSnapshot,
      endState: currentSnapshot,
      totalTimeSeconds: 0,
      elrDelta: 0,
      offlineEarningsDelta: 0,
      eggValueDelta: 0,
      habCapacityDelta: 0,
      layRateDelta: 0,
      shippingCapacityDelta: 0,
      ihrDelta: 0,
      bankDelta: 0,
      populationDelta: 0,
    };
    actions.push(toggleAction);

    currentState = applyAction(currentState, toggleAction);
    const newSnapshot = computeSnapshot(currentState, context);
    const deltas = computeDeltas(currentSnapshot, newSnapshot);

    results.push({ ...toggleAction, ...deltas, endState: newSnapshot });
    currentSnapshot = newSnapshot;
  }

  if (finalBoost !== finalStateBoost) {
    const toggleAction: Action<'toggle_earnings_boost'> = {
      id: generateActionId(),
      index: startIndex + results.length,
      timestamp: Date.now(),
      type: 'toggle_earnings_boost',
      payload: { active: finalBoost, multiplier: finalBoost ? 2.0 : 1.0, systemManaged: true },
      cost: 0,
      dependsOn: [],
      dependents: [],
      startState: currentSnapshot,
      endState: currentSnapshot,
      totalTimeSeconds: 0,
      elrDelta: 0,
      offlineEarningsDelta: 0,
      eggValueDelta: 0,
      habCapacityDelta: 0,
      layRateDelta: 0,
      shippingCapacityDelta: 0,
      ihrDelta: 0,
      bankDelta: 0,
      populationDelta: 0,
    };
    actions.push(toggleAction);

    currentState = applyAction(currentState, toggleAction);
    const newSnapshot = computeSnapshot(currentState, context);
    const deltas = computeDeltas(currentSnapshot, newSnapshot);

    results.push({ ...toggleAction, ...deltas, endState: newSnapshot });
    currentSnapshot = newSnapshot;
  }

  if (onProgress) onProgress(initialActionCount, initialActionCount);
  return results;
}
