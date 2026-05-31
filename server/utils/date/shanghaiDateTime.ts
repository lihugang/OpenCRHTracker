import parseTimeAsTimestamp from './parseTimeAsTimestamp';

export const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;
export const SHANGHAI_DAY_SECONDS = 24 * 60 * 60;

const shanghaiDateTimeFormatter = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
});

export function parseDailyTimeHHmm(dailyTimeHHmm: string) {
    if (!/^\d{4}$/.test(dailyTimeHHmm)) {
        throw new Error(
            `dailyTimeHHmm must be a 4-digit string, got: ${dailyTimeHHmm}`
        );
    }

    const hour = Number.parseInt(dailyTimeHHmm.slice(0, 2), 10);
    const minute = Number.parseInt(dailyTimeHHmm.slice(2, 4), 10);

    if (hour < 0 || hour > 23) {
        throw new Error(
            `dailyTimeHHmm hour must be between 00 and 23, got: ${dailyTimeHHmm}`
        );
    }
    if (minute < 0 || minute > 59) {
        throw new Error(
            `dailyTimeHHmm minute must be between 00 and 59, got: ${dailyTimeHHmm}`
        );
    }

    return {
        hour,
        minute
    };
}

function parseDateYYYYMMDD(dateYYYYMMDD: string) {
    if (!/^\d{8}$/.test(dateYYYYMMDD)) {
        throw new Error(
            `dateYYYYMMDD must be an 8-digit string, got: ${dateYYYYMMDD}`
        );
    }

    const year = Number.parseInt(dateYYYYMMDD.slice(0, 4), 10);
    const month = Number.parseInt(dateYYYYMMDD.slice(4, 6), 10);
    const day = Number.parseInt(dateYYYYMMDD.slice(6, 8), 10);
    if (month < 1 || month > 12) {
        throw new Error(
            `dateYYYYMMDD month must be between 01 and 12, got: ${dateYYYYMMDD}`
        );
    }
    if (day < 1 || day > 31) {
        throw new Error(
            `dateYYYYMMDD day must be between 01 and 31, got: ${dateYYYYMMDD}`
        );
    }

    return {
        year,
        month,
        day
    };
}

export function getShanghaiDayStartUnixSeconds(dateYYYYMMDD: string): number {
    const { year, month, day } = parseDateYYYYMMDD(dateYYYYMMDD);
    const pseudoUtcMs = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
    return Math.floor((pseudoUtcMs - SHANGHAI_OFFSET_MS) / 1000);
}

export function getShanghaiDayBucket(timestampSeconds: number) {
    return Math.floor(
        (timestampSeconds + SHANGHAI_OFFSET_MS / 1000) / SHANGHAI_DAY_SECONDS
    );
}

export function getShanghaiDayOffsetSeconds(timestampSeconds: number) {
    const dayBucket = getShanghaiDayBucket(timestampSeconds);
    return (
        timestampSeconds -
        (dayBucket * SHANGHAI_DAY_SECONDS - SHANGHAI_OFFSET_MS / 1000)
    );
}

export function expandSequentialShanghaiDayOffsets<T>(
    items: readonly T[],
    getStartAt: (item: T) => number,
    getEndAt: (item: T) => number
) {
    const expandedOffsets: {
        startAt: number;
        endAt: number;
        routeDayOffset: number;
    }[] = [];
    let previousEndAt: number | null = null;

    for (const item of items) {
        const startAt = getStartAt(item);
        const endAt = getEndAt(item);
        const startDayOffsetSeconds = getShanghaiDayOffsetSeconds(startAt);
        const endDayOffsetSeconds = getShanghaiDayOffsetSeconds(endAt);
        const endDayShift = Math.max(
            getShanghaiDayBucket(endAt) - getShanghaiDayBucket(startAt),
            0
        );
        let routeDayOffset = 0;
        let expandedStartAt = startDayOffsetSeconds;

        if (previousEndAt !== null) {
            while (expandedStartAt < previousEndAt) {
                routeDayOffset += 1;
                expandedStartAt =
                    routeDayOffset * SHANGHAI_DAY_SECONDS +
                    startDayOffsetSeconds;
            }
        }

        const expandedEndAt =
            routeDayOffset * SHANGHAI_DAY_SECONDS +
            endDayShift * SHANGHAI_DAY_SECONDS +
            endDayOffsetSeconds;

        expandedOffsets.push({
            startAt: expandedStartAt,
            endAt: expandedEndAt,
            routeDayOffset
        });
        previousEndAt = expandedEndAt;
    }

    return expandedOffsets;
}

export function toUnixSecondsFromShanghaiDayOffset(
    dateYYYYMMDD: string,
    offsetSeconds: number
): number {
    if (!Number.isInteger(offsetSeconds) || offsetSeconds < 0) {
        throw new Error('offsetSeconds must be a non-negative integer');
    }
    return getShanghaiDayStartUnixSeconds(dateYYYYMMDD) + offsetSeconds;
}

export function toShanghaiDayOffsetFromUnixSeconds(
    dateYYYYMMDD: string,
    unixSeconds: number
): number {
    if (!Number.isInteger(unixSeconds) || unixSeconds < 0) {
        throw new Error('unixSeconds must be a non-negative integer');
    }
    return unixSeconds - getShanghaiDayStartUnixSeconds(dateYYYYMMDD);
}

export function getShanghaiUnixSecondsFromDateAndTime(
    dateYYYYMMDD: string,
    timeHHmm: string
): number {
    return (
        getShanghaiDayStartUnixSeconds(dateYYYYMMDD) +
        parseTimeAsTimestamp(timeHHmm)
    );
}

export function formatShanghaiDateTime(timestampSeconds: number): string {
    return shanghaiDateTimeFormatter.format(new Date(timestampSeconds * 1000));
}

export function getNextDayExecutionTimeInShanghaiSeconds(
    nowMs: number,
    dailyTimeHHmm: string
): number {
    const { hour, minute } = parseDailyTimeHHmm(dailyTimeHHmm);
    const shanghaiNowPseudoUtcMs = nowMs + SHANGHAI_OFFSET_MS;
    const shanghaiNow = new Date(shanghaiNowPseudoUtcMs);

    const year = shanghaiNow.getUTCFullYear();
    const month = shanghaiNow.getUTCMonth();
    const day = shanghaiNow.getUTCDate();

    const nextDayTargetPseudoUtcMs = Date.UTC(
        year,
        month,
        day + 1,
        hour,
        minute,
        0,
        0
    );

    return Math.floor((nextDayTargetPseudoUtcMs - SHANGHAI_OFFSET_MS) / 1000);
}

export function getNextExecutionTimeInShanghaiSeconds(
    nowMs: number,
    dailyTimeHHmm: string
): number {
    const { hour, minute } = parseDailyTimeHHmm(dailyTimeHHmm);
    const shanghaiNowPseudoUtcMs = nowMs + SHANGHAI_OFFSET_MS;
    const shanghaiNow = new Date(shanghaiNowPseudoUtcMs);

    const year = shanghaiNow.getUTCFullYear();
    const month = shanghaiNow.getUTCMonth();
    const day = shanghaiNow.getUTCDate();

    const todayTargetPseudoUtcMs = Date.UTC(
        year,
        month,
        day,
        hour,
        minute,
        0,
        0
    );

    if (todayTargetPseudoUtcMs > shanghaiNowPseudoUtcMs) {
        return Math.floor((todayTargetPseudoUtcMs - SHANGHAI_OFFSET_MS) / 1000);
    }

    return getNextDayExecutionTimeInShanghaiSeconds(nowMs, dailyTimeHHmm);
}

export function getNextExecutionTimeByDailyTimesInShanghaiSeconds(
    nowMs: number,
    dailyTimesHHmm: string[]
): number {
    if (dailyTimesHHmm.length === 0) {
        throw new Error('dailyTimesHHmm must not be empty');
    }

    let nextExecutionTime: number | null = null;

    for (const dailyTimeHHmm of dailyTimesHHmm) {
        const executionTime = getNextExecutionTimeInShanghaiSeconds(
            nowMs,
            dailyTimeHHmm
        );
        if (nextExecutionTime === null || executionTime < nextExecutionTime) {
            nextExecutionTime = executionTime;
        }
    }

    return nextExecutionTime!;
}
