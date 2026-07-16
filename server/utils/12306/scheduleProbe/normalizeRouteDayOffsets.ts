import { SHANGHAI_DAY_SECONDS } from '~/server/utils/date/shanghaiDateTime';
import type { ScheduleItem } from './types';

function collectItemOffsets(item: ScheduleItem): number[] {
    const offsets: number[] = [];

    for (const offset of [item.startAt, item.endAt]) {
        if (offset !== null) {
            offsets.push(offset);
        }
    }

    for (const stop of item.stops) {
        for (const offset of [stop.arriveAt, stop.departAt]) {
            if (offset !== null) {
                offsets.push(offset);
            }
        }
    }

    return offsets;
}

export function getRouteGroupDayOffsetShift(
    items: readonly ScheduleItem[]
): number {
    const offsets = items.flatMap(collectItemOffsets);
    for (const offset of offsets) {
        if (!Number.isInteger(offset)) {
            throw new Error('route day offsets must be integers');
        }
    }

    const minimumOffset = offsets.length > 0 ? Math.min(...offsets) : 0;
    if (minimumOffset >= 0) {
        return 0;
    }

    return (
        Math.ceil(-minimumOffset / SHANGHAI_DAY_SECONDS) * SHANGHAI_DAY_SECONDS
    );
}

export function shiftScheduleItemDayOffsets(
    item: ScheduleItem,
    shiftSeconds: number
): void {
    if (!Number.isInteger(shiftSeconds) || shiftSeconds < 0) {
        throw new Error('shiftSeconds must be a non-negative integer');
    }
    if (shiftSeconds === 0) {
        return;
    }

    item.startAt = item.startAt === null ? null : item.startAt + shiftSeconds;
    item.endAt = item.endAt === null ? null : item.endAt + shiftSeconds;
    for (const stop of item.stops) {
        stop.arriveAt =
            stop.arriveAt === null ? null : stop.arriveAt + shiftSeconds;
        stop.departAt =
            stop.departAt === null ? null : stop.departAt + shiftSeconds;
    }
}

export function normalizeRouteGroupDayOffsets(
    items: readonly ScheduleItem[]
): number {
    const shiftSeconds = getRouteGroupDayOffsetShift(items);
    for (const item of items) {
        shiftScheduleItemDayOffsets(item, shiftSeconds);
    }
    return shiftSeconds;
}
