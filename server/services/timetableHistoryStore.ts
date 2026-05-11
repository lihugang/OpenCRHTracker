import { createHash } from 'node:crypto';
import '~/server/libs/database/timetableHistory';
import { createPreparedSqlStore } from '~/server/libs/database/prepared';
import { useTimetableHistoryDatabase } from '~/server/libs/database/timetableHistory';
import {
    buildCodeIndex,
    buildGroupIndex,
    getGroupKey
} from '~/server/utils/12306/scheduleProbe/taskHelpers';
import type {
    ScheduleState,
    ScheduleStop
} from '~/server/utils/12306/scheduleProbe/types';
import uniqueNormalizedCodes from '~/server/utils/12306/uniqueNormalizedCodes';
import normalizeCode from '~/server/utils/12306/normalizeCode';
import { formatShanghaiDateString } from '~/server/utils/date/getCurrentDateString';
import { getShanghaiDayStartUnixSeconds } from '~/server/utils/date/shanghaiDateTime';
import importSqlBatch from '~/server/utils/sql/importSqlBatch';
import getNowSeconds from '~/server/utils/time/getNowSeconds';

export interface TimetableHistoryContentRow {
    id: number;
    hash: string;
    timetable_json: string;
    stop_count: number;
    created_at: number;
}

export interface TimetableHistoryCoverageRow {
    id: number;
    train_code: string;
    service_date_start: number;
    service_date_end_exclusive: number;
    content_id: number;
    created_at: number;
    updated_at: number;
}

export interface TimetableHistoryCursorPoint {
    serviceDate: string;
    id: number;
}

interface CanonicalTimetableStop {
    stationNo: number;
    stationName: string;
    arriveAt: number | null;
    departAt: number | null;
    stationTrainCode: string;
}

interface CanonicalTimetablePayload {
    stops: CanonicalTimetableStop[];
}

type TimetableHistorySqlKey =
    | 'deleteCoverageById'
    | 'insertContent'
    | 'insertCoverage'
    | 'selectContentById'
    | 'selectContentByHash'
    | 'selectCoverageByTrainCodeAtDate'
    | 'selectCoveragesByTrainCode'
    | 'selectCoveragesByTrainCodePaged'
    | 'selectLatestCoverageByTrainCodeAtOrBeforeDate'
    | 'updateCoverageContentById'
    | 'updateCoverageEndById';

export interface TimetableHistorySyncResult {
    confirmedGroups: number;
    confirmedTrainCodes: number;
    skippedGroups: number;
    createdContents: number;
    insertedCoverages: number;
    updatedCoverages: number;
    deletedCoverages: number;
    noopedCoverages: number;
    routeRefreshTrainCodes: string[];
}

interface SyncCoverageStats {
    createdContents: number;
    insertedCoverages: number;
    updatedCoverages: number;
    deletedCoverages: number;
    noopedCoverages: number;
}

const timetableHistorySql = importSqlBatch(
    'timetable-history/queries'
) as Record<TimetableHistorySqlKey, string>;

const timetableHistoryStatements =
    createPreparedSqlStore<TimetableHistorySqlKey>({
        dbName: 'timetableHistory',
        scope: 'timetable-history/queries',
        sql: timetableHistorySql
    });

const DEFAULT_TIMETABLE_HISTORY_CURSOR_POINT: TimetableHistoryCursorPoint = {
    serviceDate: '99991231',
    id: Number.MAX_SAFE_INTEGER
};

function normalizeServiceDateInteger(serviceDate: string): number {
    if (!/^\d{8}$/.test(serviceDate)) {
        throw new Error(`invalid_service_date ${serviceDate}`);
    }

    return Number.parseInt(serviceDate, 10);
}

export function normalizeTimetableHistoryServiceDate(serviceDate: string) {
    return normalizeServiceDateInteger(serviceDate);
}

export function formatTimetableHistoryServiceDate(serviceDate: number) {
    return formatServiceDateInteger(serviceDate);
}

export function getTimetableHistoryContentById(contentId: number) {
    if (!Number.isInteger(contentId) || contentId <= 0) {
        return null;
    }

    return (
        timetableHistoryStatements.get<TimetableHistoryContentRow>(
            'selectContentById',
            contentId
        ) ?? null
    );
}

export function getTimetableHistoryCoverageByTrainCodeAtDate(
    trainCode: string,
    serviceDate: string
) {
    const normalizedTrainCode = normalizeCode(trainCode);
    if (normalizedTrainCode.length === 0) {
        return null;
    }

    const normalizedServiceDate = normalizeServiceDateInteger(serviceDate);
    return (
        timetableHistoryStatements.get<TimetableHistoryCoverageRow>(
            'selectCoverageByTrainCodeAtDate',
            normalizedTrainCode,
            normalizedServiceDate,
            normalizedServiceDate
        ) ?? null
    );
}

export function getLatestTimetableHistoryCoverageByTrainCodeAtOrBeforeDate(
    trainCode: string,
    serviceDate: string
) {
    const normalizedTrainCode = normalizeCode(trainCode);
    if (normalizedTrainCode.length === 0) {
        return null;
    }

    const normalizedServiceDate = normalizeServiceDateInteger(serviceDate);
    return (
        timetableHistoryStatements.get<TimetableHistoryCoverageRow>(
            'selectLatestCoverageByTrainCodeAtOrBeforeDate',
            normalizedTrainCode,
            normalizedServiceDate
        ) ?? null
    );
}

export function listTimetableHistoryCoveragesByTrainCodePaged(
    trainCode: string,
    cursor: TimetableHistoryCursorPoint | null,
    limit: number
) {
    const normalizedTrainCode = normalizeCode(trainCode);
    if (
        normalizedTrainCode.length === 0 ||
        !Number.isInteger(limit) ||
        limit <= 0
    ) {
        return [];
    }

    const cursorPoint = cursor ?? DEFAULT_TIMETABLE_HISTORY_CURSOR_POINT;
    const cursorServiceDate = normalizeServiceDateInteger(
        cursorPoint.serviceDate
    );

    return timetableHistoryStatements.all<TimetableHistoryCoverageRow>(
        'selectCoveragesByTrainCodePaged',
        normalizedTrainCode,
        cursorServiceDate,
        cursorServiceDate,
        cursorPoint.id,
        limit
    );
}

function formatServiceDateInteger(serviceDate: number): string {
    if (!Number.isInteger(serviceDate) || serviceDate <= 0) {
        throw new Error(`invalid_service_date_int ${serviceDate}`);
    }

    return serviceDate.toString().padStart(8, '0');
}

function getNextServiceDateInteger(serviceDate: number): number {
    const currentDate = formatServiceDateInteger(serviceDate);
    const nextDate = formatShanghaiDateString(
        (getShanghaiDayStartUnixSeconds(currentDate) + 24 * 60 * 60) * 1000
    );
    return normalizeServiceDateInteger(nextDate);
}

function buildCanonicalTimetablePayload(
    stops: ScheduleStop[]
): CanonicalTimetablePayload {
    const normalizedStops = stops
        .map((stop) => ({
            stationNo: stop.stationNo,
            stationName: stop.stationName.trim(),
            arriveAt: stop.arriveAt,
            departAt: stop.departAt,
            stationTrainCode: stop.stationTrainCode.trim().toUpperCase()
        }))
        .sort((left, right) => {
            if (left.stationNo !== right.stationNo) {
                return left.stationNo - right.stationNo;
            }
            const stationNameDiff = left.stationName.localeCompare(
                right.stationName,
                'zh-Hans-CN'
            );
            if (stationNameDiff !== 0) {
                return stationNameDiff;
            }
            const leftArriveAt = left.arriveAt ?? Number.MIN_SAFE_INTEGER;
            const rightArriveAt = right.arriveAt ?? Number.MIN_SAFE_INTEGER;
            if (leftArriveAt !== rightArriveAt) {
                return leftArriveAt - rightArriveAt;
            }
            const leftDepartAt = left.departAt ?? Number.MIN_SAFE_INTEGER;
            const rightDepartAt = right.departAt ?? Number.MIN_SAFE_INTEGER;
            if (leftDepartAt !== rightDepartAt) {
                return leftDepartAt - rightDepartAt;
            }
            return left.stationTrainCode.localeCompare(
                right.stationTrainCode,
                'zh-Hans-CN'
            );
        });

    return {
        stops: normalizedStops
    };
}

function stringifyCanonicalTimetablePayload(
    payload: CanonicalTimetablePayload
) {
    return JSON.stringify(payload);
}

function hashCanonicalTimetableJson(canonicalJson: string) {
    return createHash('sha256').update(canonicalJson, 'utf8').digest('hex');
}

function ensureContentRow(
    hash: string,
    timetableJson: string,
    stopCount: number,
    nowSeconds: number,
    stats: SyncCoverageStats
) {
    const existingRow =
        timetableHistoryStatements.get<TimetableHistoryContentRow>(
            'selectContentByHash',
            hash
        );
    if (existingRow) {
        if (existingRow.timetable_json !== timetableJson) {
            throw new Error(`timetable_history_hash_collision hash=${hash}`);
        }
        return existingRow;
    }

    timetableHistoryStatements.run(
        'insertContent',
        hash,
        timetableJson,
        stopCount,
        nowSeconds
    );

    const insertedRow =
        timetableHistoryStatements.get<TimetableHistoryContentRow>(
            'selectContentByHash',
            hash
        );
    if (!insertedRow) {
        throw new Error(`timetable_history_content_insert_failed hash=${hash}`);
    }
    if (insertedRow.timetable_json !== timetableJson) {
        throw new Error(`timetable_history_hash_collision hash=${hash}`);
    }

    stats.createdContents += 1;
    return insertedRow;
}

function insertCoverage(
    trainCode: string,
    serviceDate: number,
    nextServiceDate: number,
    contentId: number,
    nowSeconds: number,
    stats: SyncCoverageStats
) {
    timetableHistoryStatements.run(
        'insertCoverage',
        trainCode,
        serviceDate,
        nextServiceDate,
        contentId,
        nowSeconds,
        nowSeconds
    );
    stats.insertedCoverages += 1;
}

function updateCoverageEnd(
    coverageId: number,
    nextServiceDate: number,
    nowSeconds: number,
    stats: SyncCoverageStats
) {
    timetableHistoryStatements.run(
        'updateCoverageEndById',
        nextServiceDate,
        nowSeconds,
        coverageId
    );
    stats.updatedCoverages += 1;
}

function updateCoverageContent(
    coverageId: number,
    contentId: number,
    nowSeconds: number,
    stats: SyncCoverageStats
) {
    timetableHistoryStatements.run(
        'updateCoverageContentById',
        contentId,
        nowSeconds,
        coverageId
    );
    stats.updatedCoverages += 1;
}

function deleteCoverage(coverageId: number, stats: SyncCoverageStats) {
    timetableHistoryStatements.run('deleteCoverageById', coverageId);
    stats.deletedCoverages += 1;
}

function normalizeAdjacentCoverages(
    trainCode: string,
    nowSeconds: number,
    stats: SyncCoverageStats
) {
    const rows = timetableHistoryStatements.all<TimetableHistoryCoverageRow>(
        'selectCoveragesByTrainCode',
        trainCode
    );
    if (rows.length < 2) {
        return;
    }

    let previousRow = rows[0]!;
    for (let index = 1; index < rows.length; index += 1) {
        const currentRow = rows[index]!;
        if (
            previousRow.content_id === currentRow.content_id &&
            previousRow.service_date_end_exclusive ===
                currentRow.service_date_start
        ) {
            updateCoverageEnd(
                previousRow.id,
                currentRow.service_date_end_exclusive,
                nowSeconds,
                stats
            );
            deleteCoverage(currentRow.id, stats);
            previousRow = {
                ...previousRow,
                service_date_end_exclusive:
                    currentRow.service_date_end_exclusive,
                updated_at: nowSeconds
            };
            continue;
        }

        previousRow = currentRow;
    }
}

function syncCoverageForTrainCode(
    trainCode: string,
    serviceDate: number,
    nextServiceDate: number,
    contentId: number,
    nowSeconds: number,
    stats: SyncCoverageStats
): boolean {
    const currentRow =
        timetableHistoryStatements.get<TimetableHistoryCoverageRow>(
            'selectLatestCoverageByTrainCodeAtOrBeforeDate',
            trainCode,
            serviceDate
        ) ?? null;

    if (!currentRow) {
        insertCoverage(
            trainCode,
            serviceDate,
            nextServiceDate,
            contentId,
            nowSeconds,
            stats
        );
        normalizeAdjacentCoverages(trainCode, nowSeconds, stats);
        return true;
    }

    if (
        currentRow.service_date_start <= serviceDate &&
        currentRow.service_date_end_exclusive > serviceDate
    ) {
        if (currentRow.content_id === contentId) {
            stats.noopedCoverages += 1;
            return false;
        }

        if (currentRow.service_date_start === serviceDate) {
            updateCoverageContent(currentRow.id, contentId, nowSeconds, stats);
            normalizeAdjacentCoverages(trainCode, nowSeconds, stats);
            return true;
        }

        updateCoverageEnd(currentRow.id, serviceDate, nowSeconds, stats);
        insertCoverage(
            trainCode,
            serviceDate,
            nextServiceDate,
            contentId,
            nowSeconds,
            stats
        );
        normalizeAdjacentCoverages(trainCode, nowSeconds, stats);
        return true;
    }

    if (
        currentRow.content_id === contentId &&
        currentRow.service_date_end_exclusive === serviceDate
    ) {
        updateCoverageEnd(currentRow.id, nextServiceDate, nowSeconds, stats);
        normalizeAdjacentCoverages(trainCode, nowSeconds, stats);
        return false;
    }

    insertCoverage(
        trainCode,
        serviceDate,
        nextServiceDate,
        contentId,
        nowSeconds,
        stats
    );
    normalizeAdjacentCoverages(trainCode, nowSeconds, stats);
    return true;
}

export function syncConfirmedTimetableHistoryForPublishedState(
    state: ScheduleState,
    confirmedTrainCodes: string[],
    nowSeconds = getNowSeconds()
): TimetableHistorySyncResult {
    const normalizedConfirmedTrainCodes =
        uniqueNormalizedCodes(confirmedTrainCodes);
    const result: TimetableHistorySyncResult = {
        confirmedGroups: 0,
        confirmedTrainCodes: normalizedConfirmedTrainCodes.length,
        skippedGroups: 0,
        createdContents: 0,
        insertedCoverages: 0,
        updatedCoverages: 0,
        deletedCoverages: 0,
        noopedCoverages: 0,
        routeRefreshTrainCodes: []
    };

    if (normalizedConfirmedTrainCodes.length === 0) {
        return result;
    }

    const codeIndex = buildCodeIndex(state.items);
    const groupIndex = buildGroupIndex(state.items);
    const confirmedGroupKeys = new Set<string>();

    for (const confirmedTrainCode of normalizedConfirmedTrainCodes) {
        const itemIndex = codeIndex.get(confirmedTrainCode);
        if (itemIndex === undefined) {
            continue;
        }

        confirmedGroupKeys.add(getGroupKey(state.items[itemIndex]!));
    }

    const serviceDate = normalizeServiceDateInteger(state.date);
    const nextServiceDate = getNextServiceDateInteger(serviceDate);
    const transaction = useTimetableHistoryDatabase().transaction(() => {
        for (const confirmedGroupKey of confirmedGroupKeys) {
            const groupItemIndexes = groupIndex.get(confirmedGroupKey);
            if (!groupItemIndexes || groupItemIndexes.length === 0) {
                result.skippedGroups += 1;
                continue;
            }

            const groupItems = groupItemIndexes.map(
                (itemIndex) => state.items[itemIndex]!
            );
            const representativeItem = groupItems.find(
                (item) => item.stops.length > 0
            );
            if (!representativeItem) {
                result.skippedGroups += 1;
                continue;
            }

            const aliasCodes = uniqueNormalizedCodes([
                ...groupItems.map((item) => item.code),
                ...groupItems.flatMap((item) => item.allCodes)
            ]);
            if (aliasCodes.length === 0) {
                result.skippedGroups += 1;
                continue;
            }

            const payload = buildCanonicalTimetablePayload(
                representativeItem.stops
            );
            if (payload.stops.length === 0) {
                result.skippedGroups += 1;
                continue;
            }

            const canonicalJson = stringifyCanonicalTimetablePayload(payload);
            const hash = hashCanonicalTimetableJson(canonicalJson);
            const contentRow = ensureContentRow(
                hash,
                canonicalJson,
                payload.stops.length,
                nowSeconds,
                result
            );
            let groupContentChanged = false;

            for (const aliasCode of aliasCodes) {
                const normalizedAliasCode = normalizeCode(aliasCode);
                if (normalizedAliasCode.length === 0) {
                    continue;
                }

                if (
                    syncCoverageForTrainCode(
                        normalizedAliasCode,
                        serviceDate,
                        nextServiceDate,
                        contentRow.id,
                        nowSeconds,
                        result
                    )
                ) {
                    groupContentChanged = true;
                }
            }

            if (groupContentChanged) {
                result.routeRefreshTrainCodes.push(
                    normalizeCode(representativeItem.code)
                );
            }
            result.confirmedGroups += 1;
        }
    });

    transaction();
    return result;
}
