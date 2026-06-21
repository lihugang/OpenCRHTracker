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
import { useEmuDatabase } from '~/server/libs/database/emu';
import { scanDailyAnomalies } from '~/server/services/adminAnomalyStore';
import type {
    AdminAnomalyBulkDeleteResponse,
    AdminAnomalyDeleteRouteResponse,
    AdminAnomalyType
} from '~/types/admin';
import parseEmuCode from '~/server/utils/12306/parseEmuCode';

const ADMIN_ANOMALY_TYPES: readonly AdminAnomalyType[] = [
    'train_multi_emu',
    'train_coupled_model_mismatch',
    'emu_single_short_route'
];

interface DeleteDailyRouteResult {
    deletedDailyRoute: boolean;
    deletedProbeStatusRows: number;
    route: NonNullable<ReturnType<typeof getDailyRecordById>> | null;
}

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

function ensureAdminAnomalyType(
    type: string
): asserts type is AdminAnomalyType {
    if (!ADMIN_ANOMALY_TYPES.includes(type as AdminAnomalyType)) {
        throw new ApiRequestError(400, 'invalid_param', '异常类型无效');
    }
}

function doesRouteBelongToDate(
    route: NonNullable<ReturnType<typeof getDailyRecordById>>,
    date: string
) {
    const dayRange = getDayTimestampRange(date);
    return (
        route.start_at >= dayRange.startAt && route.start_at <= dayRange.endAt
    );
}

function assertRouteBelongsToDate(
    route: NonNullable<ReturnType<typeof getDailyRecordById>>,
    date: string
) {
    if (!doesRouteBelongToDate(route, date)) {
        throw new ApiRequestError(400, 'invalid_param', '该交路不属于所选日期');
    }
}

function deleteDailyRouteAndProbeStatus(
    date: string,
    numericRouteId: number,
    failWhenMissing: boolean
): DeleteDailyRouteResult {
    const route = getDailyRecordById(numericRouteId);
    if (!route) {
        if (failWhenMissing) {
            throw new ApiRequestError(404, 'not_found', '异常交路不存在');
        }

        return {
            deletedDailyRoute: false,
            deletedProbeStatusRows: 0,
            route: null
        };
    }

    if (!doesRouteBelongToDate(route, date)) {
        if (failWhenMissing) {
            throw new ApiRequestError(
                400,
                'invalid_param',
                '该交路不属于所选日期'
            );
        }

        return {
            deletedDailyRoute: false,
            deletedProbeStatusRows: 0,
            route
        };
    }

    const deletedDailyRouteRows = deleteDailyRouteById(numericRouteId);
    if (deletedDailyRouteRows <= 0) {
        if (failWhenMissing) {
            throw new ApiRequestError(409, 'conflict', '异常交路删除失败');
        }

        return {
            deletedDailyRoute: false,
            deletedProbeStatusRows: 0,
            route
        };
    }

    const deletedProbeStatusRows =
        deleteProbeStatusByTrainCodeAndEmuCodeAtStartAt(
            route.train_code,
            route.emu_code,
            route.start_at
        );

    return {
        deletedDailyRoute: true,
        deletedProbeStatusRows,
        route
    };
}

function normalizeRouteId(routeId: string) {
    const numericRouteId = Number(routeId);
    if (!Number.isInteger(numericRouteId) || numericRouteId <= 0) {
        throw new ApiRequestError(400, 'invalid_param', 'routeId 必须是正整数');
    }

    return numericRouteId;
}

export async function deleteAnomalyRoute(
    date: string,
    routeId: string
): Promise<AdminAnomalyDeleteRouteResponse> {
    const numericRouteId = normalizeRouteId(routeId);

    const deleteResult = deleteDailyRouteAndProbeStatus(
        date,
        numericRouteId,
        true
    );

    const wasToday = date === getCurrentDateString();
    let clearedRuntimeTrainKey = false;
    let clearedRuntimeEmuCodes: string[] = [];
    let clearedDetectionGroups = 0;

    if (wasToday) {
        const route = deleteResult.route;
        const trainCode = route?.train_code ?? '';
        const emuCode = route?.emu_code ?? '';
        const startAt = route?.start_at ?? 0;
        const trainGroup = getTodayScheduleProbeGroupByTrainCode(trainCode) ?? {
            trainKey: buildTrainKey(trainCode, '', startAt)
        };
        const trainKey = trainGroup.trainKey;

        clearedRuntimeTrainKey = hasQueriedTrainKey(trainKey);
        clearQueriedTrainKey(trainKey);

        const affectedEmuCodes = new Set<string>(emuCode ? [emuCode] : []);
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
        deletedProbeStatusRows: deleteResult.deletedProbeStatusRows,
        clearedRuntimeTrainKey,
        clearedRuntimeEmuCodes,
        clearedDetectionGroups
    };
}

export function deleteAnomalyRoutesByType(
    date: string,
    type: string
): AdminAnomalyBulkDeleteResponse {
    ensureAdminAnomalyType(type);

    if (date === getCurrentDateString()) {
        throw new ApiRequestError(
            400,
            'invalid_param',
            '只允许删除非今日异常数据'
        );
    }

    const scanResult = scanDailyAnomalies(date);
    const matchedItems = scanResult.items.filter((item) => item.type === type);
    const routeIds = Array.from(
        new Set(
            matchedItems
                .flatMap((item) => item.routes)
                .map((route) => Number(route.id))
                .filter((routeId) => Number.isInteger(routeId) && routeId > 0)
        )
    );

    let deletedDailyRoutes = 0;
    let deletedProbeStatusRows = 0;
    let skippedRoutes = 0;

    const deleteTransaction = useEmuDatabase().transaction(() => {
        for (const routeId of routeIds) {
            const result = deleteDailyRouteAndProbeStatus(date, routeId, false);

            if (!result.deletedDailyRoute) {
                skippedRoutes += 1;
                continue;
            }

            deletedDailyRoutes += 1;
            deletedProbeStatusRows += result.deletedProbeStatusRows;
        }
    });

    deleteTransaction();

    return {
        date,
        type,
        wasToday: false,
        matchedItems: matchedItems.length,
        matchedRoutes: routeIds.length,
        deletedDailyRoutes,
        deletedProbeStatusRows,
        skippedRoutes
    };
}
