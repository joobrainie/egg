# Research Purchase Optimization Plan

## Phase 1: Event Management & Action Splitting

### 1. Automated Event Schedules
The application will automatically manage both Research Sales and Earnings Boosts based on fixed recurring schedules.

#### A. Research Sales (Friday)
- **Schedule**: Starts **Friday 9:00 AM PT**, Ends **Saturday 9:00 AM PT** (24 hours).
- **Discount**: Always **70% off** virtues.
- **User Control & UI Placement**: 
    - **Location**: The toggle remains in its current location on the **Research** action tab.
    - **Restricted**: During the Fri-Sat window, users cannot disable the sale.
    - **Unrestricted**: Outside of this window, users can manually toggle the sale for unscheduled events.

#### B. Earnings Boosts (Monday)
- **Schedule**: Starts **Monday 9:00 AM PT**, Ends **Tuesday 9:00 AM PT** (24 hours).
- **Multiplier**: **2x Earnings**.
- **User Control & UI Placement**: 
    - **Location**: The toggle remains in its current location under the **Quick Continue** button.
    - **Restricted**: During the Mon-Tue window, users cannot disable the boost.
    - **Unrestricted**: Outside of this window, users can manually toggle the boost for unscheduled events.

#### C. Time Zone Handling
- **Event Thresholds**: The strict schedule boundaries (e.g., 9:00 AM) are exclusively evaluated based on Los Angeles time (PT).
- **General Time Handling**: All other time representations, calculations, and displays throughout the application must be processed and shown dynamically using the time zone selected by the user in the initial state settings.

### 2. Initial State & Loading Behaviors
When the application loads or the ascension time timeline is updated, the system must automatically align the initial action history with any currently active events:
- **Earnings Boosts**: If the start of the ascension falls within the 2x Earnings event window, the application will automatically insert the "Earnings Boost Activate" action as the very first action in the history. This applies when:
    - The page first loads without any player data or save plan.
    - The user chooses to "Continue Ascension" or "Quick Continue".
    - The user manually modifies the "Initial State" such that the start time falls within an event.
    - A plan is imported and the final timestamp of the imported plan lands within an earnings event window (the activation will be appended to the end of the imported plan).
- **Research Sales**: The exact same rules apply for the 70% Research Sale event, but **only** if the player's initial state starts on (or shifts to) the **Curiosity** egg.

### 3. Action History Event Splitting
During simulation, actions (like saving to buy research) that cross event boundaries will be automatically split to accurately reflect the timeline and state changes.

- **Affected Actions**: Earnings Boost events will split *any* action that takes time to save. However, Research Sale events will **only** split Research Purchase actions; all other action types are unaffected by research sales and will not be split by them.
- **Threshold Crossing**: Whenever an event starts or ends during the duration of an action, the application will break the action into multiple sequences.
- **Example Scenarios**:
    - **Earnings Boost**: A player needs to save for 30 hours to buy a research item, but a 2x Earnings event starts in 10 hours.
        1. **Wait**: Wait for 10 hours (at 1x earnings).
        2. **System Action**: Activate the 2x Earnings event.
        3. **Buy**: Wait for the remaining duration required (calculated at the new 2x earnings rate, taking 10 more hours) and complete the purchase.
    - **Research Sale**: A player needs to save for 30 hours to buy a research item at full price, but a 70% Research Sale starts in 10 hours.
        1. **Wait**: Wait for 10 hours (at 1x earnings). By this time, the player has saved 33% (10/30) of the non-sale cost.
        2. **System Action**: Activate the Research Sale.
        3. **Buy**: The item price drops by 70%. Since the player already has 33% of the cost banked (more than the new 30% price), the remaining wait time is instantly reduced to 0s, and the item is purchased immediately after the event activates.
- **Multiple Thresholds**: If an action is long enough to cross multiple event start/end thresholds, the application will create as many "Wait", "Event Activate", and "Event End" history items as needed to accurately step through the timeline.
- **Recalculations & Editing**: Editing an action earlier in the timeline shifts subsequent actions. To support this:
    - **Relationship Tracking**: The split sequences (the "wait" and "buy" components) will maintain a relationship identifying them as belonging to the same original action.
    - **Re-Merging and Re-Splitting**: During a recalculation, the application will merge related split pieces back into the original monolithic action. It will then dynamically re-split the action based on the *new* timeline thresholds.
    - **Handling Edge Cases**: If a modified timeline means an action no longer crosses a threshold, the merged action remains whole. Conversely, split `Wait` pieces will maintain their fixed time windows corresponding to the event thresholds, and the final `Buy` piece will reflect the updated save duration based on the new earnings rate context.

### 4. New "Wait for Research Sale" Action
A new action available on **Curiosity** under the "Wait Actions" section:
- **Wait for Research Sale**: Automatically waits until the next Friday at 9:00 AM PT.
- **Dynamic Duration**: This action maintains a fixed absolute end time. If preceding actions shift its start time, the duration of the "Wait" action scales automatically to compensate.

---

## Phase 2: Pricing Lookahead & ROI Optimization

### 1. The Problem
Users often buy research at full price right before a major 70% off research sale. This is inefficient if the time it takes for the research to "pay for itself" (earn back 70% of its cost) is longer than the time remaining until the next sale begins.

### 2. ROI Calculation Logic
- **Payback Window**: The time available between the **moment of purchase** and the start of the next sale.
  - *Purchase Time* = Current Simulation Time + Time to Save.
  - *Payback Window* = Next Friday 9:00 AM PT - Purchase Time.
- **Payback Time**: The time required to earn back 70% of the research price given the new earnings rate: `(0.7 * Price) / Earnings Increase`.
- **Condition**: If `Payback Time` > `Payback Window`, show a warning label in the **Earnings ROI** view. (i.e. You won't earn back the 70% discount amount before the actual discount becomes available).
- **Exception**: If a research sale is currently active, do not show any warnings (it is always the best time to buy).

### 3. ROI Warning & UI Lookahead
The research view models will implement "Sale Lookahead" logic:
- **Lookahead Pricing**: If waiting for a sale is faster than saving now, display the **Discounted Price** and the **"70% OFF"** badge.
- **Time to Buy**: `EffectiveSaleTime = max(SaleStartTime, TimeToSaveDiscountedPrice)`.
- **Earnings Event Indicator**: If the calculated "Time to Save" spans a Monday 2x event, show a small indicator (e.g., ⚡ or 🚀) next to the time. 
    - **Tooltip**: "Time to save is decreased because of the 2x earnings event."
- **ROI Warning**: Triggers if the payback window after purchase is too short to earn back the 70% savings.

---

## Files to be Modified

### Phase 1 Files
- `src/lib/time.ts`: New utilities for Pacific Time schedule calculations.
- `src/stores/actions/index.ts` & `src/engine/simulate.ts`: Core logic for automated event splitting, action insertion, and boundary crossing.
- `src/stores/sales.ts`: Restrict manual research sale toggling during the scheduled window.
- `src/components/actions/ResearchActions.vue`: Update toggle to be locked/disabled during the scheduled window.
- `src/components/actions/WaitActions.vue` & `WaitForResearchSale.vue`: New wait action.

### Phase 2 Files
- `src/composables/useResearchViews.ts`: Update ROI logic, earnings lookup, and add "70% OFF" prediction badges.
- `src/components/actions/ResearchItem.vue`: Display badges and warnings.
- `src/components/TimelineAction.vue` (or equivalent): Show badges in Action History.

---

## Progress Tracking

### What Has Been Completed
- **Phase 1: Event Management**
    - `src/lib/time.ts` created: Time utilities for finding Pacific Time boundaries (Friday/Monday 9:00 AM PT).
    - UI locks applied: The **Earnings Boost** toggle in `App.vue` and the **Research Sale** toggle in `ResearchSaleToggle.vue`/`ResearchActions.vue` are now dynamically restricted/disabled while their respective schedules are active, based on simulation time.

### Next Steps (Phase 1)
- Implement **Action History Event Splitting** in `src/engine/simulate.ts` and `src/stores/actions/index.ts`.
- Automatically inject **Earnings Boost** and **Research Sale** activation actions when an action's duration crosses an event threshold.
- Add logic to split an action that crosses a threshold (create a pre-event Wait, the event start/end, and the post-event continuation).
- Implement "Re-Merging and Re-Splitting" during state recalculations to handle changes seamlessly.
- Implement **Initial State & Loading Behaviors** to handle initial event activations on load, quick continue, or manual date modification.
- Create the **Wait for Research Sale** wait action.
