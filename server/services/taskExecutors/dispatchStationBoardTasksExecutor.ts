import useConfig from '~/server/config';
import getLogger from '~/server/libs/log4js';
import {
    buildStationBoardTaskKey,
    buildStationTelecodeLookup,
    enqueueOrReuseStationBoardFetchTask,
    listPendingStationBoardTasks,
    normalizeStationName,
    resolveStationTelecodeFromLookup
} from '~/server/services/stationBoardTaskDispatch';
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
import fetchAllStations from '~/server/utils/12306/network/fetchAllStations';
import {
    getCurrentTrainProvenanceTaskRunId,
    recordCurrentTrainProvenanceEvent
} from '~/server/services/trainProvenanceRecorder';
import { recordStationBoardDispatchResult } from '~/server/services/trainProvenanceStore';

export const DISPATCH_STATION_BOARD_TASKS_EXECUTOR =
    'dispatch_station_board_tasks';

interface StationBoardCandidateGroup {
    groupKey: string;
    departureStationNames: string[];
}

interface StationBoardDispatchTaskDetail {
    stationName: string;
    stationTelecode: string;
    action:
        | 'created'
        | 'reused'
        | 'station_telecode_not_found'
        | 'station_telecode_ambiguous';
    schedulerTaskId: number | null;
    ambiguousTelecodes: string[];
}

const logger = getLogger('task-executor:dispatch-station-board-tasks');

let registered = false;

function resolveItemDepartureStationName(item: ScheduleItem) {
    const startStationName = normalizeStationName(item.startStation);
    if (startStationName.length > 0) {
        return startStationName;
    }

    const explicitStartStop = item.stops.find((stop) => stop.isStart);
    const fallbackStop = explicitStartStop ?? item.stops[0] ?? null;
    return normalizeStationName(fallbackStop?.stationName ?? '');
}

function collectGroupDepartureStationNames(
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

        const stationName = resolveItemDepartureStationName(item);
        if (stationName.length === 0 || seenStations.has(stationName)) {
            continue;
        }

        seenStations.add(stationName);
        stationNames.push(stationName);
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
        const seenStations = new Set(existing.departureStationNames);
        for (const stationName of stationNames) {
            if (seenStations.has(stationName)) {
                continue;
            }

            seenStations.add(stationName);
            existing.departureStationNames.push(stationName);
        }
        return existing;
    }

    const candidate: StationBoardCandidateGroup = {
        groupKey,
        departureStationNames: [...stationNames]
    };
    candidatesByGroupKey.set(groupKey, candidate);
    return candidate;
}

function collectSelectedStationNames(
    candidateGroups: readonly StationBoardCandidateGroup[]
) {
    const selectedStations = new Set<string>();

    for (const candidateGroup of candidateGroups) {
        for (const stationName of candidateGroup.departureStationNames) {
            if (stationName.length > 0) {
                selectedStations.add(stationName);
            }
        }
    }

    // 12306 only returns circulation data when the queried station is the
    // train's departure station, so we query every distinct departure station
    // instead of solving a minimum cover from intermediate stops.
    return [...selectedStations].sort((left, right) =>
        left.localeCompare(right, 'zh-Hans-CN')
    );
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
        const stationNames = collectGroupDepartureStationNames(
            state,
            groupIndexes
        );
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
        const stationNames = collectGroupDepartureStationNames(
            state,
            groupIndexes
        );
        if (stationNames.length === 0) {
            continue;
        }

        getOrCreateCandidateGroup(candidatesByGroupKey, item, stationNames);
    }

    return [...candidatesByGroupKey.values()].sort((left, right) =>
        left.groupKey.localeCompare(right.groupKey, 'zh-Hans-CN')
    );
}
function maybeRecordDispatchResult(input: {
    serviceDate: string;
    candidateGroupCount: number;
    selectedStations: string[];
    createdTaskCount: number;
    reusedTaskCount: number;
    skippedNotFoundCount: number;
    skippedAmbiguousCount: number;
    detail: StationBoardDispatchTaskDetail[];
}) {
    const taskRunId = getCurrentTrainProvenanceTaskRunId();
    if (taskRunId === null) {
        return;
    }

    recordStationBoardDispatchResult({
        taskRunId,
        serviceDate: input.serviceDate,
        candidateGroupCount: input.candidateGroupCount,
        selectedStations: input.selectedStations,
        createdTaskCount: input.createdTaskCount,
        reusedTaskCount: input.reusedTaskCount,
        skippedNotFoundCount: input.skippedNotFoundCount,
        skippedAmbiguousCount: input.skippedAmbiguousCount,
        detail: input.detail
    });
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

    const selectedStations = collectSelectedStationNames(candidateGroups);
    const telecodesByStationName = buildStationTelecodeLookup(
        await fetchAllStations()
    );

    const executionTime = getNowSeconds();
    const pendingTasks = listPendingStationBoardTasks();
    const retryRemaining = Math.max(
        0,
        config.task.circulation.stationBoard.maxAttempts - 1
    );
    let createdTasks = 0;
    let reusedTasks = 0;
    let skippedNotFound = 0;
    let skippedAmbiguous = 0;
    const dispatchDetail: StationBoardDispatchTaskDetail[] = [];

    recordCurrentTrainProvenanceEvent({
        serviceDate: state.date,
        eventType: 'station_board_cover_solved',
        result: 'selected',
        payload: {
            candidateGroupCount: candidateGroups.length,
            selectedStations
        }
    });

    for (const stationName of selectedStations) {
        const telecodeResolution = resolveStationTelecodeFromLookup(
            telecodesByStationName,
            stationName
        );
        if (telecodeResolution.status === 'not_found') {
            skippedNotFound += 1;
            dispatchDetail.push({
                stationName,
                stationTelecode: '',
                action: 'station_telecode_not_found',
                schedulerTaskId: null,
                ambiguousTelecodes: []
            });
            logger.warn(
                `station_telecode_not_found stationName=${stationName}`
            );
            continue;
        }
        if (telecodeResolution.status === 'ambiguous') {
            skippedAmbiguous += 1;
            dispatchDetail.push({
                stationName,
                stationTelecode: '',
                action: 'station_telecode_ambiguous',
                schedulerTaskId: null,
                ambiguousTelecodes: telecodeResolution.ambiguousTelecodes
            });
            logger.warn(
                `station_telecode_ambiguous stationName=${stationName} telecodes=${JSON.stringify(telecodeResolution.ambiguousTelecodes)}`
            );
            continue;
        }

        const stationTelecode = telecodeResolution.stationTelecode;
        const taskKey = buildStationBoardTaskKey(state.date, stationTelecode);
        const pendingTask = pendingTasks.get(taskKey) ?? null;
        if (pendingTask) {
            reusedTasks += 1;
            dispatchDetail.push({
                stationName,
                stationTelecode,
                action: 'reused',
                schedulerTaskId: pendingTask.taskId,
                ambiguousTelecodes: []
            });
            continue;
        }

        const stationBoardTask = enqueueOrReuseStationBoardFetchTask({
            serviceDate: state.date,
            stationName,
            stationTelecode,
            executionTime,
            retryRemaining
        });
        pendingTasks.set(taskKey, {
            taskId: stationBoardTask.schedulerTaskId
        });
        createdTasks += 1;
        dispatchDetail.push({
            stationName,
            stationTelecode,
            action: 'created',
            schedulerTaskId: stationBoardTask.schedulerTaskId,
            ambiguousTelecodes: []
        });
    }

    maybeRecordDispatchResult({
        serviceDate: state.date,
        candidateGroupCount: candidateGroups.length,
        selectedStations,
        createdTaskCount: createdTasks,
        reusedTaskCount: reusedTasks,
        skippedNotFoundCount: skippedNotFound,
        skippedAmbiguousCount: skippedAmbiguous,
        detail: dispatchDetail
    });

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
