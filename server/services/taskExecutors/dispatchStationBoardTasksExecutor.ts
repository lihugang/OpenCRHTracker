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
import type { ScheduleState } from '~/server/utils/12306/scheduleProbe/types';
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

interface StationBoardStationCandidate {
    stationName: string;
    stationTelecode: string;
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

function collectScheduleStationCandidates(
    state: ScheduleState
): StationBoardStationCandidate[] {
    const candidatesByKey = new Map<string, StationBoardStationCandidate>();

    for (const item of state.items) {
        for (const stop of item.stops) {
            const stationName = normalizeStationName(stop.stationName);
            const stationTelecode = normalizeCode(stop.stationTelecode);
            if (stationName.length === 0 && stationTelecode.length === 0) {
                continue;
            }

            const candidateKey =
                stationTelecode.length > 0
                    ? `telecode:${stationTelecode}`
                    : `name:${stationName}`;
            if (candidatesByKey.has(candidateKey)) {
                continue;
            }

            candidatesByKey.set(candidateKey, {
                stationName,
                stationTelecode
            });
        }
    }

    return [...candidatesByKey.values()].sort((left, right) =>
        (left.stationTelecode || left.stationName).localeCompare(
            right.stationTelecode || right.stationName,
            'zh-Hans-CN'
        )
    );
}

function buildSelectedStationNames(
    candidates: StationBoardStationCandidate[]
): string[] {
    const stationNamesByKey = new Map<string, string>();

    for (const candidate of candidates) {
        const stationName = normalizeStationName(candidate.stationName);
        const stationTelecode = normalizeCode(candidate.stationTelecode);
        if (stationName.length === 0 && stationTelecode.length === 0) {
            continue;
        }

        const key =
            stationTelecode.length > 0
                ? `telecode:${stationTelecode}`
                : `name:${stationName}`;
        if (stationNamesByKey.has(key)) {
            continue;
        }

        stationNamesByKey.set(key, stationName || stationTelecode);
    }

    return [...stationNamesByKey.values()];
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

    const stationCandidates = collectScheduleStationCandidates(state);
    if (stationCandidates.length === 0) {
        logger.info(
            `done stationCandidates=0 scheduleItems=${state.items.length} currentDate=${state.date}`
        );
        return;
    }

    const telecodesByStationName = stationCandidates.some(
        (candidate) => candidate.stationTelecode.length === 0
    )
        ? buildStationTelecodeLookup(await fetchAllStations())
        : new Map();
    const selectedStations = buildSelectedStationNames(stationCandidates);

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
        eventType: 'station_board_schedule_stations_collected',
        result: 'selected',
        payload: {
            candidateGroupCount: stationCandidates.length,
            selectedStations
        }
    });

    for (const candidate of stationCandidates) {
        const stationName = candidate.stationName;
        const stationTelecode = candidate.stationTelecode;
        const telecodeResolution =
            stationTelecode.length > 0
                ? {
                      status: 'resolved' as const,
                      stationTelecode,
                      ambiguousTelecodes: [] as []
                  }
                : resolveStationTelecodeFromLookup(
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

        const resolvedStationTelecode = telecodeResolution.stationTelecode;
        const taskKey = buildStationBoardTaskKey(
            state.date,
            resolvedStationTelecode
        );
        const pendingTask = pendingTasks.get(taskKey) ?? null;
        if (pendingTask) {
            reusedTasks += 1;
            dispatchDetail.push({
                stationName,
                stationTelecode: resolvedStationTelecode,
                action: 'reused',
                schedulerTaskId: pendingTask.taskId,
                ambiguousTelecodes: []
            });
            continue;
        }

        const stationBoardTask = enqueueOrReuseStationBoardFetchTask({
            serviceDate: state.date,
            stationName,
            stationTelecode: resolvedStationTelecode,
            executionTime,
            retryRemaining
        });
        pendingTasks.set(taskKey, {
            taskId: stationBoardTask.schedulerTaskId
        });
        createdTasks += 1;
        dispatchDetail.push({
            stationName,
            stationTelecode: resolvedStationTelecode,
            action: 'created',
            schedulerTaskId: stationBoardTask.schedulerTaskId,
            ambiguousTelecodes: []
        });
    }

    maybeRecordDispatchResult({
        serviceDate: state.date,
        candidateGroupCount: stationCandidates.length,
        selectedStations,
        createdTaskCount: createdTasks,
        reusedTaskCount: reusedTasks,
        skippedNotFoundCount: skippedNotFound,
        skippedAmbiguousCount: skippedAmbiguous,
        detail: dispatchDetail
    });

    logger.info(
        `done stationCandidates=${stationCandidates.length} selectedStations=${selectedStations.length} createdTasks=${createdTasks} reusedTasks=${reusedTasks} skippedNotFound=${skippedNotFound} skippedAmbiguous=${skippedAmbiguous} retryRemaining=${retryRemaining} currentDate=${state.date}`
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
