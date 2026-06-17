import type {
    DisplayTimetableStop,
    HistoricalTimetableOption
} from '~/types/lookupCurrentTimetable';
import formatShanghaiDateString from '~/utils/time/formatShanghaiDateString';

export const LOOKUP_TIMETABLE_DAY_SECONDS = 24 * 60 * 60;

const TIME_FORMATTER = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
});

const DATE_LABEL_FORMATTER = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric'
});

export function normalizeComparableCode(code: string | null | undefined) {
    return typeof code === 'string' ? code.trim().toUpperCase() : '';
}

export function normalizeTrainCodes(codes: string[]) {
    return Array.from(
        new Set(
            codes
                .map((code) => normalizeComparableCode(code))
                .filter((code) => code.length > 0)
        )
    );
}

export function isFiniteNumber(
    value: number | null | undefined
): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

export function isStartStop(stop: DisplayTimetableStop, index: number) {
    return index === 0 || stop.isStart;
}

export function normalizeForwardTimeDeltaSeconds(delta: number) {
    if (!Number.isFinite(delta)) {
        return 0;
    }

    let normalizedDelta = delta;
    while (normalizedDelta <= 0) {
        normalizedDelta += LOOKUP_TIMETABLE_DAY_SECONDS;
    }

    return normalizedDelta;
}

export function formatNullableTime(timestamp: number | null) {
    if (timestamp === null || !Number.isFinite(timestamp)) {
        return '--';
    }

    return TIME_FORMATTER.format(new Date(timestamp * 1000));
}

export function formatCirculationOffsetTime(offsetSeconds: number | null) {
    if (
        offsetSeconds === null ||
        !Number.isFinite(offsetSeconds) ||
        offsetSeconds < 0
    ) {
        return '--';
    }

    const normalizedOffset = Math.floor(offsetSeconds);
    const secondsOfDay = normalizedOffset % LOOKUP_TIMETABLE_DAY_SECONDS;
    const hours = Math.floor(secondsOfDay / 3600)
        .toString()
        .padStart(2, '0');
    const minutes = Math.floor((secondsOfDay % 3600) / 60)
        .toString()
        .padStart(2, '0');

    return `${hours}:${minutes}`;
}

export function formatStopTime(value: number | null, isHistorical: boolean) {
    if (isHistorical) {
        return formatCirculationOffsetTime(value);
    }

    return formatNullableTime(value);
}

export function formatCalendarDateLabel(timestamp: number) {
    const parts = DATE_LABEL_FORMATTER.formatToParts(
        new Date(timestamp * 1000)
    );
    const year = parts.find((part) => part.type === 'year')?.value ?? '';
    const month = parts.find((part) => part.type === 'month')?.value ?? '';
    const day = parts.find((part) => part.type === 'day')?.value ?? '';

    if (year.length === 0 || month.length === 0 || day.length === 0) {
        return '';
    }

    return `${year} 年 ${month} 月 ${day} 日`;
}

export function getUpdatedDateLabel(updatedAt: number | null) {
    if (updatedAt === null || !Number.isFinite(updatedAt) || updatedAt <= 0) {
        return '';
    }

    const todayTimestamp = Math.floor(Date.now() / 1000);
    const updatedDateKey = formatShanghaiDateString(updatedAt);
    if (updatedDateKey.length === 0) {
        return '';
    }

    if (updatedDateKey === formatShanghaiDateString(todayTimestamp)) {
        return '今日';
    }

    if (
        updatedDateKey ===
        formatShanghaiDateString(todayTimestamp - LOOKUP_TIMETABLE_DAY_SECONDS)
    ) {
        return '昨日';
    }

    return formatCalendarDateLabel(updatedAt);
}

export function formatServiceDateLabel(serviceDate: string) {
    if (!/^\d{8}$/.test(serviceDate)) {
        return '';
    }

    const month = Number(serviceDate.slice(4, 6));
    const day = Number(serviceDate.slice(6, 8));
    if (!Number.isInteger(month) || !Number.isInteger(day)) {
        return '';
    }

    return `${month} 月 ${day} 日`;
}

export function formatHistoryOptionLabel(item: HistoricalTimetableOption) {
    const startLabel = formatServiceDateLabel(item.serviceDateStart);
    return startLabel.length > 0 ? `${startLabel}起` : '';
}

export function formatStopWicket(stop: DisplayTimetableStop) {
    const wicket = stop.wicket?.trim() || '--';

    if (!isFiniteNumber(stop.platformNo)) {
        return wicket;
    }

    return `${wicket} (${Math.round(stop.platformNo)} 站台)`;
}

export function formatStopDistance(stop: DisplayTimetableStop, index: number) {
    if (isStartStop(stop, index) || !isFiniteNumber(stop.distance)) {
        return '-';
    }

    return `${Math.round(stop.distance)} 千米`;
}

export function formatStopSectionSpeed(
    stops: DisplayTimetableStop[],
    stop: DisplayTimetableStop,
    index: number
) {
    if (isStartStop(stop, index) || !isFiniteNumber(stop.distance)) {
        return '-';
    }

    const previousStop = stops[index - 1] ?? null;
    if (
        !previousStop ||
        !isFiniteNumber(previousStop.departAt) ||
        !isFiniteNumber(stop.arriveAt)
    ) {
        return '-';
    }

    const previousDistance = isFiniteNumber(previousStop.distance)
        ? previousStop.distance
        : isStartStop(previousStop, index - 1)
          ? 0
          : null;

    if (!isFiniteNumber(previousDistance)) {
        return '-';
    }

    const distanceDelta = stop.distance - previousDistance;
    const timeDelta = normalizeForwardTimeDeltaSeconds(
        stop.arriveAt - previousStop.departAt
    );

    if (distanceDelta < 0 || timeDelta <= 0) {
        return '-';
    }

    return `${Math.round(distanceDelta / (timeDelta / 3600))} km/h`;
}
