import { formatShanghaiDateString } from './getCurrentDateString';
import { getShanghaiDayStartUnixSeconds } from './shanghaiDateTime';

export type ServiceDay = number & { readonly __brand: 'ServiceDay' };

const DAY_SECONDS = 24 * 60 * 60;
const EPOCH_SERVICE_DAY_START_SECONDS =
    Date.UTC(1970, 0, 1, 0, 0, 0) / 1000 - 8 * 60 * 60;

export function asServiceDay(value: number): ServiceDay {
    if (!Number.isInteger(value) || value < 0) {
        throw new Error(`invalid_service_day ${value}`);
    }
    return value as ServiceDay;
}

export function serviceDateToDay(serviceDate: string): ServiceDay {
    if (!/^\d{8}$/.test(serviceDate)) {
        throw new Error(`invalid_service_date ${serviceDate}`);
    }

    const year = Number(serviceDate.slice(0, 4));
    const month = Number(serviceDate.slice(4, 6));
    const dayOfMonth = Number(serviceDate.slice(6, 8));
    const calendarDate = new Date(Date.UTC(year, month - 1, dayOfMonth));
    if (
        calendarDate.getUTCFullYear() !== year ||
        calendarDate.getUTCMonth() + 1 !== month ||
        calendarDate.getUTCDate() !== dayOfMonth
    ) {
        throw new Error(`invalid_service_date ${serviceDate}`);
    }

    const dayStart = getShanghaiDayStartUnixSeconds(serviceDate);
    return asServiceDay(
        (dayStart - EPOCH_SERVICE_DAY_START_SECONDS) / DAY_SECONDS
    );
}

export function dayToServiceDate(serviceDay: ServiceDay): string {
    const day = Number(serviceDay);

    return formatShanghaiDateString(
        (EPOCH_SERVICE_DAY_START_SECONDS + day * DAY_SECONDS) * 1000
    );
}

export function unixSecondsToServiceDay(timestampSeconds: number): ServiceDay {
    if (
        !Number.isFinite(timestampSeconds) ||
        !Number.isInteger(timestampSeconds)
    ) {
        throw new Error(`invalid_unix_timestamp ${timestampSeconds}`);
    }

    const dayStart = getShanghaiDayStartUnixSeconds(
        formatShanghaiDateString(timestampSeconds * 1000)
    );
    return asServiceDay(
        Math.floor((dayStart - EPOCH_SERVICE_DAY_START_SECONDS) / DAY_SECONDS)
    );
}

export function serviceDayToShanghaiDayStartUnixSeconds(
    serviceDay: ServiceDay
): number {
    const day = Number(serviceDay);
    if (!Number.isInteger(day) || day < 0) {
        throw new Error(`invalid_service_day ${day}`);
    }

    return EPOCH_SERVICE_DAY_START_SECONDS + day * DAY_SECONDS;
}
