import getLogger from '~/server/libs/log4js';
import { listLatestDailyRoutesByTrainCode } from '~/server/services/emuRoutesStore';
import { getTodayScheduleProbeGroups } from '~/server/services/todayScheduleCache';
import normalizeCode from '~/server/utils/12306/normalizeCode';
import uniqueNormalizedCodes from '~/server/utils/12306/uniqueNormalizedCodes';
import getCurrentDateString from '~/server/utils/date/getCurrentDateString';

interface HistoricalRecentTrainEmuIndexCache {
    currentDate: string;
    scheduleFingerprint: string;
    trainToEmuCodes: Map<string, string[]>;
}

const logger = getLogger('historical-recent-train-emu-index');
const LATEST_RECORD_LIMIT = 4;

let cached: HistoricalRecentTrainEmuIndexCache | null = null;

function collectCurrentScheduleTrainCodes() {
    const trainCodes = new Set<string>();

    for (const group of getTodayScheduleProbeGroups().values()) {
        for (const trainCode of uniqueNormalizedCodes([
            group.trainCode,
            ...group.allCodes
        ])) {
            trainCodes.add(trainCode);
        }
    }

    return Array.from(trainCodes.values()).sort((left, right) =>
        left.localeCompare(right)
    );
}

function buildScheduleFingerprint(trainCodes: string[]) {
    return trainCodes.join('|');
}

function rebuildCache(): HistoricalRecentTrainEmuIndexCache {
    const currentDate = getCurrentDateString();
    const trainCodes = collectCurrentScheduleTrainCodes();
    const scheduleFingerprint = buildScheduleFingerprint(trainCodes);
    const trainToEmuCodes = new Map<string, string[]>();

    for (const trainCode of trainCodes) {
        const latestRows = listLatestDailyRoutesByTrainCode(
            trainCode,
            LATEST_RECORD_LIMIT
        );
        const emuCodes = uniqueNormalizedCodes(
            latestRows
                .map((row) => normalizeCode(row.emu_code))
                .filter((emuCode) => emuCode.length > 0)
        );

        if (emuCodes.length > 0) {
            trainToEmuCodes.set(trainCode, emuCodes);
        }
    }

    const nextCache: HistoricalRecentTrainEmuIndexCache = {
        currentDate,
        scheduleFingerprint,
        trainToEmuCodes
    };

    cached = nextCache;
    logger.info(
        `rebuilt currentDate=${currentDate} trainCodes=${trainCodes.length} matchedTrainCodes=${trainToEmuCodes.size} latestRecordLimit=${LATEST_RECORD_LIMIT}`
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
    trainCode: string
): string[] {
    const normalizedTrainCode = normalizeCode(trainCode);
    if (normalizedTrainCode.length === 0) {
        return [];
    }

    return getActiveCache().trainToEmuCodes.get(normalizedTrainCode) ?? [];
}
