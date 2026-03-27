import getLogger from '~/server/libs/log4js';
import { listDailyRecordsAll } from '~/server/services/emuRoutesStore';
import normalizeCode from '~/server/utils/12306/normalizeCode';
import getCurrentDateString from '~/server/utils/date/getCurrentDateString';
import { getShanghaiDayStartUnixSeconds } from '~/server/utils/date/shanghaiDateTime';

interface HistoricalRecentTrainEmuIndexCache {
    currentDate: string;
    trainToEmuCodes: Map<string, string[]>;
}

const logger = getLogger('historical-recent-train-emu-index');

let cached: HistoricalRecentTrainEmuIndexCache | null = null;

function rebuildCache(): HistoricalRecentTrainEmuIndexCache {
    const currentDate = getCurrentDateString();
    const currentDayStart = getShanghaiDayStartUnixSeconds(currentDate);
    const historicalRecentStart = currentDayStart - 2 * 24 * 60 * 60;
    const historicalRecentEnd = currentDayStart - 1;
    const trainToEmuSet = new Map<string, Set<string>>();

    for (
        const row of listDailyRecordsAll(
            historicalRecentStart,
            historicalRecentEnd
        )
    ) {
        const trainCode = normalizeCode(row.train_code);
        const emuCode = normalizeCode(row.emu_code);
        if (trainCode.length === 0 || emuCode.length === 0) {
            continue;
        }

        const existing = trainToEmuSet.get(trainCode);
        if (existing) {
            existing.add(emuCode);
            continue;
        }

        trainToEmuSet.set(trainCode, new Set([emuCode]));
    }

    const nextCache: HistoricalRecentTrainEmuIndexCache = {
        currentDate,
        trainToEmuCodes: new Map(
            Array.from(trainToEmuSet.entries(), ([trainCode, emuCodes]) => [
                trainCode,
                Array.from(emuCodes.values())
            ])
        )
    };

    cached = nextCache;
    logger.info(
        `rebuilt currentDate=${currentDate} historicalRecentStart=${historicalRecentStart} historicalRecentEnd=${historicalRecentEnd} trainCodes=${nextCache.trainToEmuCodes.size}`
    );
    return nextCache;
}

function getActiveCache(): HistoricalRecentTrainEmuIndexCache {
    const currentDate = getCurrentDateString();
    if (cached && cached.currentDate === currentDate) {
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
