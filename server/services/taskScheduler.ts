import '~/server/libs/database/task';
import getLogger from '~/server/libs/log4js';
import useConfig from '~/server/config';
import importSqlBatch from '~/server/utils/sql/importSqlBatch';
import { createPreparedSqlStore } from '~/server/libs/database/prepared';
import { getTaskExecutor } from '~/server/services/taskExecutorRegistry';
import type { TaskRecord } from '~/server/services/taskQueue';
import {
    estimateIdleTaskDurationMs,
    observeIdleTaskDurationMs
} from '~/server/services/idleTaskEstimator';
import getNowSeconds from '~/server/utils/time/getNowSeconds';

const logger = getLogger('task-scheduler');
type TaskSqlKey = 'completeTask' | 'selectTasks';
const taskSql = importSqlBatch('tasks/queries') as Record<TaskSqlKey, string>;
const taskStatements = createPreparedSqlStore<TaskSqlKey>({
    dbName: 'task',
    scope: 'tasks/queries',
    sql: taskSql
});

let started = false;
let isChecking = false;
let timer: NodeJS.Timeout | null = null;

function parseTaskArguments(rawArguments: string):
    | {
          ok: true;
          argumentsValue: unknown;
      }
    | {
          ok: false;
          message: string;
      } {
    try {
        return {
            ok: true,
            argumentsValue: JSON.parse(rawArguments)
        };
    } catch (error) {
        return {
            ok: false,
            message: error instanceof Error ? error.message : String(error)
        };
    }
}

interface RunTaskResult {
    durationMs: number;
    executed: boolean;
}

type TaskExecutedObserver = (task: TaskRecord, result: RunTaskResult) => void;

interface PlannedIdleTask {
    task: TaskRecord;
}

interface IdleTaskPlanResult {
    tasks: PlannedIdleTask[];
    skippedBudget: number;
}

async function runSingleTask(task: TaskRecord): Promise<RunTaskResult> {
    const startedAtMs = Date.now();

    const parsedArguments = parseTaskArguments(task.arguments);
    if (!parsedArguments.ok) {
        logger.error(
            `invalid_task_arguments id=${task.id} executor=${task.executor} error=${parsedArguments.message}`
        );
        taskStatements.run('completeTask', task.id);
        return {
            durationMs: Math.max(0, Date.now() - startedAtMs),
            executed: false
        };
    }

    const executor = getTaskExecutor(task.executor);
    if (!executor) {
        logger.error(
            `executor_not_registered id=${task.id} executor=${task.executor}`
        );
        taskStatements.run('completeTask', task.id);
        return {
            durationMs: Math.max(0, Date.now() - startedAtMs),
            executed: false
        };
    }

    try {
        await executor(parsedArguments.argumentsValue);
    } catch (error) {
        const message =
            error instanceof Error
                ? `${error.name}: ${error.message}`
                : String(error);
        logger.error(
            `task_failed id=${task.id} executor=${task.executor} error=${message}`
        );
    } finally {
        taskStatements.run('completeTask', task.id);
    }

    return {
        durationMs: Math.max(0, Date.now() - startedAtMs),
        executed: true
    };
}

async function runTaskGroupSequentially(
    tasks: TaskRecord[],
    onTaskExecuted?: TaskExecutedObserver
): Promise<void> {
    for (const task of tasks) {
        const result = await runSingleTask(task);
        if (onTaskExecuted) {
            onTaskExecuted(task, result);
        }
    }
}

async function runPlannedIdleTaskGroupSequentially(
    tasks: PlannedIdleTask[],
    nextTickAtMs: number,
    onTaskExecuted?: TaskExecutedObserver
): Promise<number> {
    let skippedPrestart = 0;

    for (const [index, plannedTask] of tasks.entries()) {
        const remainingMs = Math.max(0, nextTickAtMs - Date.now());
        const estimatedDurationMs = estimateIdleTaskDurationMs(
            plannedTask.task.executor,
            plannedTask.task.expectedDurationMs
        );
        if (estimatedDurationMs >= remainingMs) {
            skippedPrestart += tasks.length - index;
            logger.info(
                `idle_task_skip_prestart id=${plannedTask.task.id} executor=${plannedTask.task.executor} estimatedDurationMs=${estimatedDurationMs} remainingMs=${remainingMs}`
            );
            break;
        }

        logger.info(
            `idle_task_run_prestart id=${plannedTask.task.id} executor=${plannedTask.task.executor} estimatedDurationMs=${estimatedDurationMs} remainingMs=${remainingMs}`
        );
        const result = await runSingleTask(plannedTask.task);
        if (onTaskExecuted) {
            onTaskExecuted(plannedTask.task, result);
        }
    }

    return skippedPrestart;
}

async function runTasksByExecutor(
    tasks: TaskRecord[],
    onTaskExecuted?: TaskExecutedObserver
): Promise<void> {
    if (tasks.length === 0) {
        return;
    }

    const taskGroupsByExecutor = new Map<string, TaskRecord[]>();
    for (const task of tasks) {
        const group = taskGroupsByExecutor.get(task.executor);
        if (group) {
            group.push(task);
            continue;
        }
        taskGroupsByExecutor.set(task.executor, [task]);
    }

    await Promise.all(
        Array.from(taskGroupsByExecutor.values()).map((group) =>
            runTaskGroupSequentially(group, onTaskExecuted)
        )
    );
}

function estimateTaskDurationMs(task: TaskRecord): number {
    return estimateIdleTaskDurationMs(task.executor, task.expectedDurationMs);
}

function planRunnableIdleTasks(
    dueIdleTasks: TaskRecord[],
    nextTickAtMs: number
): IdleTaskPlanResult {
    const plannedTasks: PlannedIdleTask[] = [];
    const plannedDurationByExecutor = new Map<string, number>();
    const blockedExecutors = new Set<string>();
    let skippedBudget = 0;

    for (const task of dueIdleTasks) {
        const remainingMs = Math.max(0, nextTickAtMs - Date.now());
        if (blockedExecutors.has(task.executor)) {
            skippedBudget += 1;
            logger.info(
                `idle_task_skip_blocked_executor id=${task.id} executor=${task.executor} remainingMs=${remainingMs}`
            );
            continue;
        }

        const estimatedDurationMs = estimateTaskDurationMs(task);
        const currentExecutorDurationMs =
            plannedDurationByExecutor.get(task.executor) ?? 0;
        const nextExecutorDurationMs =
            currentExecutorDurationMs + estimatedDurationMs;
        let nextCriticalPathMs = nextExecutorDurationMs;

        for (const plannedDurationMs of plannedDurationByExecutor.values()) {
            if (plannedDurationMs > nextCriticalPathMs) {
                nextCriticalPathMs = plannedDurationMs;
            }
        }

        if (nextCriticalPathMs >= remainingMs) {
            blockedExecutors.add(task.executor);
            skippedBudget += 1;
            logger.info(
                `idle_task_skip_budget id=${task.id} executor=${task.executor} estimatedDurationMs=${estimatedDurationMs} executorPlannedDurationMs=${currentExecutorDurationMs} nextExecutorDurationMs=${nextExecutorDurationMs} criticalPathMs=${nextCriticalPathMs} remainingMs=${remainingMs}`
            );
            continue;
        }

        plannedDurationByExecutor.set(task.executor, nextExecutorDurationMs);
        plannedTasks.push({
            task
        });
        logger.info(
            `idle_task_plan id=${task.id} executor=${task.executor} estimatedDurationMs=${estimatedDurationMs} executorPlannedDurationMs=${currentExecutorDurationMs} nextExecutorDurationMs=${nextExecutorDurationMs} criticalPathMs=${nextCriticalPathMs} remainingMs=${remainingMs}`
        );
    }

    return {
        tasks: plannedTasks,
        skippedBudget
    };
}

async function runPlannedIdleTasksByExecutor(
    tasks: PlannedIdleTask[],
    nextTickAtMs: number,
    onTaskExecuted?: TaskExecutedObserver
): Promise<number> {
    if (tasks.length === 0) {
        return 0;
    }

    const taskGroupsByExecutor = new Map<string, PlannedIdleTask[]>();
    for (const plannedTask of tasks) {
        const group = taskGroupsByExecutor.get(plannedTask.task.executor);
        if (group) {
            group.push(plannedTask);
            continue;
        }
        taskGroupsByExecutor.set(plannedTask.task.executor, [plannedTask]);
    }

    const skippedPrestartCounts = await Promise.all(
        Array.from(taskGroupsByExecutor.values()).map((group) =>
            runPlannedIdleTaskGroupSequentially(
                group,
                nextTickAtMs,
                onTaskExecuted
            )
        )
    );

    return skippedPrestartCounts.reduce((total, count) => total + count, 0);
}

async function tick(): Promise<void> {
    if (isChecking) {
        logger.info('skip_overlapped_tick');
        return;
    }

    isChecking = true;
    const startedAt = Date.now();
    try {
        const config = useConfig();
        const nowSeconds = getNowSeconds();
        const nextTickAtMs = startedAt + config.task.scheduler.pollIntervalMs;
        const maxTasksPerQuery = config.task.scheduler.maxTasksPerQuery;
        const dueNormalTasks = taskStatements.all<TaskRecord>(
            'selectTasks',
            0,
            nowSeconds,
            maxTasksPerQuery
        );

        logger.info(`tick_start dueNormalTasks=${dueNormalTasks.length}`);
        await runTasksByExecutor(dueNormalTasks);

        const maxIdleTasksPerTick = config.task.scheduler.idle.maxTasksPerTick;
        const dueIdleTasks = taskStatements.all<TaskRecord>(
            'selectTasks',
            1,
            nowSeconds,
            maxIdleTasksPerTick
        );

        let idleExecuted = 0;
        let idleSkippedBudget = 0;
        let idleSkippedPrestart = 0;
        const idlePlan = planRunnableIdleTasks(dueIdleTasks, nextTickAtMs);
        idleSkippedBudget = idlePlan.skippedBudget;

        idleSkippedPrestart = await runPlannedIdleTasksByExecutor(
            idlePlan.tasks,
            nextTickAtMs,
            (task, result) => {
                idleExecuted += 1;
                if (result.executed) {
                    observeIdleTaskDurationMs(task.executor, result.durationMs);
                }
            }
        );

        logger.info(
            `tick_finish dueNormalTasks=${dueNormalTasks.length} dueIdleTasks=${dueIdleTasks.length} runnableIdleTasks=${idlePlan.tasks.length} idleExecuted=${idleExecuted} idleSkippedBudget=${idleSkippedBudget} idleSkippedPrestart=${idleSkippedPrestart} maxTasksPerQuery=${maxTasksPerQuery} maxIdleTasksPerTick=${maxIdleTasksPerTick} durationMs=${Date.now() - startedAt}`
        );
    } catch (error) {
        const message =
            error instanceof Error
                ? `${error.name}: ${error.message}`
                : String(error);
        logger.error(`tick_error error=${message}`);
    } finally {
        isChecking = false;
    }
}

export function startTaskScheduler() {
    if (started) {
        logger.info('already_started');
        return;
    }

    const pollIntervalMs = useConfig().task.scheduler.pollIntervalMs;
    timer = setInterval(() => {
        void tick();
    }, pollIntervalMs);
    started = true;

    logger.info(`started pollIntervalMs=${pollIntervalMs} autoStart=true`);
    void tick();
}

export function stopTaskScheduler() {
    if (timer) {
        clearInterval(timer);
        timer = null;
    }
    started = false;
    isChecking = false;
    logger.info('stopped');
}
