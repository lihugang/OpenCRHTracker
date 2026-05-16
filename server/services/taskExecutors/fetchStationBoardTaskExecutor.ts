import getLogger from '~/server/libs/log4js';
import useConfig from '~/server/config';
import { registerTaskExecutor } from '~/server/services/taskExecutorRegistry';
import { enqueueTask } from '~/server/services/taskQueue';
import {
    buildCodeIndex,
    getGroupKey
} from '~/server/utils/12306/scheduleProbe/taskHelpers';
import {
    consumeRouteRefreshQueueEntries,
    loadScheduleDocument,
    saveScheduleCirculationEntries
} from '~/server/utils/12306/scheduleProbe/stateStore';
import type {
    ScheduleCirculationEntry,
    ScheduleRouteRefreshQueueEntry
} from '~/server/utils/12306/scheduleProbe/types';
import fetchStationBoardByStation, {
    type StationBoardTrainRow
} from '~/server/utils/12306/network/fetchStationBoardByStation';
import normalizeCode from '~/server/utils/12306/normalizeCode';
import uniqueNormalizedCodes from '~/server/utils/12306/uniqueNormalizedCodes';
import {
    getTodayScheduleProbeGroupByTrainCode,
    type TodayScheduleProbeGroup
} from '~/server/services/todayScheduleCache';
import getCurrentDateString from '~/server/utils/date/getCurrentDateString';
import getNowSeconds from '~/server/utils/time/getNowSeconds';
import { SHANGHAI_OFFSET_MS } from '~/server/utils/date/shanghaiDateTime';
import {
    getCurrentTrainProvenanceTaskRunId,
    recordCurrentTrainProvenanceEvent
} from '~/server/services/trainProvenanceRecorder';
import { recordStationBoardFetchResult } from '~/server/services/trainProvenanceStore';
import { getStationBoardIdleTaskOptions } from '~/server/services/stationBoardTaskScheduling';

export const FETCH_STATION_BOARD_TASK_EXECUTOR = 'fetch_station_board';

const logger = getLogger('task-executor:fetch-station-board');
const DAY_SECONDS = 24 * 60 * 60;
const SHANGHAI_OFFSET_SECONDS = SHANGHAI_OFFSET_MS / 1000;

export interface FetchStationBoardTaskArgs {
    serviceDate: string;
    stationName: string;
    stationTelecode: string;
    retryRemaining: number;
    parentSchedulerTaskId: number | null;
}

interface ParsedJiaoluNode {
    group: TodayScheduleProbeGroup;
}

type StationBoardRowSaveStatus = 'saved' | 'not_saved';

interface StationBoardPersistedRow extends StationBoardTrainRow {
    saveStatus: StationBoardRowSaveStatus;
    saveReasonCode: string;
    saveReasonText: string;
}

interface ParsedStationBoardRowEntry {
    row: StationBoardPersistedRow;
    entry: ScheduleCirculationEntry | null;
    signature: string;
}

let registered = false;

function normalizeStationName(value: string) {
    return value.trim();
}

export function parseFetchStationBoardTaskArgs(
    raw: unknown
): FetchStationBoardTaskArgs {
    const defaultRetryRemaining = Math.max(
        0,
        useConfig().task.circulation.stationBoard.maxAttempts - 1
    );

    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
        throw new Error('task arguments must be an object');
    }

    const body = raw as {
        serviceDate?: unknown;
        stationName?: unknown;
        stationTelecode?: unknown;
        retryRemaining?: unknown;
        parentSchedulerTaskId?: unknown;
    };
    const serviceDate =
        typeof body.serviceDate === 'string' ? body.serviceDate.trim() : '';
    const stationName =
        typeof body.stationName === 'string' ? body.stationName.trim() : '';
    const stationTelecode =
        typeof body.stationTelecode === 'string'
            ? body.stationTelecode.trim().toUpperCase()
            : '';
    const retryRemaining =
        typeof body.retryRemaining === 'number' &&
        Number.isInteger(body.retryRemaining) &&
        body.retryRemaining >= 0
            ? body.retryRemaining
            : defaultRetryRemaining;
    const parentSchedulerTaskId =
        typeof body.parentSchedulerTaskId === 'number' &&
        Number.isInteger(body.parentSchedulerTaskId) &&
        body.parentSchedulerTaskId > 0
            ? body.parentSchedulerTaskId
            : null;

    if (!/^\d{8}$/.test(serviceDate)) {
        throw new Error(
            'task arguments serviceDate must be in YYYYMMDD format'
        );
    }
    if (stationName.length === 0) {
        throw new Error(
            'task arguments stationName must be a non-empty string'
        );
    }
    if (stationTelecode.length === 0) {
        throw new Error(
            'task arguments stationTelecode must be a non-empty string'
        );
    }

    return {
        serviceDate,
        stationName,
        stationTelecode,
        retryRemaining,
        parentSchedulerTaskId
    };
}

function maybeRecordFetchResult(input: {
    serviceDate: string;
    parentSchedulerTaskId: number | null;
    stationName: string;
    stationTelecode: string;
    resultStatus: 'saved_entries' | 'no_official_entries';
    rowCount: number;
    parsedEntryCount: number;
    savedEntryCount: number;
    consumedQueueEntryCount: number;
    rows: StationBoardTrainRow[];
}) {
    const taskRunId = getCurrentTrainProvenanceTaskRunId();
    if (taskRunId === null) {
        return;
    }

    recordStationBoardFetchResult({
        taskRunId,
        serviceDate: input.serviceDate,
        parentSchedulerTaskId: input.parentSchedulerTaskId,
        stationName: input.stationName,
        stationTelecode: input.stationTelecode,
        resultStatus: input.resultStatus,
        rowCount: input.rowCount,
        parsedEntryCount: input.parsedEntryCount,
        savedEntryCount: input.savedEntryCount,
        consumedQueueEntryCount: input.consumedQueueEntryCount,
        rows: input.rows
    });
}

function matchesGroupStations(
    group: TodayScheduleProbeGroup,
    startStationName: string,
    endStationName: string
) {
    return (
        normalizeStationName(group.startStation) ===
            normalizeStationName(startStationName) &&
        normalizeStationName(group.endStation) ===
            normalizeStationName(endStationName)
    );
}

function expandCompressedTrainCodes(rawCode: string) {
    const tokens = rawCode
        .split('/')
        .map((token) => normalizeCode(token))
        .filter((token) => token.length > 0);
    if (tokens.length === 0) {
        return [];
    }

    const baseCode = tokens[0]!;
    const baseMatch = baseCode.match(/^([A-Z]+)(\d+)$/);
    if (!baseMatch) {
        return [];
    }

    const prefix = baseMatch[1]!;
    const numericPart = baseMatch[2]!;
    const expandedCodes = [baseCode];

    for (const token of tokens.slice(1)) {
        if (/^[A-Z]+\d+$/.test(token)) {
            expandedCodes.push(token);
            continue;
        }
        if (!/^\d+$/.test(token) || token.length > numericPart.length) {
            return [];
        }

        expandedCodes.push(
            `${prefix}${numericPart.slice(0, numericPart.length - token.length)}${token}`
        );
    }

    return uniqueNormalizedCodes(expandedCodes);
}

function resolveUniqueGroupForRawCode(
    rawCode: string,
    startStationName: string,
    endStationName: string
): TodayScheduleProbeGroup | null {
    const expandedCodes = expandCompressedTrainCodes(rawCode);
    if (expandedCodes.length === 0) {
        return null;
    }

    const groupsByKey = new Map<string, TodayScheduleProbeGroup>();
    for (const code of expandedCodes) {
        const group = getTodayScheduleProbeGroupByTrainCode(code);
        if (
            !group ||
            !matchesGroupStations(group, startStationName, endStationName)
        ) {
            continue;
        }

        groupsByKey.set(
            getGroupKey({
                code: group.trainCode,
                internalCode: group.trainInternalCode
            }),
            group
        );
    }

    if (groupsByKey.size !== 1) {
        return null;
    }

    const group = Array.from(groupsByKey.values())[0]!;
    return normalizeCode(group.trainInternalCode).length > 0 ? group : null;
}

function getShanghaiDayBucket(timestampSeconds: number) {
    return Math.floor(
        (timestampSeconds + SHANGHAI_OFFSET_SECONDS) / DAY_SECONDS
    );
}

function getShanghaiDayOffsetSeconds(timestampSeconds: number) {
    const dayBucket = getShanghaiDayBucket(timestampSeconds);
    return (
        timestampSeconds - (dayBucket * DAY_SECONDS - SHANGHAI_OFFSET_SECONDS)
    );
}

function buildOfficialCirculationEntry(
    nodes: readonly ParsedJiaoluNode[]
): ScheduleCirculationEntry | null {
    if (nodes.length === 0) {
        return null;
    }

    let currentRouteDayOffset = 0;
    const circulationNodes: ScheduleCirculationEntry['nodes'] = [];

    for (const [index, node] of nodes.entries()) {
        const currentGroup = node.group;
        const previousGroup = nodes[index - 1]?.group ?? null;

        if (previousGroup) {
            const previousReference = getShanghaiDayOffsetSeconds(
                previousGroup.endAt
            );
            const currentReference = getShanghaiDayOffsetSeconds(
                currentGroup.startAt
            );
            if (currentReference < previousReference) {
                currentRouteDayOffset += 1;
            }
        }

        const startDayOffsetSeconds = getShanghaiDayOffsetSeconds(
            currentGroup.startAt
        );
        const endDayOffsetSeconds = getShanghaiDayOffsetSeconds(
            currentGroup.endAt
        );
        const endDayShift =
            getShanghaiDayBucket(currentGroup.endAt) -
            getShanghaiDayBucket(currentGroup.startAt);
        const allCodes = uniqueNormalizedCodes([
            currentGroup.trainCode,
            ...currentGroup.allCodes
        ]);
        const internalCode = normalizeCode(currentGroup.trainInternalCode);
        if (allCodes.length === 0 || internalCode.length === 0) {
            return null;
        }

        circulationNodes.push({
            internalCode,
            allCodes,
            startStation: normalizeStationName(currentGroup.startStation),
            endStation: normalizeStationName(currentGroup.endStation),
            startAt:
                currentRouteDayOffset * DAY_SECONDS + startDayOffsetSeconds,
            endAt:
                currentRouteDayOffset * DAY_SECONDS +
                Math.max(endDayShift, 0) * DAY_SECONDS +
                endDayOffsetSeconds
        });
    }

    return {
        refreshedAt: getNowSeconds(),
        nodes: circulationNodes
    };
}

function getCirculationEntrySignature(entry: ScheduleCirculationEntry): string {
    return entry.nodes.map((node) => normalizeCode(node.internalCode)).join('|');
}

function buildStationBoardPersistedRow(
    row: StationBoardTrainRow,
    saveStatus: StationBoardRowSaveStatus,
    saveReasonCode: string,
    saveReasonText: string
): StationBoardPersistedRow {
    return {
        ...row,
        saveStatus,
        saveReasonCode,
        saveReasonText
    };
}

function buildFailedParsedStationBoardRowEntry(
    row: StationBoardTrainRow,
    saveReasonCode: string,
    saveReasonText: string
): ParsedStationBoardRowEntry {
    return {
        row: buildStationBoardPersistedRow(
            row,
            'not_saved',
            saveReasonCode,
            saveReasonText
        ),
        entry: null,
        signature: ''
    };
}

function parseJiaoluTrainToEntry(
    row: StationBoardTrainRow
): ParsedStationBoardRowEntry {
    const jiaoluTrain = row.jiaoluTrain.trim();
    if (jiaoluTrain.length === 0) {
        return buildFailedParsedStationBoardRowEntry(
            row,
            'empty_jiaolu_train',
            ''
        );
    }

    const parsedNodes: ParsedJiaoluNode[] = [];

    for (const segment of jiaoluTrain
        .split('#')
        .map((item) => item.trim())
        .filter((item) => item.length > 0)) {
        const fields = segment.split('|').map((item) => item.trim());
        if (fields.length !== 5) {
            return buildFailedParsedStationBoardRowEntry(
                row,
                'invalid_jiaolu_format',
                '交路串格式不合法'
            );
        }

        const [rawCode, startStationName, startTime, endStationName, endTime] =
            fields;
        if (
            !rawCode ||
            !startStationName ||
            !startTime ||
            !endStationName ||
            !endTime
        ) {
            return buildFailedParsedStationBoardRowEntry(
                row,
                'invalid_jiaolu_segment',
                '交路串存在缺失字段'
            );
        }

        const group = resolveUniqueGroupForRawCode(
            rawCode,
            startStationName,
            endStationName
        );
        if (!group) {
            return buildFailedParsedStationBoardRowEntry(
                row,
                'group_not_resolved',
                '无法映射到唯一的当日时刻表车次'
            );
        }

        if (normalizeCode(group.trainInternalCode).length === 0) {
            return buildFailedParsedStationBoardRowEntry(
                row,
                'missing_internal_code',
                '匹配到车次但内部车次号缺失'
            );
        }

        parsedNodes.push({
            group
        });
    }

    const entry = buildOfficialCirculationEntry(parsedNodes);
    if (!entry) {
        return buildFailedParsedStationBoardRowEntry(
            row,
            'invalid_jiaolu_entry',
            '交路串无法生成有效交路'
        );
    }

    return {
        row: buildStationBoardPersistedRow(row, 'saved', 'saved', ''),
        signature: getCirculationEntrySignature(entry),
        entry
    };
}

function chooseCirculationEntries(
    parsedRows: readonly ParsedStationBoardRowEntry[]
): ScheduleCirculationEntry[] {
    const entriesBySignature = new Map<string, ParsedStationBoardRowEntry[]>();
    for (const parsedRow of parsedRows) {
        if (!parsedRow.entry || parsedRow.signature.length === 0) {
            continue;
        }

        const existingGroup = entriesBySignature.get(parsedRow.signature);
        if (existingGroup) {
            existingGroup.push(parsedRow);
            continue;
        }

        entriesBySignature.set(parsedRow.signature, [parsedRow]);
    }

    const chosenEntries: ScheduleCirculationEntry[] = [];
    const signatureByInternalCode = new Map<string, string>();
    for (const [signature, signatureRows] of [...entriesBySignature.entries()].sort(
        (left, right) => {
            const lengthDiff =
                right[1][0]!.entry!.nodes.length - left[1][0]!.entry!.nodes.length;
            if (lengthDiff !== 0) {
                return lengthDiff;
            }
            return left[0].localeCompare(right[0], 'zh-Hans-CN');
        }
    )) {
        const parsedRow = signatureRows[0]!;
        const entry = parsedRow.entry!;
        const conflictingSignatures = uniqueNormalizedCodes(
            entry.nodes
                .map(
                    (node) =>
                        signatureByInternalCode.get(
                            normalizeCode(node.internalCode)
                        ) ?? ''
                )
                .filter((value) => value.length > 0 && value !== signature)
        );
        if (conflictingSignatures.length > 0) {
            for (const signatureRow of signatureRows) {
                signatureRow.row.saveStatus = 'not_saved';
                signatureRow.row.saveReasonCode =
                    'conflicting_signature_skipped';
                signatureRow.row.saveReasonText =
                    '与优先级更高的交路冲突，未保存';
            }
            logger.warn(
                `skip_conflicting_official_circulation signature=${signature} conflictingSignatures=${JSON.stringify(conflictingSignatures)}`
            );
            continue;
        }

        chosenEntries.push(entry);
        parsedRow.row.saveStatus = 'saved';
        parsedRow.row.saveReasonCode = 'saved';
        parsedRow.row.saveReasonText = '';
        for (const signatureRow of signatureRows.slice(1)) {
            signatureRow.row.saveStatus = 'not_saved';
            signatureRow.row.saveReasonCode = 'duplicate_signature_skipped';
            signatureRow.row.saveReasonText =
                '与其他站板行命中相同交路，未重复保存';
        }
        for (const node of entry.nodes) {
            signatureByInternalCode.set(
                normalizeCode(node.internalCode),
                signature
            );
        }
    }

    return chosenEntries;
}

function collectResolvedQueueEntries(
    serviceDate: string,
    queue: readonly ScheduleRouteRefreshQueueEntry[]
) {
    const scheduleFilePath = useConfig().data.assets.schedule.file;
    const document = loadScheduleDocument(scheduleFilePath);
    if (!document?.published || document.published.date !== serviceDate) {
        return [];
    }

    const codeIndex = buildCodeIndex(document.published.items);
    const resolvedEntries: ScheduleRouteRefreshQueueEntry[] = [];

    for (const queueEntry of queue) {
        if (queueEntry.serviceDate !== serviceDate) {
            continue;
        }

        const itemIndex = codeIndex.get(queueEntry.trainCode);
        if (itemIndex === undefined) {
            continue;
        }

        const item = document.published.items[itemIndex]!;
        const internalCode = normalizeCode(item.internalCode);
        if (internalCode.length === 0 || !document.circulation[internalCode]) {
            continue;
        }

        resolvedEntries.push(queueEntry);
    }

    return resolvedEntries;
}

function maybeRequeueTask(args: FetchStationBoardTaskArgs, reason: string) {
    if (args.retryRemaining <= 0) {
        recordCurrentTrainProvenanceEvent({
            serviceDate: args.serviceDate,
            eventType: 'station_board_fetch_exhausted',
            result: 'exhausted',
            payload: {
                stationName: args.stationName,
                stationTelecode: args.stationTelecode,
                reason,
                parentSchedulerTaskId: args.parentSchedulerTaskId
            }
        });
        logger.warn(
            `station_board_failed_exhausted serviceDate=${args.serviceDate} stationName=${args.stationName} stationTelecode=${args.stationTelecode} reason=${reason}`
        );
        return;
    }

    const retryDelaySeconds =
        useConfig().task.circulation.stationBoard.retryDelaySeconds;
    const nextRetryRemaining = args.retryRemaining - 1;
    const nextTaskId = enqueueTask(
        FETCH_STATION_BOARD_TASK_EXECUTOR,
        {
            ...args,
            retryRemaining: nextRetryRemaining
        },
        getNowSeconds() + retryDelaySeconds,
        getStationBoardIdleTaskOptions(FETCH_STATION_BOARD_TASK_EXECUTOR)
    );
    recordCurrentTrainProvenanceEvent({
        serviceDate: args.serviceDate,
        eventType: 'station_board_fetch_requeued',
        result: 'requeued',
        linkedSchedulerTaskId: nextTaskId,
        payload: {
            stationName: args.stationName,
            stationTelecode: args.stationTelecode,
            reason,
            retryRemaining: args.retryRemaining,
            nextRetryRemaining,
            retryDelaySeconds,
            parentSchedulerTaskId: args.parentSchedulerTaskId
        }
    });
    logger.warn(
        `station_board_failed_requeue serviceDate=${args.serviceDate} stationName=${args.stationName} stationTelecode=${args.stationTelecode} reason=${reason} retryRemaining=${args.retryRemaining} nextRetryRemaining=${nextRetryRemaining} nextTaskId=${nextTaskId} retryDelaySeconds=${retryDelaySeconds}`
    );
}

async function executeFetchStationBoardTask(rawArgs: unknown) {
    const args = parseFetchStationBoardTaskArgs(rawArgs);
    const currentDate = getCurrentDateString();
    const scheduleFilePath = useConfig().data.assets.schedule.file;
    const document = loadScheduleDocument(scheduleFilePath);
    if (!document?.published) {
        logger.warn(`skip schedule_not_found file=${scheduleFilePath}`);
        return;
    }
    if (
        document.published.date !== currentDate ||
        document.published.date !== args.serviceDate
    ) {
        logger.info(
            `skip_non_current_schedule taskServiceDate=${args.serviceDate} scheduleDate=${document.published.date} currentDate=${currentDate} stationTelecode=${args.stationTelecode}`
        );
        return;
    }

    let rows;
    try {
        rows = await fetchStationBoardByStation(
            args.serviceDate,
            args.stationTelecode
        );
    } catch (error) {
        const message =
            error instanceof Error
                ? `${error.name}: ${error.message}`
                : String(error);
        maybeRequeueTask(args, message);
        return;
    }

    const parsedEntries = rows
        .map((row) => parseJiaoluTrainToEntry(row));
    const chosenEntries = chooseCirculationEntries(parsedEntries);
    const persistedRows = parsedEntries.map((item) => item.row);
    const parsedEntryCount = parsedEntries.filter(
        (item) => item.entry !== null
    ).length;
    if (chosenEntries.length === 0) {
        maybeRecordFetchResult({
            serviceDate: args.serviceDate,
            parentSchedulerTaskId: args.parentSchedulerTaskId,
            stationName: args.stationName,
            stationTelecode: args.stationTelecode,
            resultStatus: 'no_official_entries',
            rowCount: rows.length,
            parsedEntryCount,
            savedEntryCount: 0,
            consumedQueueEntryCount: 0,
            rows: persistedRows
        });
        recordCurrentTrainProvenanceEvent({
            serviceDate: args.serviceDate,
            eventType: 'station_board_fetch_completed',
            result: 'no_official_entries',
            payload: {
                stationName: args.stationName,
                stationTelecode: args.stationTelecode,
                rowCount: rows.length,
                parsedEntryCount,
                savedEntryCount: 0,
                consumedQueueEntryCount: 0,
                parentSchedulerTaskId: args.parentSchedulerTaskId
            }
        });
        logger.info(
            `done_no_official_entries serviceDate=${args.serviceDate} stationName=${args.stationName} stationTelecode=${args.stationTelecode} rows=${rows.length}`
        );
        return;
    }

    const savedKeys = saveScheduleCirculationEntries(
        scheduleFilePath,
        chosenEntries
    );
    const resolvedQueueEntries = collectResolvedQueueEntries(
        args.serviceDate,
        document.routeRefreshQueue
    );
    const removedQueueEntries = consumeRouteRefreshQueueEntries(
        scheduleFilePath,
        resolvedQueueEntries
    );

    maybeRecordFetchResult({
        serviceDate: args.serviceDate,
        parentSchedulerTaskId: args.parentSchedulerTaskId,
        stationName: args.stationName,
        stationTelecode: args.stationTelecode,
        resultStatus: 'saved_entries',
        rowCount: rows.length,
        parsedEntryCount,
        savedEntryCount: chosenEntries.length,
        consumedQueueEntryCount: removedQueueEntries.length,
        rows: persistedRows
    });
    recordCurrentTrainProvenanceEvent({
        serviceDate: args.serviceDate,
        eventType: 'station_board_fetch_completed',
        result: 'saved_entries',
        payload: {
            stationName: args.stationName,
            stationTelecode: args.stationTelecode,
            rowCount: rows.length,
            parsedEntryCount,
            savedEntryCount: chosenEntries.length,
            consumedQueueEntryCount: removedQueueEntries.length,
            savedKeys,
            parentSchedulerTaskId: args.parentSchedulerTaskId
        }
    });

    logger.info(
        `done serviceDate=${args.serviceDate} stationName=${args.stationName} stationTelecode=${args.stationTelecode} rows=${rows.length} parsedEntries=${parsedEntryCount} savedEntries=${chosenEntries.length} savedKeys=${savedKeys.length} consumedQueueEntries=${removedQueueEntries.length}`
    );
}

export function registerFetchStationBoardTaskExecutor() {
    if (registered) {
        return;
    }

    registerTaskExecutor(FETCH_STATION_BOARD_TASK_EXECUTOR, async (args) => {
        await executeFetchStationBoardTask(args);
    });
    registered = true;
    logger.info(`registered executor=${FETCH_STATION_BOARD_TASK_EXECUTOR}`);
}
