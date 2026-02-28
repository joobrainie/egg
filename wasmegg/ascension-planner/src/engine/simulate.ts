import type { Action, CalculationsSnapshot } from '@/types';
import { generateActionId } from '@/types';
import type { EngineState, SimulationContext, SimulationResult } from './types';
import { applyAction, computePassiveEggsDelivered, applyPassiveEggs, applyTime, getActionDuration, refreshActionPayload } from './apply';
import { computeSnapshot } from './compute';
import { computeDeltas } from '@/lib/actions/snapshot';
import { getEventInfo } from '@/lib/time';

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
    const baseSnapshot = computeSnapshot(baseState, context);

    let currentState = baseState;
    let currentSnapshot = baseSnapshot;

    // We process actions from a queue so we can inject items dynamically
    let pendingActions = [...actions];
    let actualIndex = startIndex;

    while (pendingActions.length > 0) {
        let action = pendingActions.shift()!;

        // 0. Refresh dynamic payloads (e.g. wait_for_te duration based on new ELR)
        action = refreshActionPayload(action, currentSnapshot, context);

        // 1. Apply action to get new pure state
        currentState = applyAction(currentState, action);

        // 1b. Add passively delivered eggs during this action's duration
        // Uses the PREVIOUS snapshot's ELR (eggs are shipped at the old rate while saving for the action)
        const durationSeconds = getActionDuration(action, currentSnapshot);
        const passiveEggs = computePassiveEggsDelivered(action, currentSnapshot);
        currentState = applyPassiveEggs(currentState, passiveEggs);

        currentState = applyTime(currentState, durationSeconds, currentSnapshot);

        // 2. Compute full snapshot
        const newSnapshot = computeSnapshot(currentState, context);

        // 3. Compute deltas vs previous state
        // For the first action, we compare against baseSnapshot (or should we?)
        // In the current store, start_ascension has 0 deltas usually.
        // computeDeltas(baseSnapshot, newSnapshot) might show diffs if start_ascension changed the egg.
        const prevSnap = results.length === 0 ? baseSnapshot : previousSnapshot!;

        // 3. Compute deltas vs previous state
        const deltas = computeDeltas(prevSnap, newSnapshot);

        // 4. Update action with new results and correct index
        const finalAction = {
            ...action,
            index: actualIndex,
            ...deltas,
            totalTimeSeconds: durationSeconds,
            endState: newSnapshot, // Caller should markRaw this if using Vue
        };
        results.push(finalAction);

        // 5. Update currentState for the next iteration.
        currentState = {
            ...currentState,
            population: newSnapshot.population,
            bankValue: newSnapshot.bankValue,
            lastStepTime: newSnapshot.lastStepTime,
            eggsDelivered: { ...newSnapshot.eggsDelivered },
            fuelTankAmounts: { ...newSnapshot.fuelTankAmounts },
        };

        previousSnapshot = newSnapshot;
        currentSnapshot = newSnapshot;

        // 6. Injection Logic for Initial State (start_ascension)
        if (action.type === 'start_ascension') {
            const info = getEventInfo(newSnapshot.lastStepTime);
            // We want to inject the Toggle actions if the event is active
            // but only if the very next action in `pendingActions` isn't already the exact toggle.
            if (info.isEarningsBoostActive) {
                const nextType = pendingActions.length > 0 ? pendingActions[0].type : null;
                if (nextType !== 'toggle_earnings_boost') {
                    pendingActions.unshift({
                        id: generateActionId(),
                        type: 'toggle_earnings_boost',
                        timestamp: Date.now(),
                        cost: 0,
                        dependsOn: [action.id],
                        dependents: [],
                        payload: { active: true, multiplier: 2, eventId: 'system-injected' },
                        index: 0, totalTimeSeconds: 0, endState: currentSnapshot
                    } as unknown as Action);
                }
            }
            if (info.isResearchSaleActive && currentState.currentEgg === 'curiosity') {
                // Must ensure we don't accidentally check the second item if earnings boost got inserted first
                // Wait, if both are inserted, earnings boost will be checked first, inserted, then research sale checks pending[0]. But checking pendingActions.find handles this cleanly
                const hasSale = pendingActions.some(a => a.type === 'toggle_sale');
                if (!hasSale) {
                    pendingActions.unshift({
                        id: generateActionId(),
                        type: 'toggle_sale',
                        timestamp: Date.now(),
                        cost: 0,
                        dependsOn: [action.id],
                        dependents: [],
                        payload: { saleType: 'research', active: true, multiplier: 0.3 },
                        index: 0, totalTimeSeconds: 0, endState: currentSnapshot
                    } as unknown as Action);
                }
            }
        }

        actualIndex++;
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
    let previousSnapshot: CalculationsSnapshot | null = null;
    const baseSnapshot = computeSnapshot(baseState, context);

    let currentState = baseState;
    let currentSnapshot = baseSnapshot;

    // Yield every 20 actions to keep UI responsive
    // A smaller number makes the UI smoother but total time slightly longer
    const YIELD_INTERVAL = 20;

    let pendingActions = [...actions];
    let actualIndex = startIndex;
    let iterationCount = 0;

    while (pendingActions.length > 0) {
        // Yield check
        if (iterationCount % YIELD_INTERVAL === 0) {
            if (onProgress) onProgress(iterationCount, actions.length);
            await new Promise(resolve => setTimeout(resolve, 0));
        }

        let action = pendingActions.shift()!;

        action = refreshActionPayload(action, currentSnapshot, context);
        currentState = applyAction(currentState, action);
        const durationSeconds = getActionDuration(action, currentSnapshot);
        const passiveEggs = computePassiveEggsDelivered(action, currentSnapshot);
        currentState = applyPassiveEggs(currentState, passiveEggs);

        currentState = applyTime(currentState, durationSeconds, currentSnapshot);

        const newSnapshot = computeSnapshot(currentState, context);
        const prevSnap = results.length === 0 ? baseSnapshot : previousSnapshot!;
        const deltas = computeDeltas(prevSnap, newSnapshot);
        const finalAction = {
            ...action,
            index: actualIndex,
            ...deltas,
            totalTimeSeconds: durationSeconds,
            endState: newSnapshot,
        };
        results.push(finalAction);

        currentState = {
            ...currentState,
            population: newSnapshot.population,
            bankValue: newSnapshot.bankValue,
            lastStepTime: newSnapshot.lastStepTime,
            eggsDelivered: { ...newSnapshot.eggsDelivered },
            fuelTankAmounts: { ...newSnapshot.fuelTankAmounts },
        };

        previousSnapshot = newSnapshot;
        currentSnapshot = newSnapshot;

        if (action.type === 'start_ascension') {
            const info = getEventInfo(newSnapshot.lastStepTime);
            if (info.isEarningsBoostActive) {
                const nextType = pendingActions.length > 0 ? pendingActions[0].type : null;
                if (nextType !== 'toggle_earnings_boost') {
                    pendingActions.unshift({
                        id: generateActionId(),
                        type: 'toggle_earnings_boost',
                        timestamp: Date.now(),
                        cost: 0,
                        dependsOn: [action.id],
                        dependents: [],
                        payload: { active: true, multiplier: 2, eventId: 'system-injected' },
                        index: 0, totalTimeSeconds: 0, endState: currentSnapshot
                    } as unknown as Action);
                }
            }
            if (info.isResearchSaleActive && currentState.currentEgg === 'curiosity') {
                const hasSale = pendingActions.some(a => a.type === 'toggle_sale');
                if (!hasSale) {
                    pendingActions.unshift({
                        id: generateActionId(),
                        type: 'toggle_sale',
                        timestamp: Date.now(),
                        cost: 0,
                        dependsOn: [action.id],
                        dependents: [],
                        payload: { saleType: 'research', active: true, multiplier: 0.3 },
                        index: 0, totalTimeSeconds: 0, endState: currentSnapshot
                    } as unknown as Action);
                }
            }
        }

        actualIndex++;
        iterationCount++;
    }

    // Final progress update
    if (onProgress) onProgress(actions.length, actions.length);

    return results;
}
