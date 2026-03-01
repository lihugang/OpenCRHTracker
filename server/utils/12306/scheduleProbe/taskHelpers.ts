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
