import type { H3Event } from 'h3';
import useConfig from '~/server/config';

const PENDING_PLATFORM_REFRESH_CACHE_MAX_AGE_SECONDS = 5 * 60;
const PLATFORM_REFRESH_PENDING_CONTEXT_KEY =
    'currentTrainTimetablePlatformRefreshTaskPending';

interface CurrentTrainTimetableEventContext {
    currentTrainTimetablePlatformRefreshTaskPending?: boolean;
}

export function setCurrentTrainTimetablePlatformRefreshTaskPending(
    event: H3Event,
    pending: boolean
) {
    const context = event.context as CurrentTrainTimetableEventContext;
    context[PLATFORM_REFRESH_PENDING_CONTEXT_KEY] = pending;
}

export default function getCurrentTrainTimetableCacheMaxAge(
    event: H3Event,
    fallbackMaxAgeSeconds = useConfig().api.cache.timetableMaxAgeSeconds
) {
    const context = event.context as CurrentTrainTimetableEventContext;
    return context[PLATFORM_REFRESH_PENDING_CONTEXT_KEY]
        ? PENDING_PLATFORM_REFRESH_CACHE_MAX_AGE_SECONDS
        : fallbackMaxAgeSeconds;
}
