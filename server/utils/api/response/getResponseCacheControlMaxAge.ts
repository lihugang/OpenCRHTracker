import useConfig from '~/server/config';
import getCurrentDateString from '~/server/utils/date/getCurrentDateString';
import { getShanghaiDayStartUnixSeconds } from '~/server/utils/date/shanghaiDateTime';

export function getDailyResponseCacheControlMaxAge(date: string): number {
    const cache = useConfig().api.cache;
    return date === getCurrentDateString()
        ? cache.currentDayMaxAgeSeconds
        : cache.historicalMaxAgeSeconds;
}

export function getHistoryResponseCacheControlMaxAge(
    latestStartAt: number | undefined,
    itemsLength: number,
    limit: number
): number {
    const cache = useConfig().api.cache;
    if (latestStartAt === undefined || itemsLength !== limit) {
        return cache.currentDayMaxAgeSeconds;
    }

    const todayStartAt = getShanghaiDayStartUnixSeconds(getCurrentDateString());
    return latestStartAt < todayStartAt
        ? cache.historicalMaxAgeSeconds
        : cache.currentDayMaxAgeSeconds;
}
