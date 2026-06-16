import normalizeCode from '~/server/utils/12306/normalizeCode';
import type { ScheduleItem, ScheduleState } from './types';

export interface RemovedInvalidScheduleItem {
    code: string;
    internalCode: string;
    allCodes: string[];
    startAt: number | null;
    endAt: number | null;
    reason: 'invalid_route_time' | 'invalid_stop_time';
}

function isNonNegativeIntegerOrNull(value: number | null): boolean {
    return value === null || (Number.isInteger(value) && value >= 0);
}

function hasInvalidStopTime(item: ScheduleItem): boolean {
    return item.stops.some(
        (stop) =>
            !isNonNegativeIntegerOrNull(stop.arriveAt) ||
            !isNonNegativeIntegerOrNull(stop.departAt)
    );
}

function buildRemovedItem(
    item: ScheduleItem,
    reason: RemovedInvalidScheduleItem['reason']
): RemovedInvalidScheduleItem {
    return {
        code: normalizeCode(item.code),
        internalCode: normalizeCode(item.internalCode),
        allCodes: [
            ...new Set(
                [item.code, ...item.allCodes]
                    .map((code) => normalizeCode(code))
                    .filter((code) => code.length > 0)
            )
        ],
        startAt: item.startAt,
        endAt: item.endAt,
        reason
    };
}

export function filterInvalidScheduleItems(state: ScheduleState): {
    state: ScheduleState;
    removedItems: RemovedInvalidScheduleItem[];
} {
    const removedItems: RemovedInvalidScheduleItem[] = [];
    const items = state.items.filter((item) => {
        if (
            !isNonNegativeIntegerOrNull(item.startAt) ||
            !isNonNegativeIntegerOrNull(item.endAt)
        ) {
            removedItems.push(buildRemovedItem(item, 'invalid_route_time'));
            return false;
        }

        if (hasInvalidStopTime(item)) {
            removedItems.push(buildRemovedItem(item, 'invalid_stop_time'));
            return false;
        }

        return true;
    });

    if (removedItems.length === 0) {
        return {
            state,
            removedItems
        };
    }

    return {
        state: {
            ...state,
            items,
            stats: {
                ...state.stats,
                uniqueItems: items.length
            },
            progress: {
                ...state.progress,
                failedEnrichCodes: state.progress.failedEnrichCodes.filter(
                    (code) =>
                        !removedItems.some((item) =>
                            item.allCodes.includes(normalizeCode(code))
                        )
                )
            }
        },
        removedItems
    };
}
