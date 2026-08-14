import ApiRequestError from '~/server/utils/api/errors/ApiRequestError';
import getCurrentDateString from '~/server/utils/date/getCurrentDateString';
import {
    serviceDateToDay,
    serviceDayToShanghaiDayStartUnixSeconds,
    type ServiceDay
} from '~/server/utils/date/serviceDay';
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
import type { EmuId } from '~/server/libs/database/emu';
import {
    formatExternalEmuCode,
    formatExternalServiceDate
} from '~/server/utils/internal/boundaries';

const ADMIN_ANOMALY_TYPES: readonly AdminAnomalyType[] = [
    'train_multi_emu',
    'train_coupled_model_mismatch',
    'train_non_multiple_coupled',
    'emu_single_short_route'
];
const DAY_SECONDS = 24 * 60 * 60;

interface DeleteDailyRouteResult {
    deletedDailyRoute: boolean;
    deletedProbeStatusRows: number;
    route: NonNullable<ReturnType<typeof getDailyRecordById>> | null;
}

function collectDetectionGroupsFromEmuIds(
    emuIds: EmuId[],
    assets: Awaited<ReturnType<typeof loadProbeAssets>>
) {
    const detectionGroups = new Map<
        string,
        { bureau: string; model: string }
    >();

    for (const emuId of emuIds) {
        const emuCode = formatExternalEmuCode(emuId);
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
    serviceDate: ServiceDay
) {
    const dayStartAt = serviceDayToShanghaiDayStartUnixSeconds(serviceDate);
    return (
        route.start_at >= dayStartAt &&
        route.start_at <= dayStartAt + DAY_SECONDS - 1
    );
}

function assertRouteBelongsToDate(
    route: NonNullable<ReturnType<typeof getDailyRecordById>>,
    serviceDate: ServiceDay
) {
    if (!doesRouteBelongToDate(route, serviceDate)) {
        throw new ApiRequestError(400, 'invalid_param', '该交路不属于所选日期');
    }
}

function deleteDailyRouteAndProbeStatus(
    serviceDate: ServiceDay,
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

    if (!doesRouteBelongToDate(route, serviceDate)) {
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
            route.emu_id,
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
    serviceDate: ServiceDay,
    routeId: string
): Promise<AdminAnomalyDeleteRouteResponse> {
    const numericRouteId = normalizeRouteId(routeId);

    const deleteResult = deleteDailyRouteAndProbeStatus(
        serviceDate,
        numericRouteId,
        true
    );

    const wasToday = serviceDate === serviceDateToDay(getCurrentDateString());
    let clearedRuntimeTrainKey = false;
    let clearedRuntimeEmuIds: EmuId[] = [];
    let clearedDetectionGroups = 0;

    if (wasToday) {
        const route = deleteResult.route;
        const trainKey = route
            ? (getTodayScheduleProbeGroupByTrainCode(route.train_code)
                  ?.trainKey ??
              buildTrainKey(route.train_code, null, route.start_at))
            : '';

        if (trainKey.length > 0) {
            clearedRuntimeTrainKey = hasQueriedTrainKey(trainKey);
            clearQueriedTrainKey(trainKey);
        }

        const affectedEmuIds = new Set<EmuId>(route ? [route.emu_id] : []);
        clearedRuntimeEmuIds = route
            ? clearRunningEmuStateByTrainKey(trainKey)
            : [];
        for (const emuId of clearedRuntimeEmuIds) {
            affectedEmuIds.add(emuId);
        }

        const assets = await loadProbeAssets();
        const detectionGroups = collectDetectionGroupsFromEmuIds(
            Array.from(affectedEmuIds),
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
        date: formatExternalServiceDate(serviceDate),
        routeId,
        wasToday,
        deletedDailyRoute: true,
        deletedProbeStatusRows: deleteResult.deletedProbeStatusRows,
        clearedRuntimeTrainKey,
        clearedRuntimeEmuCodes: clearedRuntimeEmuIds.map(formatExternalEmuCode),
        clearedDetectionGroups
    };
}

export async function deleteAnomalyRoutesByType(
    serviceDate: ServiceDay,
    type: string
): Promise<AdminAnomalyBulkDeleteResponse> {
    ensureAdminAnomalyType(type);

    if (serviceDate === serviceDateToDay(getCurrentDateString())) {
        throw new ApiRequestError(
            400,
            'invalid_param',
            '只允许删除非今日异常数据'
        );
    }

    const scanResult = await scanDailyAnomalies(serviceDate);
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
            const result = deleteDailyRouteAndProbeStatus(
                serviceDate,
                routeId,
                false
            );

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
        date: formatExternalServiceDate(serviceDate),
        type,
        wasToday: false,
        matchedItems: matchedItems.length,
        matchedRoutes: routeIds.length,
        deletedDailyRoutes,
        deletedProbeStatusRows,
        skippedRoutes
    };
}
