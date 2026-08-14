import getLogger from '~/server/libs/log4js';
import { listLatestDailyRoutesByTrainCode } from '~/server/services/emuRoutesStore';
import { getTodayScheduleProbeGroups } from '~/server/services/todayScheduleCache';
import {
    trainCodeKey,
    type TrainCodeParts
} from '~/server/utils/12306/trainCode';
import type { EmuId } from '~/server/libs/database/emu';
import getCurrentDateString from '~/server/utils/date/getCurrentDateString';

interface HistoricalRecentTrainEmuIndexCache {
    currentDate: string;
    scheduleFingerprint: string;
    trainToEmuIds: Map<string, EmuId[]>;
}

const logger = getLogger('historical-recent-train-emu-index');
const LATEST_RECORD_LIMIT = 2;

let cached: HistoricalRecentTrainEmuIndexCache | null = null;

function collectCurrentScheduleTrainCodes(): TrainCodeParts[] {
    const seen = new Set<string>();
    const trainCodes: TrainCodeParts[] = [];

    for (const group of getTodayScheduleProbeGroups().values()) {
        for (const trainCode of [group.trainCode, ...group.allCodes]) {
            const key = trainCodeKey(trainCode);
            if (seen.has(key)) {
                continue;
            }
            seen.add(key);
            trainCodes.push(trainCode);
        }
    }

    return trainCodes.sort((left, right) =>
        trainCodeKey(left).localeCompare(trainCodeKey(right))
    );
}

function buildScheduleFingerprint(trainCodes: TrainCodeParts[]) {
    return trainCodes.map(trainCodeKey).join('|');
}

function rebuildCache(): HistoricalRecentTrainEmuIndexCache {
    const currentDate = getCurrentDateString();
    const trainCodes = collectCurrentScheduleTrainCodes();
    const scheduleFingerprint = buildScheduleFingerprint(trainCodes);
    const trainToEmuIds = new Map<string, EmuId[]>();

    for (const trainCode of trainCodes) {
        const latestRows = listLatestDailyRoutesByTrainCode(
            trainCode,
            LATEST_RECORD_LIMIT
        );
        const seenEmuIds = new Set<number>();
        const emuIds: EmuId[] = [];
        for (const row of latestRows) {
            const emuId = Number(row.emu_id);
            if (seenEmuIds.has(emuId)) {
                continue;
            }
            seenEmuIds.add(emuId);
            emuIds.push(row.emu_id);
        }

        if (emuIds.length > 0) {
            trainToEmuIds.set(trainCodeKey(trainCode), emuIds);
        }
    }

    const nextCache: HistoricalRecentTrainEmuIndexCache = {
        currentDate,
        scheduleFingerprint,
        trainToEmuIds
    };

    cached = nextCache;
    logger.info(
        `rebuilt currentDate=${currentDate} trainCodes=${trainCodes.length} matchedTrainCodes=${trainToEmuIds.size} latestRecordLimit=${LATEST_RECORD_LIMIT}`
    );
    return nextCache;
}

function getActiveCache(): HistoricalRecentTrainEmuIndexCache {
    const currentDate = getCurrentDateString();
    const trainCodes = collectCurrentScheduleTrainCodes();
    const scheduleFingerprint = buildScheduleFingerprint(trainCodes);

    if (
        cached &&
        cached.currentDate === currentDate &&
        cached.scheduleFingerprint === scheduleFingerprint
    ) {
        return cached;
    }

    return rebuildCache();
}

export function warmHistoricalRecentTrainEmuIndex(): void {
    rebuildCache();
}

export function getHistoricalRecentEmuCodesByTrainCode(
    trainCode: TrainCodeParts
): EmuId[] {
    return getActiveCache().trainToEmuIds.get(trainCodeKey(trainCode)) ?? [];
}
