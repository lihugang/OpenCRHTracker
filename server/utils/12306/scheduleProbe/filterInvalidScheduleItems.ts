import {
    trainCodeKey,
    type TrainCodeParts
} from '~/server/utils/12306/trainCode';
import type { ScheduleItem, ScheduleState } from './types';

export interface RemovedInvalidScheduleItem {
    code: TrainCodeParts;
    internalCode: string;
    allCodes: TrainCodeParts[];
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
        code: item.code,
        internalCode: item.internalCode,
        allCodes: [
            ...[item.code, ...item.allCodes].filter(
                (code, index, codes) =>
                    codes.findIndex(
                        (candidate) =>
                            trainCodeKey(candidate) === trainCodeKey(code)
                    ) === index
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
                            item.allCodes.some(
                                (removedCode) =>
                                    trainCodeKey(removedCode) ===
                                    trainCodeKey(code)
                            )
                        )
                )
            }
        },
        removedItems
    };
}
