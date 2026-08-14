import formatShanghaiDateString from '~/utils/time/formatShanghaiDateString';

const SHANGHAI_OFFSET_SECONDS = 8 * 60 * 60;
const DAY_SECONDS = 24 * 60 * 60;
const EPOCH_SERVICE_DAY_START_SECONDS =
    Date.UTC(1970, 0, 1, 0, 0, 0) / 1000 - SHANGHAI_OFFSET_SECONDS;

export function epochServiceDayToDateString(serviceDay: number): string {
    if (!Number.isInteger(serviceDay) || serviceDay < 0) {
        return '';
    }

    const timestampSeconds =
        EPOCH_SERVICE_DAY_START_SECONDS + serviceDay * DAY_SECONDS;
    return formatShanghaiDateString(timestampSeconds);
}

export function epochServiceDayToShanghaiDayStartUnixSeconds(
    serviceDay: number
): number | null {
    if (!Number.isInteger(serviceDay) || serviceDay < 0) {
        return null;
    }

    return EPOCH_SERVICE_DAY_START_SECONDS + serviceDay * DAY_SECONDS;
}

export function dateStringToEpochServiceDay(value: string): number | null {
    if (!/^\d{8}$/.test(value)) {
        return null;
    }

    const year = Number.parseInt(value.slice(0, 4), 10);
    const month = Number.parseInt(value.slice(4, 6), 10);
    const day = Number.parseInt(value.slice(6, 8), 10);
    const pseudoUtcMs = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
    const dayStart = Math.floor(
        (pseudoUtcMs - SHANGHAI_OFFSET_SECONDS * 1000) / 1000
    );
    return (dayStart - EPOCH_SERVICE_DAY_START_SECONDS) / DAY_SECONDS;
}
