import '~/server/libs/database/timetableHistory';
import { createPreparedSqlStore } from '~/server/libs/database/prepared';
import { useTimetableHistoryDatabase } from '~/server/libs/database/timetableHistory';
import {
    buildCodeIndex,
    buildGroupIndex,
    getGroupKey,
    uniqueTrainCodes
} from '~/server/utils/12306/scheduleProbe/taskHelpers';
import type {
    ScheduleItem,
    ScheduleState
} from '~/server/utils/12306/scheduleProbe/types';
import {
    listScheduleItemsWithStopsByStateKindAndInternalCode,
    loadScheduleItemCodeByStateKindAndAlias,
    loadScheduleItemWithStopsByStateKindAndCode,
    type ScheduleStateKind
} from '~/server/utils/12306/scheduleProbe/sqliteStore';
import {
    trainCodeKey,
    type TrainCodeParts
} from '~/server/utils/12306/trainCode';
import getCanonicalTimetableContent from '~/server/utils/12306/getCanonicalTimetableContent';
import importSqlBatch from '~/server/utils/sql/importSqlBatch';
import getNowSeconds from '~/server/utils/time/getNowSeconds';
import {
    asServiceDay,
    serviceDateToDay,
    type ServiceDay
} from '~/server/utils/date/serviceDay';
import {
    parseInternalJson,
    stringifyInternalJson
} from '~/server/utils/internal/storageValues';

export interface TimetableHistoryContentRow {
    id: number;
    hash: string;
    timetable_json: string;
    stop_count: number;
    created_at: number;
}

export interface TimetableHistoryCoverageRow {
    id: number;
    train_code: TrainCodeParts;
    service_date_start: ServiceDay;
    service_date_end_exclusive: ServiceDay;
    content_id: number;
    created_at: number;
    updated_at: number;
}

interface RawTimetableHistoryCoverageRow {
    id: number;
    train_prefix: string;
    train_number: number;
    service_date_start: number;
    service_date_end_exclusive: number;
    content_id: number;
    created_at: number;
    updated_at: number;
}

export interface TimetableHistoryCursorPoint {
    serviceDate: ServiceDay;
    id: number;
}

type TimetableHistorySqlKey =
    | 'deleteCoverageById'
    | 'insertContent'
    | 'insertCoverage'
    | 'selectCoverageById'
    | 'selectContentById'
    | 'selectContentByHash'
    | 'selectCoverageByTrainCodeAtDate'
    | 'selectCoveragesByTrainCode'
    | 'selectCoveragesByTrainCodePaged'
    | 'selectLatestCoverageByTrainCodeAtOrBeforeDate'
    | 'selectLatestCoveragesByTrainCodeAtOrBeforeDate'
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
    timetableChangedTrainCodes: TrainCodeParts[];
}

interface SyncCoverageStats {
    createdContents: number;
    insertedCoverages: number;
    updatedCoverages: number;
    deletedCoverages: number;
    noopedCoverages: number;
}

interface CoverageSyncResult {
    isFirstObservation: boolean;
    timetableChanged: boolean;
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
    serviceDate: serviceDateToDay('99991231'),
    id: Number.MAX_SAFE_INTEGER
};

function decodeCoverageRow(
    row: RawTimetableHistoryCoverageRow
): TimetableHistoryCoverageRow {
    return {
        ...row,
        train_code: {
            prefix: row.train_prefix,
            number: row.train_number
        },
        service_date_start: asServiceDay(row.service_date_start),
        service_date_end_exclusive: asServiceDay(row.service_date_end_exclusive)
    };
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

export function getTimetableHistoryCoverageById(coverageId: number) {
    if (!Number.isInteger(coverageId) || coverageId <= 0) {
        return null;
    }

    const row = timetableHistoryStatements.get<RawTimetableHistoryCoverageRow>(
        'selectCoverageById',
        coverageId
    );
    return row ? decodeCoverageRow(row) : null;
}

export function getTimetableHistoryCoverageByTrainCodeAtDate(
    trainCode: TrainCodeParts,
    serviceDate: ServiceDay
) {
    const row = timetableHistoryStatements.get<RawTimetableHistoryCoverageRow>(
        'selectCoverageByTrainCodeAtDate',
        trainCode.prefix,
        trainCode.number,
        serviceDate,
        serviceDate
    );
    return row ? decodeCoverageRow(row) : null;
}

export function getLatestTimetableHistoryCoverageByTrainCodeAtOrBeforeDate(
    trainCode: TrainCodeParts,
    serviceDate: ServiceDay
) {
    const row = timetableHistoryStatements.get<RawTimetableHistoryCoverageRow>(
        'selectLatestCoverageByTrainCodeAtOrBeforeDate',
        trainCode.prefix,
        trainCode.number,
        serviceDate
    );
    return row ? decodeCoverageRow(row) : null;
}

export function listTimetableHistoryCoveragesByTrainCodePaged(
    trainCode: TrainCodeParts,
    cursor: TimetableHistoryCursorPoint | null,
    limit: number
) {
    if (!Number.isInteger(limit) || limit <= 0) return [];

    const cursorPoint = cursor ?? DEFAULT_TIMETABLE_HISTORY_CURSOR_POINT;

    return timetableHistoryStatements
        .all<RawTimetableHistoryCoverageRow>(
            'selectCoveragesByTrainCodePaged',
            trainCode.prefix,
            trainCode.number,
            cursorPoint.serviceDate,
            cursorPoint.serviceDate,
            cursorPoint.id,
            limit
        )
        .map(decodeCoverageRow);
}

export function listTimetableHistoryCoveragesByTrainCode(
    trainCode: TrainCodeParts
) {
    return timetableHistoryStatements
        .all<RawTimetableHistoryCoverageRow>(
            'selectCoveragesByTrainCode',
            trainCode.prefix,
            trainCode.number
        )
        .map(decodeCoverageRow);
}

export interface TimetableHistoryMergedCoverageResult {
    trainCode: TrainCodeParts;
    previous: TimetableHistoryCoverageRow;
    middle: TimetableHistoryCoverageRow;
    next: TimetableHistoryCoverageRow;
    merged: TimetableHistoryCoverageRow;
    deletedCoverageIds: number[];
}

export function isTimetableHistoryMergeCandidate(
    previous: TimetableHistoryCoverageRow,
    middle: TimetableHistoryCoverageRow,
    next: TimetableHistoryCoverageRow
) {
    return (
        previous.train_code.prefix === middle.train_code.prefix &&
        previous.train_code.number === middle.train_code.number &&
        middle.train_code.prefix === next.train_code.prefix &&
        middle.train_code.number === next.train_code.number &&
        previous.service_date_end_exclusive === middle.service_date_start &&
        middle.service_date_end_exclusive === next.service_date_start &&
        previous.content_id === next.content_id &&
        middle.content_id !== previous.content_id
    );
}

export function mergeTimetableHistoryCoverageByMiddleId(
    coverageId: number,
    nowSeconds = getNowSeconds()
): TimetableHistoryMergedCoverageResult | null {
    if (!Number.isInteger(coverageId) || coverageId <= 0) {
        return null;
    }

    const transaction = useTimetableHistoryDatabase().transaction(() => {
        const middle = getTimetableHistoryCoverageById(coverageId);
        if (!middle) {
            return null;
        }

        const rows = listTimetableHistoryCoveragesByTrainCode(
            middle.train_code
        );
        const middleIndex = rows.findIndex((row) => row.id === middle.id);
        const previous = rows[middleIndex - 1] ?? null;
        const next = rows[middleIndex + 1] ?? null;

        if (
            !previous ||
            !next ||
            !isTimetableHistoryMergeCandidate(previous, middle, next)
        ) {
            return null;
        }

        timetableHistoryStatements.run(
            'updateCoverageEndById',
            next.service_date_end_exclusive,
            nowSeconds,
            previous.id
        );
        timetableHistoryStatements.run('deleteCoverageById', middle.id);
        timetableHistoryStatements.run('deleteCoverageById', next.id);

        const merged = getTimetableHistoryCoverageById(previous.id);
        if (!merged) {
            throw new Error(
                `timetable_history_merge_missing_previous id=${previous.id}`
            );
        }

        return {
            trainCode: previous.train_code,
            previous,
            middle,
            next,
            merged,
            deletedCoverageIds: [middle.id, next.id]
        } satisfies TimetableHistoryMergedCoverageResult;
    });

    return transaction();
}

export function listLatestTimetableHistoryCoveragesByTrainCodeAtOrBeforeDate(
    trainCode: TrainCodeParts,
    serviceDate: ServiceDay,
    limit: number
) {
    if (!Number.isInteger(limit) || limit <= 0) return [];

    return timetableHistoryStatements
        .all<RawTimetableHistoryCoverageRow>(
            'selectLatestCoveragesByTrainCodeAtOrBeforeDate',
            trainCode.prefix,
            trainCode.number,
            serviceDate,
            serviceDate,
            limit
        )
        .map(decodeCoverageRow);
}

function getNextServiceDateInteger(serviceDate: ServiceDay): ServiceDay {
    return asServiceDay(serviceDate + 1);
}

function ensureContentRow(
    hash: string,
    timetableJson: string,
    stopCount: number,
    nowSeconds: number,
    stats: SyncCoverageStats
) {
    const internalTimetableJson = stringifyInternalJson(
        parseInternalJson(timetableJson, 'internal')
    );
    const existingRow =
        timetableHistoryStatements.get<TimetableHistoryContentRow>(
            'selectContentByHash',
            hash
        );
    if (existingRow) {
        if (existingRow.timetable_json !== internalTimetableJson) {
            throw new Error(`timetable_history_hash_collision hash=${hash}`);
        }
        return existingRow;
    }

    timetableHistoryStatements.run(
        'insertContent',
        hash,
        internalTimetableJson,
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
    if (insertedRow.timetable_json !== internalTimetableJson) {
        throw new Error(`timetable_history_hash_collision hash=${hash}`);
    }

    stats.createdContents += 1;
    return insertedRow;
}

function insertCoverage(
    trainCode: TrainCodeParts,
    serviceDate: ServiceDay,
    nextServiceDate: ServiceDay,
    contentId: number,
    nowSeconds: number,
    stats: SyncCoverageStats
) {
    timetableHistoryStatements.run(
        'insertCoverage',
        trainCode.prefix,
        trainCode.number,
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

function extendCoverageEndIfNeeded(
    coverage: TimetableHistoryCoverageRow,
    nextServiceDate: number,
    nowSeconds: number,
    stats: SyncCoverageStats
) {
    if (coverage.service_date_end_exclusive >= nextServiceDate) {
        stats.noopedCoverages += 1;
        return false;
    }

    updateCoverageEnd(coverage.id, nextServiceDate, nowSeconds, stats);
    return true;
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
    trainCode: TrainCodeParts,
    nowSeconds: number,
    stats: SyncCoverageStats
) {
    const rows = timetableHistoryStatements
        .all<RawTimetableHistoryCoverageRow>(
            'selectCoveragesByTrainCode',
            trainCode.prefix,
            trainCode.number
        )
        .map(decodeCoverageRow);
    if (rows.length < 2) {
        return;
    }

    let previousRow = rows[0]!;
    for (let index = 1; index < rows.length; index += 1) {
        const currentRow = rows[index]!;
        if (previousRow.content_id === currentRow.content_id) {
            const mergedServiceDateEndExclusive = Math.max(
                previousRow.service_date_end_exclusive,
                currentRow.service_date_end_exclusive
            );
            updateCoverageEnd(
                previousRow.id,
                mergedServiceDateEndExclusive,
                nowSeconds,
                stats
            );
            deleteCoverage(currentRow.id, stats);
            previousRow = {
                ...previousRow,
                service_date_end_exclusive: asServiceDay(
                    mergedServiceDateEndExclusive
                ),
                updated_at: nowSeconds
            };
            continue;
        }

        previousRow = currentRow;
    }
}

function syncCoverageForTrainCode(
    trainCode: TrainCodeParts,
    serviceDate: ServiceDay,
    nextServiceDate: ServiceDay,
    contentId: number,
    nowSeconds: number,
    stats: SyncCoverageStats
): CoverageSyncResult {
    const currentRawRow =
        timetableHistoryStatements.get<RawTimetableHistoryCoverageRow>(
            'selectLatestCoverageByTrainCodeAtOrBeforeDate',
            trainCode.prefix,
            trainCode.number,
            serviceDate
        ) ?? null;
    const currentRow = currentRawRow ? decodeCoverageRow(currentRawRow) : null;

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
        return { isFirstObservation: true, timetableChanged: false };
    }

    if (
        currentRow.service_date_start <= serviceDate &&
        currentRow.service_date_end_exclusive > serviceDate
    ) {
        if (currentRow.content_id === contentId) {
            stats.noopedCoverages += 1;
            return { isFirstObservation: false, timetableChanged: false };
        }

        if (currentRow.service_date_start === serviceDate) {
            updateCoverageContent(currentRow.id, contentId, nowSeconds, stats);
            normalizeAdjacentCoverages(trainCode, nowSeconds, stats);
            return { isFirstObservation: false, timetableChanged: true };
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
        return { isFirstObservation: false, timetableChanged: true };
    }

    if (currentRow.content_id === contentId) {
        // currentRow is the latest segment at or before serviceDate, so
        // extending it only bridges uncovered dates and cannot skip over a
        // later coverage segment with a different content_id.
        extendCoverageEndIfNeeded(
            currentRow,
            nextServiceDate,
            nowSeconds,
            stats
        );
        normalizeAdjacentCoverages(trainCode, nowSeconds, stats);
        return { isFirstObservation: false, timetableChanged: false };
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
    return { isFirstObservation: false, timetableChanged: true };
}

export function syncConfirmedTimetableHistoryForPublishedState(
    state: ScheduleState,
    confirmedTrainCodes: readonly TrainCodeParts[],
    nowSeconds = getNowSeconds()
): TimetableHistorySyncResult {
    const normalizedConfirmedTrainCodes = uniqueTrainCodes([
        ...confirmedTrainCodes
    ]);
    const groupItemsByGroupKey = new Map<string, ScheduleItem[]>();

    const codeIndex = buildCodeIndex(state.items);
    const groupIndex = buildGroupIndex(state.items);

    for (const confirmedTrainCode of normalizedConfirmedTrainCodes) {
        const itemIndex = codeIndex.get(trainCodeKey(confirmedTrainCode));
        if (itemIndex === undefined) {
            continue;
        }

        const groupKey = getGroupKey(state.items[itemIndex]!);
        if (groupItemsByGroupKey.has(groupKey)) {
            continue;
        }

        const groupItemIndexes = groupIndex.get(groupKey);
        if (!groupItemIndexes || groupItemIndexes.length === 0) {
            groupItemsByGroupKey.set(groupKey, []);
            continue;
        }

        groupItemsByGroupKey.set(
            groupKey,
            groupItemIndexes.map((currentItemIndex) => {
                return state.items[currentItemIndex]!;
            })
        );
    }

    return syncConfirmedTimetableHistoryGroups(
        state.date,
        normalizedConfirmedTrainCodes,
        [...groupItemsByGroupKey.values()],
        nowSeconds
    );
}

export function syncConfirmedTimetableHistoryForScheduleStateKind(
    kind: ScheduleStateKind,
    serviceDate: ServiceDay,
    confirmedTrainCodes: readonly TrainCodeParts[],
    nowSeconds = getNowSeconds()
): TimetableHistorySyncResult {
    const normalizedConfirmedTrainCodes = uniqueTrainCodes([
        ...confirmedTrainCodes
    ]);
    const groupItemsByGroupKey = new Map<string, ScheduleItem[]>();

    for (const confirmedTrainCode of normalizedConfirmedTrainCodes) {
        const itemCode =
            loadScheduleItemCodeByStateKindAndAlias(kind, confirmedTrainCode) ??
            confirmedTrainCode;
        const item = loadScheduleItemWithStopsByStateKindAndCode(
            kind,
            itemCode
        );
        if (!item) {
            continue;
        }

        const groupKey = getGroupKey(item);
        if (groupItemsByGroupKey.has(groupKey)) {
            continue;
        }

        const groupItems =
            item.internalCode.trim().length > 0
                ? listScheduleItemsWithStopsByStateKindAndInternalCode(
                      kind,
                      item.internalCode
                  )
                : [item];
        groupItemsByGroupKey.set(
            groupKey,
            groupItems.length > 0 ? groupItems : [item]
        );
    }

    return syncConfirmedTimetableHistoryGroups(
        serviceDate,
        normalizedConfirmedTrainCodes,
        [...groupItemsByGroupKey.values()],
        nowSeconds
    );
}

function createTimetableHistorySyncResult(
    normalizedConfirmedTrainCodes: readonly TrainCodeParts[]
): TimetableHistorySyncResult {
    return {
        confirmedGroups: 0,
        confirmedTrainCodes: normalizedConfirmedTrainCodes.length,
        skippedGroups: 0,
        createdContents: 0,
        insertedCoverages: 0,
        updatedCoverages: 0,
        deletedCoverages: 0,
        noopedCoverages: 0,
        timetableChangedTrainCodes: []
    };
}

function syncConfirmedTimetableHistoryGroups(
    serviceDate: ServiceDay,
    normalizedConfirmedTrainCodes: readonly TrainCodeParts[],
    groups: ScheduleItem[][],
    nowSeconds: number
): TimetableHistorySyncResult {
    const result = createTimetableHistorySyncResult(
        normalizedConfirmedTrainCodes
    );

    if (normalizedConfirmedTrainCodes.length === 0) {
        return result;
    }

    const nextServiceDate = getNextServiceDateInteger(serviceDate);
    const transaction = useTimetableHistoryDatabase().transaction(() => {
        for (const groupItems of groups) {
            if (groupItems.length === 0) {
                result.skippedGroups += 1;
                continue;
            }

            const representativeItem = groupItems.find(
                (item) => item.stops.length > 0
            );
            if (!representativeItem) {
                result.skippedGroups += 1;
                continue;
            }

            const aliasCodes = uniqueTrainCodes([
                ...groupItems.map((item) => item.code),
                ...groupItems.flatMap((item) => item.allCodes)
            ]);
            if (aliasCodes.length === 0) {
                result.skippedGroups += 1;
                continue;
            }

            const content = getCanonicalTimetableContent(
                representativeItem.stops
            );
            if (content.stopCount === 0) {
                result.skippedGroups += 1;
                continue;
            }

            const contentRow = ensureContentRow(
                content.hash,
                content.timetableJson,
                content.stopCount,
                nowSeconds,
                result
            );
            let groupHasComparableContent = false;
            let groupHasFirstObservation = false;
            let groupTimetableChanged = false;

            for (const aliasCode of aliasCodes) {
                const coverageSyncResult = syncCoverageForTrainCode(
                    aliasCode,
                    serviceDate,
                    nextServiceDate,
                    contentRow.id,
                    nowSeconds,
                    result
                );
                if (coverageSyncResult.isFirstObservation) {
                    groupHasFirstObservation = true;
                } else {
                    groupHasComparableContent = true;
                }
                if (coverageSyncResult.timetableChanged) {
                    groupTimetableChanged = true;
                }
            }

            if (
                groupTimetableChanged ||
                (!groupHasComparableContent && groupHasFirstObservation)
            ) {
                result.timetableChangedTrainCodes.push(representativeItem.code);
            }
            result.confirmedGroups += 1;
        }
    });

    transaction();
    return result;
}
