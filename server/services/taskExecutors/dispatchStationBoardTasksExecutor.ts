import useConfig from '~/server/config';
import getLogger from '~/server/libs/log4js';
import { registerTaskExecutor } from '~/server/services/taskExecutorRegistry';
import { loadScheduleDocument } from '~/server/utils/12306/scheduleProbe/stateStore';
import type {
    ScheduleDocument,
    ScheduleItem,
    ScheduleState
} from '~/server/utils/12306/scheduleProbe/types';
import {
    buildCodeIndex,
    buildGroupIndex,
    getGroupKey
} from '~/server/utils/12306/scheduleProbe/taskHelpers';
import getCurrentDateString from '~/server/utils/date/getCurrentDateString';
import getNowSeconds from '~/server/utils/time/getNowSeconds';
import normalizeCode from '~/server/utils/12306/normalizeCode';
import solveStationCover from '~/server/utils/12306/stationBoard/solveStationCover';
import fetchAllStations from '~/server/utils/12306/network/fetchAllStations';
import {
    enqueueTask,
    listPendingTasksByExecutor
} from '~/server/services/taskQueue';
import {
    FETCH_STATION_BOARD_TASK_EXECUTOR,
    parseFetchStationBoardTaskArgs
} from './fetchStationBoardTaskExecutor';

export const DISPATCH_STATION_BOARD_TASKS_EXECUTOR =
    'dispatch_station_board_tasks';

interface StationBoardCandidateGroup {
    groupKey: string;
    stationNames: string[];
}

const logger = getLogger('task-executor:dispatch-station-board-tasks');

let registered = false;

function normalizeStationName(value: string) {
    return value.trim();
}

function buildStationBoardTaskKey(
    serviceDate: string,
    stationTelecode: string
) {
    return `${serviceDate}:${normalizeCode(stationTelecode)}`;
}

function collectGroupStationNames(
    state: ScheduleState,
    groupIndexes: readonly number[]
) {
    const seenStations = new Set<string>();
    const stationNames: string[] = [];

    for (const groupIndex of groupIndexes) {
        const item = state.items[groupIndex];
        if (!item) {
            continue;
        }

        for (const stop of item.stops) {
            const stationName = normalizeStationName(stop.stationName);
            if (stationName.length === 0 || seenStations.has(stationName)) {
                continue;
            }

            seenStations.add(stationName);
            stationNames.push(stationName);
        }
    }

    return stationNames;
}

function getOrCreateCandidateGroup(
    candidatesByGroupKey: Map<string, StationBoardCandidateGroup>,
    item: ScheduleItem,
    stationNames: string[]
) {
    const groupKey = getGroupKey(item);
    const existing = candidatesByGroupKey.get(groupKey);
    if (existing) {
        const seenStations = new Set(existing.stationNames);
        for (const stationName of stationNames) {
            if (seenStations.has(stationName)) {
                continue;
            }

            seenStations.add(stationName);
            existing.stationNames.push(stationName);
        }
        return existing;
    }

    const candidate: StationBoardCandidateGroup = {
        groupKey,
        stationNames: [...stationNames]
    };
    candidatesByGroupKey.set(groupKey, candidate);
    return candidate;
}

function buildStationTelecodeLookup(
    stations: Awaited<ReturnType<typeof fetchAllStations>>
) {
    const telecodesByStationName = new Map<string, Set<string>>();

    for (const station of stations) {
        const stationName = normalizeStationName(station.stationName);
        const stationTelecode = normalizeCode(station.stationTelecode);
        if (stationName.length === 0 || stationTelecode.length === 0) {
            continue;
        }

        const existing = telecodesByStationName.get(stationName);
        if (existing) {
            existing.add(stationTelecode);
            continue;
        }

        telecodesByStationName.set(stationName, new Set([stationTelecode]));
    }

    return telecodesByStationName;
}

function collectCandidates(
    document: ScheduleDocument,
    state: ScheduleState
): StationBoardCandidateGroup[] {
    const codeIndex = buildCodeIndex(state.items);
    const groupIndex = buildGroupIndex(state.items);
    const candidatesByGroupKey = new Map<string, StationBoardCandidateGroup>();

    for (const queueEntry of document.routeRefreshQueue) {
        if (queueEntry.serviceDate !== state.date) {
            continue;
        }

        const itemIndex = codeIndex.get(queueEntry.trainCode);
        if (itemIndex === undefined) {
            continue;
        }

        const item = state.items[itemIndex]!;
        const groupIndexes = groupIndex.get(getGroupKey(item)) ?? [itemIndex];
        const stationNames = collectGroupStationNames(state, groupIndexes);
        if (stationNames.length === 0) {
            continue;
        }

        getOrCreateCandidateGroup(candidatesByGroupKey, item, stationNames);
    }

    const visitedGroups = new Set<string>();
    for (const item of state.items) {
        const internalCode = normalizeCode(item.internalCode);
        if (internalCode.length === 0 || document.circulation[internalCode]) {
            continue;
        }

        const groupKey = getGroupKey(item);
        if (visitedGroups.has(groupKey)) {
            continue;
        }
        visitedGroups.add(groupKey);

        const itemIndex = codeIndex.get(normalizeCode(item.code));
        if (itemIndex === undefined) {
            continue;
        }

        const groupIndexes = groupIndex.get(groupKey) ?? [itemIndex];
        const stationNames = collectGroupStationNames(state, groupIndexes);
        if (stationNames.length === 0) {
            continue;
        }

        getOrCreateCandidateGroup(candidatesByGroupKey, item, stationNames);
    }

    return [...candidatesByGroupKey.values()].sort((left, right) =>
        left.groupKey.localeCompare(right.groupKey, 'zh-Hans-CN')
    );
}

function collectPendingStationBoardTaskKeys() {
    const pendingKeys = new Set<string>();

    for (const task of listPendingTasksByExecutor(
        FETCH_STATION_BOARD_TASK_EXECUTOR
    )) {
        try {
            const args = parseFetchStationBoardTaskArgs(
                JSON.parse(task.arguments) as unknown
            );
            pendingKeys.add(
                buildStationBoardTaskKey(args.serviceDate, args.stationTelecode)
            );
        } catch {
            continue;
        }
    }

    return pendingKeys;
}

async function executeDispatchStationBoardTasks() {
    const config = useConfig();
    const scheduleFilePath = config.data.assets.schedule.file;
    const document = loadScheduleDocument(scheduleFilePath);
    if (!document?.published) {
        logger.warn(`skip schedule_not_found file=${scheduleFilePath}`);
        return;
    }

    const state = document.published;
    const currentDate = getCurrentDateString();
    if (state.date !== currentDate) {
        logger.warn(
            `skip_non_current_schedule scheduleDate=${state.date} currentDate=${currentDate} file=${scheduleFilePath}`
        );
        return;
    }

    const candidateGroups = collectCandidates(document, state);
    if (candidateGroups.length === 0) {
        logger.info(
            `done candidateGroups=0 queueEntries=${document.routeRefreshQueue.length} currentDate=${state.date}`
        );
        return;
    }

    const selectedStations = await solveStationCover(
        candidateGroups.map((candidate) => ({
            key: candidate.groupKey,
            stations: candidate.stationNames
        }))
    );
    const telecodesByStationName = buildStationTelecodeLookup(
        await fetchAllStations()
    );

    const executionTime = getNowSeconds();
    const pendingTaskKeys = collectPendingStationBoardTaskKeys();
    const retryRemaining = Math.max(
        0,
        config.task.circulation.stationBoard.maxAttempts - 1
    );
    let createdTasks = 0;
    let reusedTasks = 0;
    let skippedNotFound = 0;
    let skippedAmbiguous = 0;

    for (const stationName of selectedStations) {
        const telecodes = telecodesByStationName.get(stationName);
        if (!telecodes || telecodes.size === 0) {
            skippedNotFound += 1;
            logger.warn(
                `station_telecode_not_found stationName=${stationName}`
            );
            continue;
        }
        if (telecodes.size !== 1) {
            skippedAmbiguous += 1;
            logger.warn(
                `station_telecode_ambiguous stationName=${stationName} telecodes=${JSON.stringify(Array.from(telecodes).sort())}`
            );
            continue;
        }

        const stationTelecode = Array.from(telecodes)[0]!;
        const taskKey = buildStationBoardTaskKey(state.date, stationTelecode);
        if (pendingTaskKeys.has(taskKey)) {
            reusedTasks += 1;
            continue;
        }

        enqueueTask(
            FETCH_STATION_BOARD_TASK_EXECUTOR,
            {
                serviceDate: state.date,
                stationName,
                stationTelecode,
                retryRemaining
            },
            executionTime
        );
        pendingTaskKeys.add(taskKey);
        createdTasks += 1;
    }

    logger.info(
        `done candidateGroups=${candidateGroups.length} selectedStations=${selectedStations.length} createdTasks=${createdTasks} reusedTasks=${reusedTasks} skippedNotFound=${skippedNotFound} skippedAmbiguous=${skippedAmbiguous} retryRemaining=${retryRemaining} currentDate=${state.date}`
    );
}

export function registerDispatchStationBoardTasksExecutor() {
    if (registered) {
        return;
    }

    registerTaskExecutor(DISPATCH_STATION_BOARD_TASKS_EXECUTOR, async () => {
        await executeDispatchStationBoardTasks();
    });
    registered = true;
    logger.info(`registered executor=${DISPATCH_STATION_BOARD_TASKS_EXECUTOR}`);
}
