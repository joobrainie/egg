// Utilities for Pacific Time event schedules
// Earnings Boost = Monday 9:00 AM PT to Tuesday 9:00 AM PT (24 hrs)
// Research Sale = Friday 9:00 AM PT to Saturday 9:00 AM PT (24 hrs)

const EVENT_START_HOUR_PT = 9;
const DAY_MONDAY = 1;
const DAY_FRIDAY = 5;

// We use cache for toLocaleString calls to speed things up (seen in previous conversations)
let offsetCache = new Map<number, number>();

export function getPacificOffsetSeconds(date: Date): number {
    // A quick way to get PT offset is checking the hour differences
    // Round date to start of hour to improve cache hit rate
    const cacheKey = new Date(date).setMinutes(0, 0, 0);
    if (offsetCache.has(cacheKey)) return offsetCache.get(cacheKey)!;

    const ptString = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Los_Angeles',
        year: 'numeric', month: 'numeric', day: 'numeric',
        hour: 'numeric', minute: 'numeric', second: 'numeric',
        hour12: false
    }).format(date);

    // create a date object as if PT was local time
    // format is "MM/DD/YYYY, HH:mm:ss" usually, so we parse it
    const ptDate = new Date(ptString);
    if (isNaN(ptDate.getTime())) {
        return -28800; // default to PST
    }
    const offsetMs = ptDate.getTime() - date.getTime();
    const offsetSeconds = Math.round(offsetMs / 1000);
    offsetCache.set(cacheKey, offsetSeconds);
    return offsetSeconds;
}

export function getEventInfo(currentTimeSeconds: number) {
    // Current time in UTC Date
    const date = new Date(currentTimeSeconds * 1000);

    // Loop ahead hour by hour until we hit Monday 9AM PT and Friday 9AM PT
    // Not the most efficient but very robust for DST transitions
    const OneHour = 3600;

    // We can just align to the start of the current hour
    let ts = currentTimeSeconds - (currentTimeSeconds % OneHour);

    let nextEarningsBoost = -1;
    let nextResearchSale = -1;
    let inEarningsBoost = false;
    let inResearchSale = false;

    // Check if we are currently in an event window
    // Event is 24 hours long, so we check conditions at the exact hour
    for (let offset = -24; offset <= 0; offset++) {
        const testDate = new Date((ts + offset * OneHour) * 1000);
        const ptOffset = getPacificOffsetSeconds(testDate);
        const ptDate = new Date(testDate.getTime() + ptOffset * 1000);

        const day = ptDate.getUTCDay();
        const hour = ptDate.getUTCHours();

        if (day === DAY_MONDAY && hour === EVENT_START_HOUR_PT) {
            // Started within the last 24 hours
            // meaning it's currently active!
            const actStart = (ts + offset * OneHour);
            const actDuration = currentTimeSeconds - actStart;
            if (actDuration >= 0 && actDuration < 24 * OneHour) {
                inEarningsBoost = true;
            }
        }

        if (day === DAY_FRIDAY && hour === EVENT_START_HOUR_PT) {
            const actStart = (ts + offset * OneHour);
            const actDuration = currentTimeSeconds - actStart;
            if (actDuration >= 0 && actDuration < 24 * OneHour) {
                inResearchSale = true;
            }
        }
    }

    // Find the NEXT events
    for (let offset = 0; offset <= 24 * 7 + 24; offset++) {
        const testDate = new Date((ts + offset * OneHour) * 1000);
        const ptOffset = getPacificOffsetSeconds(testDate);
        const ptDate = new Date(testDate.getTime() + ptOffset * 1000);

        const day = ptDate.getUTCDay();
        const hour = ptDate.getUTCHours();

        if (day === DAY_MONDAY && hour === EVENT_START_HOUR_PT && nextEarningsBoost === -1) {
            const actStart = (ts + offset * OneHour);
            if (actStart > currentTimeSeconds) {
                nextEarningsBoost = actStart;
            }
        }

        if (day === DAY_FRIDAY && hour === EVENT_START_HOUR_PT && nextResearchSale === -1) {
            const actStart = (ts + offset * OneHour);
            if (actStart > currentTimeSeconds) {
                nextResearchSale = actStart;
            }
        }

        if (nextEarningsBoost !== -1 && nextResearchSale !== -1) {
            break;
        }
    }

    return {
        isEarningsBoostActive: inEarningsBoost,
        isResearchSaleActive: inResearchSale,
        nextEarningsBoostStartTime: nextEarningsBoost, // in simulation seconds
        nextEarningsBoostEndTime: nextEarningsBoost + 24 * 3600,
        nextResearchSaleStartTime: nextResearchSale,
        nextResearchSaleEndTime: nextResearchSale + 24 * 3600,
    };
}

export function getNextEventBoundary(currentTimeSeconds: number): number {
    // Find the next threshold (start or end of any event)
    const info = getEventInfo(currentTimeSeconds);

    const boundaries = [];
    if (info.isEarningsBoostActive) {
        // Find when it ends
        // Since it starts Mon 9AM, it ends exact 24h later
        // wait, we didn't calculate current event end time nicely if it's active.
        // If active, it ends when the next Tue 9AM PT hits.
    }
    return -1;
}

