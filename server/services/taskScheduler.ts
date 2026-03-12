import '~/server/libs/database/task';
import getLogger from '~/server/libs/log4js';
import useConfig from '~/server/config';
import importSqlBatch from '~/server/utils/sql/importSqlBatch';
import { createPreparedSqlStore } from '~/server/libs/database/prepared';
import { getTaskExecutor } from '~/server/services/taskExecutorRegistry';
import type { TaskRecord } from '~/server/services/taskQueue';
import { observeIdleTaskDurationMs } from '~/server/services/idleTaskEstimator';
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

        const runnableIdleTasks: TaskRecord[] = [];
        let idleExecuted = 0;
        let idleSkippedBudget = 0;

        for (const task of dueIdleTasks) {
            const remainingMs = Math.max(0, nextTickAtMs - Date.now());
            if (task.expectedDurationMs < remainingMs) {
                logger.info(
                    `idle_task_run id=${task.id} executor=${task.executor} expectedDurationMs=${task.expectedDurationMs} remainingMs=${remainingMs}`
                );
                runnableIdleTasks.push(task);
                continue;
            }

            idleSkippedBudget += 1;
            logger.info(
                `idle_task_skip_budget id=${task.id} executor=${task.executor} expectedDurationMs=${task.expectedDurationMs} remainingMs=${remainingMs}`
            );
        }
        await runTasksByExecutor(runnableIdleTasks, (task, result) => {
            idleExecuted += 1;
            if (result.executed) {
                observeIdleTaskDurationMs(task.executor, result.durationMs);
            }
        });

        logger.info(
            `tick_finish dueNormalTasks=${dueNormalTasks.length} dueIdleTasks=${dueIdleTasks.length} runnableIdleTasks=${runnableIdleTasks.length} idleExecuted=${idleExecuted} idleSkippedBudget=${idleSkippedBudget} maxTasksPerQuery=${maxTasksPerQuery} maxIdleTasksPerTick=${maxIdleTasksPerTick} durationMs=${Date.now() - startedAt}`
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
