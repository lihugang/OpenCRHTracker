import useConfig from '~/server/config';
import getCurrentDateString from '~/server/utils/date/getCurrentDateString';

export function getDailyResponseCacheControlMaxAge(date: string): number {
    const cache = useConfig().api.cache;
    return date >= getCurrentDateString()
        ? cache.currentDayMaxAgeSeconds
        : cache.historicalMaxAgeSeconds;
}

export function getMonthlyResponseCacheControlMaxAge(
    year: number,
    month: number
): number {
    const cache = useConfig().api.cache;
    const currentDate = getCurrentDateString();
    const currentYear = Number.parseInt(currentDate.slice(0, 4), 10);
    const currentMonth = Number.parseInt(currentDate.slice(4, 6), 10);

    return year === currentYear && month === currentMonth
        ? cache.currentDayMaxAgeSeconds
        : cache.historicalMaxAgeSeconds;
}

export function getHistoryResponseCacheControlMaxAge(
    cursorServiceDate: string | null | undefined
): number {
    const cache = useConfig().api.cache;
    if (
        typeof cursorServiceDate !== 'string' ||
        !/^\d{8}$/.test(cursorServiceDate)
    ) {
        return cache.currentDayMaxAgeSeconds;
    }

    return cursorServiceDate < getCurrentDateString()
        ? cache.historicalMaxAgeSeconds
        : cache.currentDayMaxAgeSeconds;
}
