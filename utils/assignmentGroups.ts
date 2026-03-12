import type {
    EmuHistoryRecord,
    RecentAssignmentGroup,
    TrainHistoryRecord
} from '~/types/lookup';

const DAY_KEY_FORMATTER = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
});

const DAY_LABEL_FORMATTER = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short'
});

const TIME_LABEL_FORMATTER = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
});

const MERGE_GAP_SECONDS = 30 * 60;
const ROUNDING_SECONDS = 15 * 60;

interface InternalTrainGroup {
    dayKey: string;
    startAt: number;
    endAt: number;
    startStation: string;
    endStation: string;
    codeSet: Set<string>;
}

interface InternalEmuGroup {
    dayKey: string;
    startAt: number;
    endAt: number;
    startStation: string;
    endStation: string;
    codeSet: Set<string>;
}

function formatDayKey(timestamp: number) {
    return DAY_KEY_FORMATTER.format(new Date(timestamp * 1000));
}

function formatDayLabel(timestamp: number) {
    return DAY_LABEL_FORMATTER.format(new Date(timestamp * 1000));
}

function formatTimeLabel(timestamp: number) {
    return TIME_LABEL_FORMATTER.format(new Date(timestamp * 1000));
}

function normalizeStation(value: string) {
    return value.trim();
}

function roundTimestamp(timestamp: number) {
    return Math.round(timestamp / ROUNDING_SECONDS) * ROUNDING_SECONDS;
}

function toRecentAssignmentGroup(
    group: InternalTrainGroup | InternalEmuGroup,
    index: number
): RecentAssignmentGroup {
    return {
        id: `${group.dayKey}-${group.startAt}-${group.endAt}-${index}`,
        dayLabel: formatDayLabel(group.startAt),
        timeLabel: `${formatTimeLabel(group.startAt)} - ${formatTimeLabel(group.endAt)}`,
        routeLabel: `${group.startStation} → ${group.endStation}`,
        startAt: group.startAt,
        endAt: group.endAt,
        startStation: group.startStation,
        endStation: group.endStation,
        primaryCodes: Array.from(group.codeSet)
    };
}

export function groupTrainAssignments(items: TrainHistoryRecord[]) {
    const groups = new Map<string, InternalTrainGroup>();

    for (const item of items) {
        const startStation = normalizeStation(item.startStation || '未知始发');
        const endStation = normalizeStation(item.endStation || '未知终到');
        const startAt = Number.isFinite(item.ts) ? item.ts : 0;
        const endAt =
            Number.isFinite(item.endAt) && item.endAt > 0
                ? item.endAt
                : startAt;
        const dayKey = formatDayKey(startAt);
        const key = [
            dayKey,
            startStation,
            endStation,
            roundTimestamp(startAt),
            roundTimestamp(endAt)
        ].join('|');

        const existing = groups.get(key);
        if (existing) {
            existing.codeSet.add(item.emuCode || '未知车组');
            existing.startAt = Math.min(existing.startAt, startAt);
            existing.endAt = Math.max(existing.endAt, endAt);
            continue;
        }

        groups.set(key, {
            dayKey,
            startAt,
            endAt,
            startStation,
            endStation,
            codeSet: new Set([item.emuCode || '未知车组'])
        });
    }

    return Array.from(groups.values())
        .sort((left, right) => right.startAt - left.startAt)
        .map((group, index) => toRecentAssignmentGroup(group, index));
}

function canMergeEmuAssignments(
    current: InternalEmuGroup,
    nextItem: EmuHistoryRecord
) {
    const nextStartStation = normalizeStation(
        nextItem.startStation || '未知始发'
    );
    const nextEndStation = normalizeStation(nextItem.endStation || '未知终到');
    const nextStartAt = Number.isFinite(nextItem.ts) ? nextItem.ts : 0;
    const nextEndAt =
        Number.isFinite(nextItem.endAt) && nextItem.endAt > 0
            ? nextItem.endAt
            : nextStartAt;

    const routeContinues = current.endStation === nextStartStation;
    const sameRouteWindow =
        current.startStation === nextStartStation &&
        current.endStation === nextEndStation &&
        Math.abs(nextStartAt - current.startAt) <= MERGE_GAP_SECONDS;
    const gap = nextStartAt - current.endAt;

    return (
        current.dayKey === formatDayKey(nextStartAt) &&
        ((routeContinues &&
            gap >= -MERGE_GAP_SECONDS &&
            gap <= MERGE_GAP_SECONDS) ||
            sameRouteWindow)
    );
}

export function groupEmuAssignments(items: EmuHistoryRecord[]) {
    const sortedItems = [...items].sort((left, right) => {
        if (left.ts !== right.ts) {
            return left.ts - right.ts;
        }

        return Number(left.id) - Number(right.id);
    });

    const groups: InternalEmuGroup[] = [];

    for (const item of sortedItems) {
        const startStation = normalizeStation(item.startStation || '未知始发');
        const endStation = normalizeStation(item.endStation || '未知终到');
        const startAt = Number.isFinite(item.ts) ? item.ts : 0;
        const endAt =
            Number.isFinite(item.endAt) && item.endAt > 0
                ? item.endAt
                : startAt;
        const trainCode = item.trainCode || '未知车次';
        const lastGroup = groups[groups.length - 1];

        if (lastGroup && canMergeEmuAssignments(lastGroup, item)) {
            lastGroup.codeSet.add(trainCode);
            lastGroup.endAt = Math.max(lastGroup.endAt, endAt);
            lastGroup.endStation = endStation;
            continue;
        }

        groups.push({
            dayKey: formatDayKey(startAt),
            startAt,
            endAt,
            startStation,
            endStation,
            codeSet: new Set([trainCode])
        });
    }

    return groups
        .sort((left, right) => right.startAt - left.startAt)
        .map((group, index) => toRecentAssignmentGroup(group, index));
}
