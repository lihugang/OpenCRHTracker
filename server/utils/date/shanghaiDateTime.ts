export const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;

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
