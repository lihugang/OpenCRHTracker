import ApiRequestError from '~/server/utils/api/errors/ApiRequestError';
import getCurrentDateString from '~/server/utils/date/getCurrentDateString';
import getDayTimestampRange from '~/server/utils/date/getDayTimestampRange';
import {
    getShanghaiDayStartUnixSeconds,
    SHANGHAI_DAY_SECONDS
} from '~/server/utils/date/shanghaiDateTime';
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
    formatTimetableHistoryServiceDate,
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
import { deleteProbeStatusByTrainCodeAndEmuCodeAtServiceDate } from '~/server/services/probeStatusStore';
import { getTodayScheduleProbeGroupByTrainCode } from '~/server/services/todayScheduleCache';
import normalizeCode from '~/server/utils/12306/normalizeCode';
import parseEmuCode from '~/server/utils/12306/parseEmuCode';
import type {
    AdminDailyRouteCreateResponse,
    AdminDailyRouteDeleteResponse,
    AdminDailyRouteRecord,
    AdminDailyRouteSearchResponse,
    AdminDailyRouteTimetableCandidate,
    AdminDailyRouteTimetableCandidatesResponse
} from '~/types/admin';

const TIMETABLE_CANDIDATE_LIMIT = 12;

function assertServiceDate(date: string) {
    if (!/^\d{8}$/.test(date)) {
        throw new ApiRequestError(400, 'invalid_param', 'date 必须是 YYYYMMDD');
    }
}

function assertCode(value: string, fieldName: string) {
    const normalized = normalizeCode(value);
    if (normalized.length === 0) {
        throw new ApiRequestError(
            400,
            'invalid_param',
            `${fieldName} 不能为空`
        );
    }

    return normalized;
}

function toAdminDailyRouteRecord(row: DailyEmuRouteRow): AdminDailyRouteRecord {
    return {
        id: String(row.id),
        serviceDate: row.service_date,
        trainCode: row.train_code,
        emuCode: row.emu_code,
        timetableId: row.timetable_id,
        startStation: row.start_station_name,
        endStation: row.end_station_name,
        startAt: row.start_at,
        endAt: row.end_at
    };
}

function sortDailyRouteRows(left: DailyEmuRouteRow, right: DailyEmuRouteRow) {
    if (left.start_at !== right.start_at) {
        return left.start_at - right.start_at;
    }

    if (left.train_code !== right.train_code) {
        return left.train_code.localeCompare(right.train_code, 'zh-Hans-CN');
    }

    if (left.emu_code !== right.emu_code) {
        return left.emu_code.localeCompare(right.emu_code, 'zh-Hans-CN');
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

function resolveRowsForQuery(date: string, trainCode: string, emuCode: string) {
    const dayRange = getDayTimestampRange(date);
    const normalizedTrainCode = normalizeCode(trainCode);
    const normalizedEmuCode = normalizeCode(emuCode);

    if (normalizedTrainCode.length === 0 && normalizedEmuCode.length === 0) {
        throw new ApiRequestError(
            400,
            'invalid_param',
            'trainCode 与 emuCode 至少填写一个'
        );
    }

    if (normalizedTrainCode.length > 0 && normalizedEmuCode.length > 0) {
        return listDailyRoutesByTrainCodeInRange(
            normalizedTrainCode,
            dayRange.startAt,
            dayRange.endAt + 1
        )
            .filter((row) => row.emu_code === normalizedEmuCode)
            .sort(sortDailyRouteRows);
    }

    const rows =
        normalizedTrainCode.length > 0
            ? listDailyRoutesByTrainCodeInRange(
                  normalizedTrainCode,
                  dayRange.startAt,
                  dayRange.endAt + 1
              )
            : listDailyRoutesByEmuCodeInRange(
                  normalizedEmuCode,
                  dayRange.startAt,
                  dayRange.endAt + 1
              );

    return dedupeDailyRouteRows(rows).sort(sortDailyRouteRows);
}

function getCoverageResolution(
    coverage: TimetableHistoryCoverageRow,
    serviceDate: number
) {
    return coverage.service_date_start <= serviceDate &&
        coverage.service_date_end_exclusive > serviceDate
        ? 'exact'
        : 'latest_fallback';
}

function buildCandidateFromCoverage(
    coverage: TimetableHistoryCoverageRow,
    date: string,
    isDefault: boolean
): AdminDailyRouteTimetableCandidate | null {
    const summary = getHistoricalTimetableSummary(coverage.content_id);
    if (!summary) {
        return null;
    }

    const dayStartAt = getShanghaiDayStartUnixSeconds(date);
    return {
        timetableId: coverage.content_id,
        serviceDateStart: formatTimetableHistoryServiceDate(
            coverage.service_date_start
        ),
        serviceDateEndExclusive: formatTimetableHistoryServiceDate(
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
        resolution: getCoverageResolution(coverage, Number.parseInt(date, 10)),
        isDefault
    };
}

function buildUnresolvedCandidate(
    date: string,
    isDefault: boolean
): AdminDailyRouteTimetableCandidate {
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
    date: string,
    trainCode: string,
    emuCode: string
): AdminDailyRouteSearchResponse {
    assertServiceDate(date);
    const normalizedTrainCode = normalizeCode(trainCode);
    const normalizedEmuCode = normalizeCode(emuCode);
    const items = resolveRowsForQuery(
        date,
        normalizedTrainCode,
        normalizedEmuCode
    ).map(toAdminDailyRouteRecord);

    return {
        date,
        trainCode: normalizedTrainCode,
        emuCode: normalizedEmuCode,
        total: items.length,
        items
    };
}

export function listAdminDailyRouteTimetableCandidates(
    date: string,
    trainCode: string
): AdminDailyRouteTimetableCandidatesResponse {
    assertServiceDate(date);
    const normalizedTrainCode = assertCode(trainCode, 'trainCode');
    const coverages =
        listLatestTimetableHistoryCoveragesByTrainCodeAtOrBeforeDate(
            normalizedTrainCode,
            date,
            TIMETABLE_CANDIDATE_LIMIT
        );

    const candidates = coverages
        .map((coverage) => buildCandidateFromCoverage(coverage, date, false))
        .filter((item): item is AdminDailyRouteTimetableCandidate =>
            Boolean(item)
        );

    if (candidates[0]) {
        candidates[0].isDefault = true;
    }

    if (candidates.length === 0) {
        candidates.push(buildUnresolvedCandidate(date, true));
    }

    const defaultCandidate = candidates.find((item) => item.isDefault) ?? null;
    return {
        date,
        trainCode: normalizedTrainCode,
        defaultTimetableId: defaultCandidate?.timetableId ?? null,
        items: candidates
    };
}

export function createAdminDailyRoute(
    date: string,
    trainCode: string,
    emuCode: string,
    timetableId: number | null
): AdminDailyRouteCreateResponse {
    assertServiceDate(date);
    const normalizedTrainCode = assertCode(trainCode, 'trainCode');
    const normalizedEmuCode = assertCode(emuCode, 'emuCode');
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

    const candidates = listAdminDailyRouteTimetableCandidates(
        date,
        normalizedTrainCode
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
        normalizedTrainCode,
        normalizedEmuCode,
        date,
        timetableId
    );
    const createdRecord =
        insertedId > 0 ? getDailyRecordById(insertedId) : null;

    return {
        date,
        trainCode: normalizedTrainCode,
        emuCode: normalizedEmuCode,
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

    const wasToday = route.service_date === getCurrentDateString();
    let deletedProbeStatusRows = 0;
    let clearedRuntimeTrainKey = false;
    let clearedRuntimeEmuCodes: string[] = [];
    let clearedDetectionGroups = 0;

    if (wasToday) {
        deletedProbeStatusRows =
            deleteProbeStatusByTrainCodeAndEmuCodeAtServiceDate(
                route.train_code,
                route.emu_code,
                route.service_date
            );

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
        date: route.service_date,
        routeId,
        wasToday,
        deletedDailyRoute: true,
        deletedProbeStatusRows,
        clearedRuntimeTrainKey,
        clearedRuntimeEmuCodes,
        clearedDetectionGroups
    };
}
