import type { SupplementTrainEntry } from '~/server/services/supplementTrainRegistryStore';
import parseTimeAsTimestamp from '~/server/utils/date/parseTimeAsTimestamp';
import {
    formatTrainCode,
    trainCodeKey,
    type TrainCodeParts
} from '~/server/utils/12306/trainCode';
import { sortScheduleItems } from './filterAndSort';
import type {
    ScheduleItem,
    ScheduleProbePrefixRule,
    ScheduleState,
    ScheduleStop
} from './types';

export interface MergeSupplementTrainItemsResult {
    addedItems: number;
    skippedCollisions: number;
}

function listUniqueTrainCodes(
    trainCode: TrainCodeParts,
    aliases: readonly TrainCodeParts[]
) {
    const seen = new Set<string>();
    const codes: TrainCodeParts[] = [];

    for (const code of [trainCode, ...aliases]) {
        const key = trainCodeKey(code);
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        codes.push(code);
    }

    return codes;
}

function toScheduleItem(entry: SupplementTrainEntry): ScheduleItem {
    const stops = [...entry.stops].sort(
        (left, right) => left.stationNo - right.stationNo
    );
    const firstStop = stops[0]!;
    const lastStop = stops[stops.length - 1]!;
    const allCodes = listUniqueTrainCodes(entry.trainCode, entry.aliases);
    const scheduleStops: ScheduleStop[] = stops.map((stop, index) => ({
        stationNo: stop.stationNo,
        stationName: stop.stationName,
        stationTelecode: '',
        arriveAt: parseTimeAsTimestamp(stop.arriveAt),
        departAt: parseTimeAsTimestamp(stop.departAt),
        stationTrainCode: entry.trainCode,
        wicket: stop.wicket ?? '',
        distance: stop.distance,
        platformNo: stop.platformNo,
        isStart: index === 0,
        isEnd: index === stops.length - 1
    }));

    return {
        code: entry.trainCode,
        internalCode: `supplement_trains_${formatTrainCode(entry.trainCode)}`,
        allCodes,
        bureauCode: entry.bureauCode,
        trainStyle: entry.trainStyle,
        trainDepartment: entry.trainDepartment,
        passengerDepartment: entry.passengerDepartment,
        startStation: firstStop.stationName,
        endStation: lastStop.stationName,
        startAt: parseTimeAsTimestamp(firstStop.departAt),
        endAt: parseTimeAsTimestamp(lastStop.arriveAt),
        lastRouteRefreshAt: null,
        stops: scheduleStops
    };
}

export function mergeSupplementTrainItems(
    state: ScheduleState,
    entries: readonly SupplementTrainEntry[],
    prefixRules: readonly ScheduleProbePrefixRule[]
): MergeSupplementTrainItemsResult {
    const occupiedCodes = new Set<string>();
    for (const item of state.items) {
        for (const code of listUniqueTrainCodes(item.code, item.allCodes)) {
            occupiedCodes.add(trainCodeKey(code));
        }
    }

    const supplementItems: ScheduleItem[] = [];
    let skippedCollisions = 0;

    for (const entry of entries) {
        const codes = listUniqueTrainCodes(entry.trainCode, entry.aliases);
        if (codes.some((code) => occupiedCodes.has(trainCodeKey(code)))) {
            skippedCollisions += 1;
            continue;
        }

        const item = toScheduleItem(entry);
        supplementItems.push(item);
        for (const code of codes) {
            occupiedCodes.add(trainCodeKey(code));
        }
    }

    state.items = sortScheduleItems(
        [...state.items, ...supplementItems],
        [...prefixRules]
    );
    state.stats.uniqueItems = state.items.length;

    return {
        addedItems: supplementItems.length,
        skippedCollisions
    };
}
