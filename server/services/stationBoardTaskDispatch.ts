import useConfig from '~/server/config';
import { getCurrentTaskExecutionContext } from '~/server/services/taskExecutionContext';
import {
    enqueueTask,
    listPendingTasksByExecutor
} from '~/server/services/taskQueue';
import { getStationBoardIdleTaskOptions } from '~/server/services/stationBoardTaskScheduling';
import {
    FETCH_STATION_BOARD_TASK_EXECUTOR,
    parseFetchStationBoardTaskArgs,
    type FetchStationBoardTaskArgs
} from '~/server/services/taskExecutors/fetchStationBoardTaskExecutor';
import fetchAllStations, {
    type AllStationRow
} from '~/server/utils/12306/network/fetchAllStations';
import normalizeCode from '~/server/utils/12306/normalizeCode';
import getNowSeconds from '~/server/utils/time/getNowSeconds';

export interface PendingStationBoardTask {
    taskId: number;
}

export type StationTelecodeLookup = Map<string, Set<string>>;

export type StationTelecodeResolution =
    | {
          status: 'resolved';
          stationTelecode: string;
          ambiguousTelecodes: [];
      }
    | {
          status: 'not_found';
          stationTelecode: '';
          ambiguousTelecodes: [];
      }
    | {
          status: 'ambiguous';
          stationTelecode: '';
          ambiguousTelecodes: string[];
      };

export interface EnqueueOrReuseStationBoardFetchTaskInput {
    serviceDate: string;
    stationName: string;
    stationTelecode: string;
    executionTime?: number;
    retryRemaining?: number;
    parentSchedulerTaskId?: number | null;
}

export interface EnqueueOrReuseStationBoardFetchTaskResult {
    action: 'created' | 'reused';
    schedulerTaskId: number;
}

export function normalizeStationName(value: string) {
    return value.trim();
}

export function buildStationBoardTaskKey(
    serviceDate: string,
    stationTelecode: string
) {
    return `${serviceDate}:${normalizeCode(stationTelecode)}`;
}

export function buildStationTelecodeLookup(stations: AllStationRow[]) {
    const telecodesByStationName: StationTelecodeLookup = new Map();

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

export function resolveStationTelecodeFromLookup(
    telecodesByStationName: ReadonlyMap<string, ReadonlySet<string>>,
    stationName: string
): StationTelecodeResolution {
    const telecodes = telecodesByStationName.get(
        normalizeStationName(stationName)
    );
    if (!telecodes || telecodes.size === 0) {
        return {
            status: 'not_found',
            stationTelecode: '',
            ambiguousTelecodes: []
        };
    }

    if (telecodes.size !== 1) {
        return {
            status: 'ambiguous',
            stationTelecode: '',
            ambiguousTelecodes: Array.from(telecodes).sort()
        };
    }

    return {
        status: 'resolved',
        stationTelecode: Array.from(telecodes)[0]!,
        ambiguousTelecodes: []
    };
}

export async function resolveStationTelecodeByStationName(
    stationName: string
): Promise<StationTelecodeResolution> {
    return resolveStationTelecodeFromLookup(
        buildStationTelecodeLookup(await fetchAllStations()),
        stationName
    );
}

export function listPendingStationBoardTasks() {
    const pendingTasks = new Map<string, PendingStationBoardTask>();

    for (const task of listPendingTasksByExecutor(
        FETCH_STATION_BOARD_TASK_EXECUTOR
    )) {
        try {
            const args = parseFetchStationBoardTaskArgs(
                JSON.parse(task.arguments) as unknown
            );
            pendingTasks.set(
                buildStationBoardTaskKey(
                    args.serviceDate,
                    args.stationTelecode
                ),
                {
                    taskId: task.id
                }
            );
        } catch {
            continue;
        }
    }

    return pendingTasks;
}

function resolveFetchTaskRetryRemaining(
    retryRemaining: number | undefined
): number {
    if (
        typeof retryRemaining === 'number' &&
        Number.isInteger(retryRemaining) &&
        retryRemaining >= 0
    ) {
        return retryRemaining;
    }

    return Math.max(
        0,
        useConfig().task.circulation.stationBoard.maxAttempts - 1
    );
}

function resolveFetchTaskParentSchedulerTaskId(
    parentSchedulerTaskId: number | null | undefined
) {
    if (
        typeof parentSchedulerTaskId === 'number' &&
        Number.isInteger(parentSchedulerTaskId) &&
        parentSchedulerTaskId > 0
    ) {
        return parentSchedulerTaskId;
    }

    return getCurrentTaskExecutionContext()?.taskId ?? null;
}

function buildFetchStationBoardTaskArgs(
    input: EnqueueOrReuseStationBoardFetchTaskInput
): FetchStationBoardTaskArgs {
    return {
        serviceDate: input.serviceDate,
        stationName: normalizeStationName(input.stationName),
        stationTelecode: normalizeCode(input.stationTelecode),
        retryRemaining: resolveFetchTaskRetryRemaining(input.retryRemaining),
        parentSchedulerTaskId: resolveFetchTaskParentSchedulerTaskId(
            input.parentSchedulerTaskId
        )
    };
}

export function enqueueOrReuseStationBoardFetchTask(
    input: EnqueueOrReuseStationBoardFetchTaskInput
): EnqueueOrReuseStationBoardFetchTaskResult {
    const args = buildFetchStationBoardTaskArgs(input);
    const taskKey = buildStationBoardTaskKey(
        args.serviceDate,
        args.stationTelecode
    );
    const pendingTask = listPendingStationBoardTasks().get(taskKey) ?? null;
    if (pendingTask) {
        return {
            action: 'reused',
            schedulerTaskId: pendingTask.taskId
        };
    }

    const executionTime =
        typeof input.executionTime === 'number' &&
        Number.isInteger(input.executionTime) &&
        input.executionTime >= 0
            ? input.executionTime
            : getNowSeconds();
    const taskId = enqueueTask(
        FETCH_STATION_BOARD_TASK_EXECUTOR,
        args,
        executionTime,
        getStationBoardIdleTaskOptions(FETCH_STATION_BOARD_TASK_EXECUTOR)
    );

    return {
        action: 'created',
        schedulerTaskId: taskId
    };
}
