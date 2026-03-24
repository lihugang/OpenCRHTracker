import ApiRequestError from '~/server/utils/api/errors/ApiRequestError';
import getCurrentDateString from '~/server/utils/date/getCurrentDateString';
import getDayTimestampRange from '~/server/utils/date/getDayTimestampRange';
import {
    deleteDailyRouteById,
    getDailyRecordById
} from '~/server/services/emuRoutesStore';
import {
    buildProbeAssetKey,
    loadProbeAssets
} from '~/server/services/probeAssetStore';
import { clearRecentCoupledGroupDetection } from '~/server/services/probeDetectionState';
import {
    buildTrainKey,
    clearQueriedTrainKey,
    clearRunningEmuStateByTrainKey,
    hasQueriedTrainKey
} from '~/server/services/probeRuntimeState';
import { deleteProbeStatusByTrainCodeAndEmuCodeAtStartAt } from '~/server/services/probeStatusStore';
import { getTodayScheduleProbeGroupByTrainCode } from '~/server/services/todayScheduleCache';
import type { AdminAnomalyDeleteRouteResponse } from '~/types/admin';
import parseEmuCode from '~/server/utils/12306/parseEmuCode';

function collectDetectionGroupsFromEmuCodes(
    emuCodes: string[],
    assets: Awaited<ReturnType<typeof loadProbeAssets>>
) {
    const detectionGroups = new Map<
        string,
        { bureau: string; model: string }
    >();

    for (const emuCode of emuCodes) {
        const parsedEmuCode = parseEmuCode(emuCode);
        if (!parsedEmuCode?.trainSetNo) {
            continue;
        }

        const record = assets.emuByModelAndTrainSetNo.get(
            buildProbeAssetKey(parsedEmuCode.model, parsedEmuCode.trainSetNo)
        );
        if (!record) {
            continue;
        }

        const detectionKey = `${record.bureau}#${record.model}`;
        if (!detectionGroups.has(detectionKey)) {
            detectionGroups.set(detectionKey, {
                bureau: record.bureau,
                model: record.model
            });
        }
    }

    return Array.from(detectionGroups.values());
}

export async function deleteAnomalyRoute(
    date: string,
    routeId: string
): Promise<AdminAnomalyDeleteRouteResponse> {
    const numericRouteId = Number(routeId);
    if (!Number.isInteger(numericRouteId) || numericRouteId <= 0) {
        throw new ApiRequestError(400, 'invalid_param', 'routeId 必须是正整数');
    }

    const route = getDailyRecordById(numericRouteId);
    if (!route) {
        throw new ApiRequestError(404, 'not_found', '异常交路不存在');
    }

    const dayRange = getDayTimestampRange(date);
    if (route.start_at < dayRange.startAt || route.start_at > dayRange.endAt) {
        throw new ApiRequestError(400, 'invalid_param', '该交路不属于所选日期');
    }

    const deletedDailyRouteRows = deleteDailyRouteById(numericRouteId);
    if (deletedDailyRouteRows <= 0) {
        throw new ApiRequestError(409, 'conflict', '异常交路删除失败');
    }

    const deletedProbeStatusRows =
        deleteProbeStatusByTrainCodeAndEmuCodeAtStartAt(
            route.train_code,
            route.emu_code,
            route.start_at
        );

    const wasToday = date === getCurrentDateString();
    let clearedRuntimeTrainKey = false;
    let clearedRuntimeEmuCodes: string[] = [];
    let clearedDetectionGroups = 0;

    if (wasToday) {
        const trainGroup = getTodayScheduleProbeGroupByTrainCode(
            route.train_code
        ) ?? {
            trainKey: buildTrainKey(route.train_code, '', route.start_at)
        };
        const trainKey = trainGroup.trainKey;

        clearedRuntimeTrainKey = hasQueriedTrainKey(trainKey);
        clearQueriedTrainKey(trainKey);

        const affectedEmuCodes = new Set<string>([route.emu_code]);
        clearedRuntimeEmuCodes = clearRunningEmuStateByTrainKey(trainKey);
        for (const emuCode of clearedRuntimeEmuCodes) {
            affectedEmuCodes.add(emuCode);
        }

        const assets = await loadProbeAssets();
        const detectionGroups = collectDetectionGroupsFromEmuCodes(
            Array.from(affectedEmuCodes),
            assets
        );
        for (const detectionGroup of detectionGroups) {
            clearRecentCoupledGroupDetection(
                detectionGroup.bureau,
                detectionGroup.model
            );
        }
        clearedDetectionGroups = detectionGroups.length;
    }

    return {
        date,
        routeId,
        wasToday,
        deletedDailyRoute: true,
        deletedProbeStatusRows,
        clearedRuntimeTrainKey,
        clearedRuntimeEmuCodes,
        clearedDetectionGroups
    };
}
