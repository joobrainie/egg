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
    const OneHour = 3600;
    const OneDay = 24 * OneHour;

    // Check if we are currently in an event window.
    // If we are, we also want to know when it ends.
    let inEarningsBoost = false;
    let earningsBoostEndTime = -1;
    let inResearchSale = false;
    let researchSaleEndTime = -1;

    // We check from 24h ago until now
    for (let offset = -24; offset <= 0; offset++) {
        const testTS = currentTimeSeconds + (offset * OneHour);
        const testDate = new Date(testTS * 1000);
        const ptOffset = getPacificOffsetSeconds(testDate);
        const ptDate = new Date(testDate.getTime() + ptOffset * 1000);

        const day = ptDate.getUTCDay();
        const hour = ptDate.getUTCHours();

        if (day === DAY_MONDAY && hour === EVENT_START_HOUR_PT) {
            const actStart = testTS - (testTS % OneHour);
            const actDuration = currentTimeSeconds - actStart;
            if (actDuration >= 0 && actDuration < OneDay) {
                inEarningsBoost = true;
                earningsBoostEndTime = actStart + OneDay;
            }
        }

        if (day === DAY_FRIDAY && hour === EVENT_START_HOUR_PT) {
            const actStart = testTS - (testTS % OneHour);
            const actDuration = currentTimeSeconds - actStart;
            if (actDuration >= 0 && actDuration < OneDay) {
                inResearchSale = true;
                researchSaleEndTime = actStart + OneDay;
            }
        }
    }

    // Find the NEXT events
    let nextEarningsBoost = -1;
    let nextResearchSale = -1;
    const startOfHour = currentTimeSeconds - (currentTimeSeconds % OneHour);

    for (let offset = 0; offset <= 24 * 7 + 24; offset++) {
        const testTS = startOfHour + (offset * OneHour);
        const testDate = new Date(testTS * 1000);
        const ptOffset = getPacificOffsetSeconds(testDate);
        const ptDate = new Date(testDate.getTime() + ptOffset * 1000);

        const day = ptDate.getUTCDay();
        const hour = ptDate.getUTCHours();

        if (day === DAY_MONDAY && hour === EVENT_START_HOUR_PT && nextEarningsBoost === -1) {
            if (testTS > currentTimeSeconds) {
                nextEarningsBoost = testTS;
            }
        }

        if (day === DAY_FRIDAY && hour === EVENT_START_HOUR_PT && nextResearchSale === -1) {
            if (testTS > currentTimeSeconds) {
                nextResearchSale = testTS;
            }
        }

        if (nextEarningsBoost !== -1 && nextResearchSale !== -1) {
            break;
        }
    }

    return {
        isEarningsBoostActive: inEarningsBoost,
        isResearchSaleActive: inResearchSale,
        currentEarningsBoostEndTime: earningsBoostEndTime,
        currentResearchSaleEndTime: researchSaleEndTime,
        nextEarningsBoostStartTime: nextEarningsBoost,
        nextResearchSaleStartTime: nextResearchSale,
    };
}

export function getNextEventBoundary(currentTimeSeconds: number): number {
    const info = getEventInfo(currentTimeSeconds);
    const boundaries: number[] = [];

    if (info.isEarningsBoostActive) {
        boundaries.push(info.currentEarningsBoostEndTime);
    } else if (info.nextEarningsBoostStartTime !== -1) {
        boundaries.push(info.nextEarningsBoostStartTime);
    }

    if (info.isResearchSaleActive) {
        boundaries.push(info.currentResearchSaleEndTime);
    } else if (info.nextResearchSaleStartTime !== -1) {
        boundaries.push(info.nextResearchSaleStartTime);
    }

    if (boundaries.length === 0) return -1;
    return Math.min(...boundaries.filter(b => b > currentTimeSeconds));
}

