import normalizeTrainCode from '~/server/utils/12306/normalizeCode';
import type { ScheduleItem } from './types';

export function getGroupKey(
    item: Pick<ScheduleItem, 'code' | 'internalCode'>
): string {
    const internalCode = item.internalCode.trim().toUpperCase();
    if (internalCode.length > 0) {
        return `internal:${internalCode}`;
    }
    return `code:${normalizeTrainCode(item.code)}`;
}

export function splitIntoBatches<T>(list: T[], size: number): T[][] {
    if (!Number.isInteger(size) || size <= 0) {
        throw new Error('size must be a positive integer');
    }

    const batches: T[][] = [];
    for (let index = 0; index < list.length; index += size) {
        batches.push(list.slice(index, index + size));
    }
    return batches;
}

export function buildGroupIndex(items: ScheduleItem[]): Map<string, number[]> {
    const indexByGroup = new Map<string, number[]>();
    for (const [index, item] of items.entries()) {
        const groupKey = getGroupKey(item);
        const groupItems = indexByGroup.get(groupKey);
        if (groupItems) {
            groupItems.push(index);
        } else {
            indexByGroup.set(groupKey, [index]);
        }
    }
    return indexByGroup;
}

export function buildCodeIndex(items: ScheduleItem[]): Map<string, number> {
    const indexByCode = new Map<string, number>();
    for (const [index, item] of items.entries()) {
        indexByCode.set(normalizeTrainCode(item.code), index);
    }
    return indexByCode;
}
