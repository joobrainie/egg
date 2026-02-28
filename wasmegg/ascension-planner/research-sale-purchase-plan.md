# Research Purchase Optimization Plan

## Problem
Users often buy research at full price right before a major 70% off research sale. This is inefficient if the time it takes for the research to "pay for itself" (earn back 70% of its cost) is longer than the time remaining until the next sale begins.

## Proposed Solution
In the **Earnings ROI** view, add a warning label for any research purchase where waiting for the sale is mathematically superior.

### ROI Calculation Logic
- **Payback Window**: The time available between the **moment of purchase** and the start of the next sale.
  - *Purchase Time* = Current Simulation Time + Time to Save.
  - *Payback Window* = Next Friday 9:00 AM PT - Purchase Time.
- **Payback Time**: The time required to earn back 70% of the research price given the new earnings rate: `(0.7 * Price) / Earnings Increase`.
- **Condition**: If `Payback Time` > `Payback Window`, show a warning. (i.e. You won't earn back the 70% discount amount before the actual discount becomes available).
- **Exception**: If a research sale is currently active, do not show any warnings (it is always the best time to buy).

## Automated Event Management
The application will automatically manage both Research Sales and Earnings Boosts based on fixed recurring schedules.

### 1. Research Sales (Friday)
- **Schedule**: Starts **Friday 9:00 AM PT**, Ends **Saturday 9:00 AM PT** (24 hours).
- **Discount**: Always **70% off** virtues.
- **User Control**: Manual toggle disabled during the sale window.

### 2. Earnings Boosts (Monday)
- **Schedule**: Starts **Monday 9:00 AM PT**, Ends **Tuesday 9:00 AM PT** (24 hours).
- **Multiplier**: **2x Earnings**.
- **User Control**: 
    - **Restricted**: During the Mon-Tue window, users cannot disable the boost.
    - **Unrestricted**: Outside of this window, users can manually toggle the boost for unscheduled events.

### 3. Dynamic Action History Insertion (System Actions)
The `ActionsStore` will automatically ensure `toggle_sale` and `toggle_earnings_boost` actions exist in the history whenever a boundary is crossed.
- **Auto-Detection**: During simulation, if an action crosses a Monday/Tuesday or Friday/Saturday 9AM boundary, a system-initiated toggle action will be inserted.
- **Relocation**: System toggle actions will move chronologically if preceding actions shift.
- **Initial State Check**: If a segment starts within a scheduled event window, the appropriate toggle action is automatically prepended.

### 3. Event-Aware Time to Save
The engine's `getTimeToSave` function will be updated to account for the recurring Monday 2x earnings event.
- **Logic**: When calculating how long it takes to save for a purchase, the function will look ahead at the simulation clock.
- **Impact**: If a user is saving for an item that takes several days, the calculation will subtract time for every Monday (9AM PT - Tuesday 9AM PT) encountered during the saving window.
- **Example**: If a purchase requires 48 hours of normal earnings, but a 2x earnings window starts in 12 hours, the time displayed will be `12h (normal) + 18h (at 2x)` = **30 hours** total, instead of 48 hours.

### 4. New "Wait for Research Sale" Action
A new action available on **Curiosity** under the "Wait Actions" section:
- **Wait for Research Sale**: Automatically waits until the next Friday at 9:00 AM PT.
- **Dynamic Duration**: This action maintains a fixed absolute end time. If preceding actions shift its start time, the duration of the "Wait" action scales automatically to compensate.

### 5. ROI Warning & UI Lookahead
The research view models will implement "Sale Lookahead" logic:
- **Lookahead Pricing**: If waiting for a sale is faster than saving now (using the new `getTimeToSave` logic), display the **Discounted Price** and the **"70% OFF"** badge.
- **Time to Buy**: `EffectiveSaleTime = max(SaleStartTime, TimeToSaveDiscountedPrice)`.
- **Earnings Event Indicator**: If the calculated "Time to Save" (for either full or discounted price) is reduced because it spans a Monday 2x event, show a small indicator (e.g., ⚡ or 🚀) next to the time. 
    - **Tooltip**: "Time to save is decreased because of the 2x earnings event."
- **ROI Warning**: Triggers if the payback window after purchase is too short to earn back the 70% savings.

## Files to be Modified
- `src/lib/time.ts`: New utilities for Pacific Time schedule calculations.
- `src/stores/actions/index.ts` & `src/engine/simulate.ts`: Core logic for automated sale action insertion and relocation.
- `src/stores/sales.ts`: Disable manual research sale toggling.
- `src/composables/useResearchViews.ts`: Update ROI logic and add "70% OFF" prediciton badges.
- `src/components/actions/ResearchActions.vue`: Replace toggle with status indicator.
- `src/components/actions/WaitActions.vue` & `WaitForResearchSale.vue`: New wait action.
- `src/components/actions/ResearchItem.vue`: Display badges and warnings.
- `src/components/TimelineAction.vue` (or equivalent): Show badges in Action History.
