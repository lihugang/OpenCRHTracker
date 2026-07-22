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
import { enqueueTask } from '~/server/services/taskQueue';
import { getStationBoardIdleTaskOptions } from '~/server/services/stationBoardTaskScheduling';
import { loadPublishedScheduleStateSummary } from '~/server/utils/12306/scheduleProbe/stateStore';
import {
    getScheduleDatabaseFilePath,
    listScheduleCandidateItemsForCodes,
    listScheduleRouteRefreshQueueEntries,
    listScheduleStopStationCandidateRowsByStateKind,
    loadStationBoardLastFullSweepDate,
    saveStationBoardLastFullSweepDate,
    type ScheduleStopStationCandidateRow
} from '~/server/utils/12306/scheduleProbe/sqliteStore';
import getCurrentDateString from '~/server/utils/date/getCurrentDateString';
import {
    getShanghaiDayStartUnixSeconds,
    SHANGHAI_DAY_SECONDS
} from '~/server/utils/date/shanghaiDateTime';
import getNowSeconds from '~/server/utils/time/getNowSeconds';
import normalizeCode from '~/server/utils/12306/normalizeCode';
import uniqueNormalizedCodes from '~/server/utils/12306/uniqueNormalizedCodes';
import fetchAllStations from '~/server/utils/12306/network/fetchAllStations';
import {
    getCurrentTrainProvenanceTaskRunId,
    recordCurrentTrainProvenanceEvent
} from '~/server/services/trainProvenanceRecorder';
import { recordStationBoardDispatchResult } from '~/server/services/trainProvenanceStore';

export const DISPATCH_STATION_BOARD_TASKS_EXECUTOR =
    'dispatch_station_board_tasks';

export type StationBoardDispatchMode = 'auto' | 'full';

interface StationBoardDispatchTaskArgs {
    mode: StationBoardDispatchMode;
}

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

function parseTaskArgs(raw: unknown): StationBoardDispatchTaskArgs {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
        throw new Error('task arguments must be an object');
    }

    const mode = (raw as { mode?: unknown }).mode;
    if (mode === undefined || mode === 'auto') {
        return { mode: 'auto' };
    }
    if (mode === 'full') {
        return { mode: 'full' };
    }
    throw new Error('task arguments mode must be auto or full');
}

function collectStationCandidates(
    rows: readonly Pick<
        ScheduleStopStationCandidateRow,
        'stationName' | 'stationTelecode'
    >[]
): StationBoardStationCandidate[] {
    const candidatesByKey = new Map<string, StationBoardStationCandidate>();

    for (const row of rows) {
        const stationName = normalizeStationName(row.stationName);
        const stationTelecode = normalizeCode(row.stationTelecode);
        if (stationName.length === 0 && stationTelecode.length === 0) {
            continue;
        }

        const candidateKey =
            stationTelecode.length > 0
                ? `telecode:${stationTelecode}`
                : `name:${stationName}`;
        if (!candidatesByKey.has(candidateKey)) {
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

function collectIncrementalStationCandidates(serviceDate: string) {
    const queueEntries = listScheduleRouteRefreshQueueEntries(serviceDate);
    const targetTrainCodes = uniqueNormalizedCodes(
        queueEntries.map((entry) => entry.trainCode)
    );
    const initialItems = listScheduleCandidateItemsForCodes('published', {
        aliasCodes: targetTrainCodes
    });
    const items = listScheduleCandidateItemsForCodes('published', {
        aliasCodes: targetTrainCodes,
        internalCodes: uniqueNormalizedCodes(
            initialItems.map((item) => item.internalCode)
        )
    });

    return {
        targetTrainCodes,
        matchedItemCount: items.length,
        candidates: collectStationCandidates(
            items.flatMap((item) =>
                item.stops.map((stop) => ({
                    stationName: stop.stationName,
                    stationTelecode: stop.stationTelecode
                }))
            )
        )
    };
}

function isFullSweepDue(serviceDate: string, intervalDays: number) {
    const lastFullSweepDate = loadStationBoardLastFullSweepDate();
    if (!lastFullSweepDate) {
        return {
            due: true,
            lastFullSweepDate: null,
            reason: 'initial_full_sweep'
        } as const;
    }

    const elapsedDays = Math.floor(
        (getShanghaiDayStartUnixSeconds(serviceDate) -
            getShanghaiDayStartUnixSeconds(lastFullSweepDate)) /
            SHANGHAI_DAY_SECONDS
    );
    return {
        due: elapsedDays >= intervalDays,
        lastFullSweepDate,
        reason:
            elapsedDays >= intervalDays ? 'periodic_full_sweep' : 'incremental'
    } as const;
}

function buildSelectedStationNames(
    candidates: StationBoardStationCandidate[]
): string[] {
    return candidates.map(
        (candidate) => candidate.stationName || candidate.stationTelecode
    );
}

function buildResolvedStationCandidateKey(
    stationName: string,
    stationTelecode: string
) {
    const normalizedStationTelecode = normalizeCode(stationTelecode);
    return normalizedStationTelecode.length > 0
        ? `telecode:${normalizedStationTelecode}`
        : `name:${normalizeStationName(stationName)}`;
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

export function enqueueStationBoardDispatchTask(
    mode: StationBoardDispatchMode = 'auto',
    executionTime = getNowSeconds()
) {
    return enqueueTask(
        DISPATCH_STATION_BOARD_TASKS_EXECUTOR,
        { mode },
        executionTime,
        getStationBoardIdleTaskOptions(DISPATCH_STATION_BOARD_TASKS_EXECUTOR)
    );
}

async function executeDispatchStationBoardTasks(rawArgs: unknown) {
    const args = parseTaskArgs(rawArgs);
    const config = useConfig();
    const scheduleFilePath = getScheduleDatabaseFilePath();
    const published = loadPublishedScheduleStateSummary();
    if (!published) {
        logger.warn(`skip schedule_not_found file=${scheduleFilePath}`);
        return;
    }

    const currentDate = getCurrentDateString();
    if (published.date !== currentDate) {
        logger.warn(
            `skip_non_current_schedule scheduleDate=${published.date} currentDate=${currentDate} file=${scheduleFilePath}`
        );
        return;
    }

    const fullSweepState = isFullSweepDue(
        published.date,
        config.task.circulation.stationBoard.fullSweepIntervalDays
    );
    const isFullSweep = args.mode === 'full' || fullSweepState.due;
    const dispatchReason =
        args.mode === 'full' ? 'manual_full_sweep' : fullSweepState.reason;
    const incremental = isFullSweep
        ? { targetTrainCodes: [], matchedItemCount: 0, candidates: [] }
        : collectIncrementalStationCandidates(published.date);
    const stationCandidates = isFullSweep
        ? collectStationCandidates(
              listScheduleStopStationCandidateRowsByStateKind('published')
          )
        : incremental.candidates;
    const selectedStations = buildSelectedStationNames(stationCandidates);

    recordCurrentTrainProvenanceEvent({
        serviceDate: published.date,
        eventType: 'station_board_schedule_stations_collected',
        result: stationCandidates.length > 0 ? 'selected' : 'empty',
        payload: {
            requestedMode: args.mode,
            effectiveMode: isFullSweep ? 'full' : 'incremental',
            dispatchReason,
            fullSweepIntervalDays:
                config.task.circulation.stationBoard.fullSweepIntervalDays,
            lastFullSweepDate: fullSweepState.lastFullSweepDate,
            targetTrainCodeCount: incremental.targetTrainCodes.length,
            targetTrainCodes: incremental.targetTrainCodes,
            matchedItemCount: incremental.matchedItemCount,
            candidateGroupCount: stationCandidates.length,
            selectedStations
        }
    });

    if (stationCandidates.length === 0) {
        maybeRecordDispatchResult({
            serviceDate: published.date,
            candidateGroupCount: 0,
            selectedStations: [],
            createdTaskCount: 0,
            reusedTaskCount: 0,
            skippedNotFoundCount: 0,
            skippedAmbiguousCount: 0,
            detail: []
        });
        logger.info(
            `done mode=${args.mode} effectiveMode=${isFullSweep ? 'full' : 'incremental'} reason=${dispatchReason} stationCandidates=0 targetTrainCodes=${incremental.targetTrainCodes.length} scheduleItems=${published.uniqueItems} currentDate=${published.date}`
        );
        return;
    }

    const telecodesByStationName = stationCandidates.some(
        (candidate) => candidate.stationTelecode.length === 0
    )
        ? buildStationTelecodeLookup(await fetchAllStations())
        : new Map();
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
    const dispatchedStationKeys = new Set<string>();

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
            const stationKey = buildResolvedStationCandidateKey(
                stationName,
                ''
            );
            if (dispatchedStationKeys.has(stationKey)) {
                continue;
            }
            dispatchedStationKeys.add(stationKey);
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
            const stationKey = buildResolvedStationCandidateKey(
                stationName,
                ''
            );
            if (dispatchedStationKeys.has(stationKey)) {
                continue;
            }
            dispatchedStationKeys.add(stationKey);
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
        const stationKey = buildResolvedStationCandidateKey(
            stationName,
            resolvedStationTelecode
        );
        if (dispatchedStationKeys.has(stationKey)) {
            continue;
        }
        dispatchedStationKeys.add(stationKey);
        const taskKey = buildStationBoardTaskKey(
            published.date,
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
            serviceDate: published.date,
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
        serviceDate: published.date,
        candidateGroupCount: stationCandidates.length,
        selectedStations,
        createdTaskCount: createdTasks,
        reusedTaskCount: reusedTasks,
        skippedNotFoundCount: skippedNotFound,
        skippedAmbiguousCount: skippedAmbiguous,
        detail: dispatchDetail
    });

    if (isFullSweep) {
        saveStationBoardLastFullSweepDate(published.date);
    }

    logger.info(
        `done mode=${args.mode} effectiveMode=${isFullSweep ? 'full' : 'incremental'} reason=${dispatchReason} targetTrainCodes=${incremental.targetTrainCodes.length} stationCandidates=${stationCandidates.length} selectedStations=${selectedStations.length} createdTasks=${createdTasks} reusedTasks=${reusedTasks} skippedNotFound=${skippedNotFound} skippedAmbiguous=${skippedAmbiguous} retryRemaining=${retryRemaining} currentDate=${published.date}`
    );
}

export function registerDispatchStationBoardTasksExecutor() {
    if (registered) {
        return;
    }

    registerTaskExecutor(
        DISPATCH_STATION_BOARD_TASKS_EXECUTOR,
        executeDispatchStationBoardTasks
    );
    registered = true;
    logger.info(`registered executor=${DISPATCH_STATION_BOARD_TASKS_EXECUTOR}`);
}
