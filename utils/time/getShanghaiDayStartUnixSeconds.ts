const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_SECONDS = 24 * 60 * 60;

export default function getShanghaiDayStartUnixSeconds(serviceDate: string) {
    if (!/^\d{8}$/.test(serviceDate)) {
        return null;
    }

    const year = Number.parseInt(serviceDate.slice(0, 4), 10);
    const month = Number.parseInt(serviceDate.slice(4, 6), 10);
    const day = Number.parseInt(serviceDate.slice(6, 8), 10);
    const pseudoUtcMs = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
    return Math.floor((pseudoUtcMs - SHANGHAI_OFFSET_MS) / 1000);
}

export function getShanghaiDayOffsetFromServiceDate(
    serviceDate: string,
    timestamp: number
) {
    if (!Number.isFinite(timestamp)) {
        return null;
    }

    const dayStart = getShanghaiDayStartUnixSeconds(serviceDate);
    if (dayStart === null) {
        return null;
    }

    return Math.floor((timestamp - dayStart) / DAY_SECONDS);
}
