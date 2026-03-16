import getLogger from '~/server/libs/log4js';
import { listDailyRecordsAll } from '~/server/services/emuRoutesStore';
import normalizeCode from '~/server/utils/12306/normalizeCode';
import getCurrentDateString from '~/server/utils/date/getCurrentDateString';
import { getShanghaiDayStartUnixSeconds } from '~/server/utils/date/shanghaiDateTime';

interface YesterdayTrainEmuIndexCache {
    currentDate: string;
    trainToEmuCodes: Map<string, string[]>;
}

const logger = getLogger('yesterday-train-emu-index');

let cached: YesterdayTrainEmuIndexCache | null = null;

function rebuildCache(): YesterdayTrainEmuIndexCache {
    const currentDate = getCurrentDateString();
    const currentDayStart = getShanghaiDayStartUnixSeconds(currentDate);
    const previousDayStart = currentDayStart - 24 * 60 * 60;
    const previousDayEnd = currentDayStart - 1;
    const trainToEmuSet = new Map<string, Set<string>>();

    for (const row of listDailyRecordsAll(previousDayStart, previousDayEnd)) {
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

    const nextCache: YesterdayTrainEmuIndexCache = {
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
        `rebuilt currentDate=${currentDate} previousDayStart=${previousDayStart} previousDayEnd=${previousDayEnd} trainCodes=${nextCache.trainToEmuCodes.size}`
    );
    return nextCache;
}

function getActiveCache(): YesterdayTrainEmuIndexCache {
    const currentDate = getCurrentDateString();
    if (cached && cached.currentDate === currentDate) {
        return cached;
    }

    return rebuildCache();
}

export function warmYesterdayTrainEmuIndex(): void {
    rebuildCache();
}

export function getYesterdayEmuCodesByTrainCode(trainCode: string): string[] {
    const normalizedTrainCode = normalizeCode(trainCode);
    if (normalizedTrainCode.length === 0) {
        return [];
    }

    return getActiveCache().trainToEmuCodes.get(normalizedTrainCode) ?? [];
}
