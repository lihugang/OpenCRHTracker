import useConfig from '~/server/config';
import getCurrentDateString from '~/server/utils/date/getCurrentDateString';
import { getShanghaiDayStartUnixSeconds } from '~/server/utils/date/shanghaiDateTime';

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
    cursorStartAt: number | null | undefined
): number {
    const cache = useConfig().api.cache;
    if (
        !Number.isInteger(cursorStartAt) ||
        cursorStartAt === null ||
        cursorStartAt === undefined
    ) {
        return cache.currentDayMaxAgeSeconds;
    }

    const todayStartAt = getShanghaiDayStartUnixSeconds(getCurrentDateString());
    return cursorStartAt < todayStartAt
        ? cache.historicalMaxAgeSeconds
        : cache.currentDayMaxAgeSeconds;
}
