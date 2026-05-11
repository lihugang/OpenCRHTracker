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
import fetchStationBoardByStation from '~/server/utils/12306/network/fetchStationBoardByStation';
import normalizeCode from '~/server/utils/12306/normalizeCode';
import uniqueNormalizedCodes from '~/server/utils/12306/uniqueNormalizedCodes';
import {
    getTodayScheduleProbeGroupByTrainCode,
    getTodayScheduleProbeGroupByTrainInternalCode,
    type TodayScheduleProbeGroup
} from '~/server/services/todayScheduleCache';
import getCurrentDateString from '~/server/utils/date/getCurrentDateString';
import getNowSeconds from '~/server/utils/time/getNowSeconds';
import { SHANGHAI_OFFSET_MS } from '~/server/utils/date/shanghaiDateTime';

export const FETCH_STATION_BOARD_TASK_EXECUTOR = 'fetch_station_board';

const logger = getLogger('task-executor:fetch-station-board');
const DAY_SECONDS = 24 * 60 * 60;
const SHANGHAI_OFFSET_SECONDS = SHANGHAI_OFFSET_MS / 1000;

export interface FetchStationBoardTaskArgs {
    serviceDate: string;
    stationName: string;
    stationTelecode: string;
    retryRemaining: number;
}

interface ParsedJiaoluNode {
    group: TodayScheduleProbeGroup;
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
        retryRemaining
    };
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

function parseJiaoluTrainToEntry(
    jiaoluTrain: string
): ScheduleCirculationEntry | null {
    const parsedNodes: ParsedJiaoluNode[] = [];

    for (const segment of jiaoluTrain
        .split('#')
        .map((item) => item.trim())
        .filter((item) => item.length > 0)) {
        const fields = segment.split('|').map((item) => item.trim());
        if (fields.length !== 5) {
            return null;
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
            return null;
        }

        const group = resolveUniqueGroupForRawCode(
            rawCode,
            startStationName,
            endStationName
        );
        if (!group) {
            return null;
        }

        parsedNodes.push({
            group
        });
    }

    return buildOfficialCirculationEntry(parsedNodes);
}

function chooseCirculationEntries(
    entries: readonly ScheduleCirculationEntry[]
): ScheduleCirculationEntry[] {
    const entriesBySignature = new Map<string, ScheduleCirculationEntry>();
    for (const entry of entries) {
        const signature = entry.nodes
            .map((node) => normalizeCode(node.internalCode))
            .join('|');
        if (!entriesBySignature.has(signature)) {
            entriesBySignature.set(signature, entry);
        }
    }

    const chosenEntries: ScheduleCirculationEntry[] = [];
    const signatureByInternalCode = new Map<string, string>();
    for (const [signature, entry] of [...entriesBySignature.entries()].sort(
        (left, right) => {
            const lengthDiff = right[1].nodes.length - left[1].nodes.length;
            if (lengthDiff !== 0) {
                return lengthDiff;
            }
            return left[0].localeCompare(right[0], 'zh-Hans-CN');
        }
    )) {
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
            logger.warn(
                `skip_conflicting_official_circulation signature=${signature} conflictingSignatures=${JSON.stringify(conflictingSignatures)}`
            );
            continue;
        }

        chosenEntries.push(entry);
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
        getNowSeconds() + retryDelaySeconds
    );
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
        .map((row) => parseJiaoluTrainToEntry(row.jiaoluTrain))
        .filter((entry): entry is ScheduleCirculationEntry => entry !== null);
    const chosenEntries = chooseCirculationEntries(parsedEntries);
    if (chosenEntries.length === 0) {
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

    logger.info(
        `done serviceDate=${args.serviceDate} stationName=${args.stationName} stationTelecode=${args.stationTelecode} rows=${rows.length} parsedEntries=${parsedEntries.length} savedEntries=${chosenEntries.length} savedKeys=${savedKeys.length} consumedQueueEntries=${removedQueueEntries.length}`
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
