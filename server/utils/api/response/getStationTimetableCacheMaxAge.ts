import useConfig from '~/server/config';

export default function getStationTimetableCacheMaxAge(
    data: unknown,
    fallbackMaxAgeSeconds = useConfig().api.cache.timetableMaxAgeSeconds
) {
    const items =
        typeof data === 'object' &&
        data !== null &&
        Array.isArray((data as { items?: unknown }).items)
            ? (data as { items: unknown[] }).items
            : [];
    const hasMissingPlatform =
        items.length > 0 &&
        items.some((item) => {
            if (typeof item !== 'object' || item === null) {
                return true;
            }
            const platformNo = (item as { platformNo?: unknown }).platformNo;
            return platformNo === null || platformNo === undefined;
        });
    return hasMissingPlatform
        ? useConfig().api.cache.currentDayMaxAgeSeconds
        : fallbackMaxAgeSeconds;
}
