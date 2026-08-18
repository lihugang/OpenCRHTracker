import ApiRequestError from '~/server/utils/api/errors/ApiRequestError';
import getCurrentDateString from '~/server/utils/date/getCurrentDateString';
import {
    serviceDayToShanghaiDayStartUnixSeconds,
    serviceDateToDay,
    type ServiceDay
} from '~/server/utils/date/serviceDay';
import { SHANGHAI_DAY_SECONDS } from '~/server/utils/date/shanghaiDateTime';
import {
    deleteDailyRouteById,
    getDailyRecordById,
    insertDailyEmuRouteWithIdentity,
    listDailyRoutesByEmuCodeInRange,
    listDailyRoutesByTrainCodeInRange,
    type DailyEmuRouteRow
} from '~/server/services/emuRoutesStore';
import { getHistoricalTimetableSummary } from '~/server/services/historicalTimetableResolver';
import {
    listLatestTimetableHistoryCoveragesByTrainCodeAtOrBeforeDate,
    type TimetableHistoryCoverageRow
} from '~/server/services/timetableHistoryStore';
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
import { deleteProbeUntrustedRecordsByTrainCodeAndEmuCodeAtServiceDate } from '~/server/services/probeUntrustedRecordStore';
import {
    EMU_ROUTE_STATUS_CONFIRMED_COUPLED_I,
    EMU_ROUTE_STATUS_CONFIRMED_COUPLED_II,
    EMU_ROUTE_STATUS_CONFIRMED_SINGLE,
    EMU_ROUTE_STATUS_FAULT,
    EMU_ROUTE_STATUS_HOT_SPARE,
    EMU_ROUTE_STATUS_UNCONFIRMED_SINGLE
} from '~/server/utils/emuRouteStatus';
import { getTodayScheduleProbeGroupByTrainCode } from '~/server/services/todayScheduleCache';
import { type TrainCodeParts } from '~/server/utils/12306/trainCode';
import type { EmuId } from '~/server/libs/database/emu';
import parseEmuCode from '~/server/utils/12306/parseEmuCode';
import {
    formatExternalEmuCode,
    formatExternalServiceDate,
    formatExternalTrainCode
} from '~/server/utils/internal/boundaries';
import type {
    AdminDailyRouteCreateResponse,
    AdminDailyRouteDeleteResponse,
    AdminDailyRouteRecord,
    AdminDailyRouteSearchResponse,
    AdminDailyRouteTimetableCandidate,
    AdminDailyRouteTimetableCandidatesResponse
} from '~/types/admin';

const TIMETABLE_CANDIDATE_LIMIT = 12;
const DAY_SECONDS = 24 * 60 * 60;
const ADMIN_DAILY_ROUTE_STATUSES = new Set([
    EMU_ROUTE_STATUS_UNCONFIRMED_SINGLE,
    EMU_ROUTE_STATUS_CONFIRMED_SINGLE,
    EMU_ROUTE_STATUS_CONFIRMED_COUPLED_I,
    EMU_ROUTE_STATUS_CONFIRMED_COUPLED_II,
    EMU_ROUTE_STATUS_CONFIRMED_SINGLE | EMU_ROUTE_STATUS_FAULT,
    EMU_ROUTE_STATUS_CONFIRMED_COUPLED_I | EMU_ROUTE_STATUS_FAULT,
    EMU_ROUTE_STATUS_CONFIRMED_COUPLED_II | EMU_ROUTE_STATUS_FAULT,
    EMU_ROUTE_STATUS_CONFIRMED_SINGLE | EMU_ROUTE_STATUS_HOT_SPARE,
    EMU_ROUTE_STATUS_CONFIRMED_COUPLED_I | EMU_ROUTE_STATUS_HOT_SPARE,
    EMU_ROUTE_STATUS_CONFIRMED_COUPLED_II | EMU_ROUTE_STATUS_HOT_SPARE
]);

function toAdminDailyRouteRecord(row: DailyEmuRouteRow): AdminDailyRouteRecord {
    return {
        id: String(row.id),
        serviceDate: formatExternalServiceDate(row.service_date),
        trainCode: formatExternalTrainCode(row.train_code),
        emuCode: formatExternalEmuCode(row.emu_id),
        timetableId: row.timetable_id,
        startStation: row.start_station_name,
        endStation: row.end_station_name,
        startAt: row.start_at,
        endAt: row.end_at,
        status: row.status
    };
}

function sortDailyRouteRows(left: DailyEmuRouteRow, right: DailyEmuRouteRow) {
    if (left.start_at !== right.start_at) {
        return left.start_at - right.start_at;
    }

    const leftTrainCode = formatExternalTrainCode(left.train_code);
    const rightTrainCode = formatExternalTrainCode(right.train_code);
    if (leftTrainCode !== rightTrainCode) {
        return leftTrainCode.localeCompare(rightTrainCode, 'zh-Hans-CN');
    }

    const leftEmuCode = formatExternalEmuCode(left.emu_id);
    const rightEmuCode = formatExternalEmuCode(right.emu_id);
    if (leftEmuCode !== rightEmuCode) {
        return leftEmuCode.localeCompare(rightEmuCode, 'zh-Hans-CN');
    }

    return left.id - right.id;
}

function dedupeDailyRouteRows(rows: DailyEmuRouteRow[]) {
    const seenIds = new Set<number>();
    const deduped: DailyEmuRouteRow[] = [];

    for (const row of rows) {
        if (seenIds.has(row.id)) {
            continue;
        }

        seenIds.add(row.id);
        deduped.push(row);
    }

    return deduped;
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

function getDayRange(serviceDate: ServiceDay) {
    const startAt = serviceDayToShanghaiDayStartUnixSeconds(serviceDate);
    return {
        startAt,
        endAtExclusive: startAt + DAY_SECONDS
    };
}

function resolveRowsForQuery(
    serviceDate: ServiceDay,
    trainCode: TrainCodeParts | null,
    emuId: EmuId | null
) {
    const dayRange = getDayRange(serviceDate);

    if (!trainCode && !emuId) {
        throw new ApiRequestError(
            400,
            'invalid_param',
            'trainCode 与 emuCode 至少填写一个'
        );
    }

    if (trainCode && emuId) {
        return listDailyRoutesByTrainCodeInRange(
            trainCode,
            dayRange.startAt,
            dayRange.endAtExclusive
        )
            .filter((row) => Number(row.emu_id) === Number(emuId))
            .sort(sortDailyRouteRows);
    }

    const rows = trainCode
        ? listDailyRoutesByTrainCodeInRange(
              trainCode,
              dayRange.startAt,
              dayRange.endAtExclusive
          )
        : listDailyRoutesByEmuCodeInRange(
              emuId!,
              dayRange.startAt,
              dayRange.endAtExclusive
          );

    return dedupeDailyRouteRows(rows).sort(sortDailyRouteRows);
}

function getCoverageResolution(
    coverage: TimetableHistoryCoverageRow,
    serviceDate: ServiceDay
) {
    return coverage.service_date_start <= serviceDate &&
        coverage.service_date_end_exclusive > serviceDate
        ? 'exact'
        : 'latest_fallback';
}

function buildCandidateFromCoverage(
    coverage: TimetableHistoryCoverageRow,
    serviceDate: ServiceDay,
    isDefault: boolean
): AdminDailyRouteTimetableCandidate | null {
    const summary = getHistoricalTimetableSummary(coverage.content_id);
    if (!summary) {
        return null;
    }

    const dayStartAt = serviceDayToShanghaiDayStartUnixSeconds(serviceDate);
    return {
        timetableId: coverage.content_id,
        serviceDateStart: formatExternalServiceDate(
            coverage.service_date_start
        ),
        serviceDateEndExclusive: formatExternalServiceDate(
            coverage.service_date_end_exclusive
        ),
        startStation: summary.startStation ?? '',
        endStation: summary.endStation ?? '',
        startAt:
            summary.startOffset === null ? 0 : dayStartAt + summary.startOffset,
        endAt:
            summary.endOffset === null
                ? 0
                : dayStartAt +
                  summary.endOffset +
                  (summary.endOffset < (summary.startOffset ?? 0)
                      ? SHANGHAI_DAY_SECONDS
                      : 0),
        resolution: getCoverageResolution(coverage, serviceDate),
        isDefault
    };
}

function buildUnresolvedCandidate(
    serviceDate: ServiceDay,
    isDefault: boolean
): AdminDailyRouteTimetableCandidate {
    const date = formatExternalServiceDate(serviceDate);
    return {
        timetableId: null,
        serviceDateStart: date,
        serviceDateEndExclusive: date,
        startStation: '',
        endStation: '',
        startAt: 0,
        endAt: 0,
        resolution: 'unresolved',
        isDefault
    };
}

export function searchAdminDailyRoutes(
    serviceDate: ServiceDay,
    trainCode: TrainCodeParts | null,
    emuId: EmuId | null
): AdminDailyRouteSearchResponse {
    const items = resolveRowsForQuery(serviceDate, trainCode, emuId).map(
        toAdminDailyRouteRecord
    );

    return {
        date: formatExternalServiceDate(serviceDate),
        trainCode: trainCode ? formatExternalTrainCode(trainCode) : '',
        emuCode: emuId ? formatExternalEmuCode(emuId) : '',
        total: items.length,
        items
    };
}

export function listAdminDailyRouteTimetableCandidates(
    serviceDate: ServiceDay,
    trainCode: TrainCodeParts
): AdminDailyRouteTimetableCandidatesResponse {
    const coverages =
        listLatestTimetableHistoryCoveragesByTrainCodeAtOrBeforeDate(
            trainCode,
            serviceDate,
            TIMETABLE_CANDIDATE_LIMIT
        );

    const candidates = coverages
        .map((coverage) =>
            buildCandidateFromCoverage(coverage, serviceDate, false)
        )
        .filter((item): item is AdminDailyRouteTimetableCandidate =>
            Boolean(item)
        );

    if (candidates[0]) {
        candidates[0].isDefault = true;
    }

    if (candidates.length === 0) {
        candidates.push(buildUnresolvedCandidate(serviceDate, true));
    }

    const defaultCandidate = candidates.find((item) => item.isDefault) ?? null;
    return {
        date: formatExternalServiceDate(serviceDate),
        trainCode: formatExternalTrainCode(trainCode),
        defaultTimetableId: defaultCandidate?.timetableId ?? null,
        items: candidates
    };
}

export function createAdminDailyRoute(
    serviceDate: ServiceDay,
    trainCode: TrainCodeParts,
    emuId: EmuId,
    timetableId: number | null,
    status: number
): AdminDailyRouteCreateResponse {
    if (
        timetableId !== null &&
        (!Number.isInteger(timetableId) || timetableId <= 0)
    ) {
        throw new ApiRequestError(
            400,
            'invalid_param',
            'timetableId 必须是正整数或 null'
        );
    }

    if (!Number.isInteger(status) || !ADMIN_DAILY_ROUTE_STATUSES.has(status)) {
        throw new ApiRequestError(
            400,
            'invalid_param',
            'status 不是数据维护功能支持的记录状态'
        );
    }

    const candidates = listAdminDailyRouteTimetableCandidates(
        serviceDate,
        trainCode
    );
    const matchingCandidate = candidates.items.find(
        (item) => item.timetableId === timetableId
    );
    if (!matchingCandidate) {
        throw new ApiRequestError(
            400,
            'invalid_param',
            'timetableId 不属于该车次在所选日期前的可用时刻表'
        );
    }

    const insertedId = insertDailyEmuRouteWithIdentity(
        trainCode,
        emuId,
        serviceDate,
        timetableId,
        status
    );
    const createdRecord =
        insertedId > 0 ? getDailyRecordById(insertedId) : null;

    return {
        date: formatExternalServiceDate(serviceDate),
        trainCode: formatExternalTrainCode(trainCode),
        emuCode: formatExternalEmuCode(emuId),
        timetableId,
        createdRecord: createdRecord
            ? toAdminDailyRouteRecord(createdRecord)
            : null,
        inserted: Boolean(createdRecord)
    };
}

export async function deleteAdminDailyRoute(
    routeId: string
): Promise<AdminDailyRouteDeleteResponse> {
    const numericRouteId = Number(routeId);
    if (!Number.isInteger(numericRouteId) || numericRouteId <= 0) {
        throw new ApiRequestError(400, 'invalid_param', 'routeId 必须是正整数');
    }

    const route = getDailyRecordById(numericRouteId);
    if (!route) {
        throw new ApiRequestError(404, 'not_found', '日记录不存在');
    }

    const deletedDailyRouteRows = deleteDailyRouteById(numericRouteId);
    if (deletedDailyRouteRows <= 0) {
        throw new ApiRequestError(409, 'conflict', '日记录删除失败');
    }

    const today = serviceDateToDay(getCurrentDateString());
    const wasToday = route.service_date === today;
    let clearedRuntimeTrainKey = false;
    let clearedRuntimeEmuIds: EmuId[] = [];
    let clearedDetectionGroups = 0;

    if (wasToday) {
        deleteProbeUntrustedRecordsByTrainCodeAndEmuCodeAtServiceDate(
            route.train_code,
            route.emu_id,
            route.service_date
        );

        const trainGroup = getTodayScheduleProbeGroupByTrainCode(
            route.train_code
        );
        const trainKey =
            trainGroup?.trainKey ??
            buildTrainKey(route.train_code, null, route.start_at);

        clearedRuntimeTrainKey = hasQueriedTrainKey(trainKey);
        clearQueriedTrainKey(trainKey);

        const affectedEmuIds = new Set<EmuId>([route.emu_id]);
        clearedRuntimeEmuIds = clearRunningEmuStateByTrainKey(trainKey);
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
        date: formatExternalServiceDate(route.service_date),
        routeId,
        wasToday,
        deletedDailyRoute: true,
        clearedRuntimeTrainKey,
        clearedRuntimeEmuCodes: clearedRuntimeEmuIds.map(formatExternalEmuCode),
        clearedDetectionGroups
    };
}
