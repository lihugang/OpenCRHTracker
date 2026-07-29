import fs from 'fs';
import path from 'path';
import getLogger from '~/server/libs/log4js';
import useDatabase from '~/server/libs/database/common';
import useConfig, { DATABASE_KEYS, type DatabaseKey } from '~/server/config';
import { registerTaskExecutor } from '~/server/services/taskExecutorRegistry';
import {
    listPendingTasksByExecutor,
    reconcileFuturePendingTaskByExecutorAndArgs,
    removePendingTasksByExecutorAndArgs
} from '~/server/services/taskQueue';
import {
    formatShanghaiDateTime,
    getNextDayExecutionTimeInShanghaiSeconds,
    getNextExecutionTimeInShanghaiSeconds,
    parseDailyTimeHHmm
} from '~/server/utils/date/shanghaiDateTime';

export const BACKUP_DATABASE_TASK_EXECUTOR = 'backup_database';

const logger = getLogger('task-executor:backup-database');
let registered = false;

interface BackupDatabaseTaskArgs {
    databaseKey: DatabaseKey;
    executesAt: string;
}

function isDatabaseKey(value: unknown): value is DatabaseKey {
    return (
        typeof value === 'string' &&
        (DATABASE_KEYS as readonly string[]).includes(value)
    );
}

function parseBackupDatabaseTaskArgs(raw: unknown): BackupDatabaseTaskArgs {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
        throw new Error('task arguments must be an object');
    }

    const args = raw as {
        databaseKey?: unknown;
        executesAt?: unknown;
    };
    if (!isDatabaseKey(args.databaseKey)) {
        throw new Error('task arguments databaseKey is invalid');
    }
    if (typeof args.executesAt !== 'string') {
        throw new Error('task arguments executesAt must be a string');
    }
    parseDailyTimeHHmm(args.executesAt);

    return {
        databaseKey: args.databaseKey,
        executesAt: args.executesAt
    };
}

function getTaskArgs(
    databaseKey: DatabaseKey,
    executesAt: string
): BackupDatabaseTaskArgs {
    return { databaseKey, executesAt };
}

function isBackupStillConfigured(args: BackupDatabaseTaskArgs): boolean {
    const backup = useConfig().data.databases[args.databaseKey].backup;
    return backup.enabled && backup.executesAt.includes(args.executesAt);
}

function ensureBackupDirectory(destinationPath: string): void {
    const directoryPath = path.dirname(destinationPath);
    if (!fs.existsSync(directoryPath)) {
        fs.mkdirSync(directoryPath, { recursive: true });
    }
}

function enqueueNextDatabaseBackupTask(args: BackupDatabaseTaskArgs): void {
    if (!isBackupStillConfigured(args)) {
        logger.info(
            `skip_next_task database=${args.databaseKey} executesAt=${args.executesAt} reason=disabled_or_removed`
        );
        return;
    }

    const nextExecutionTime = getNextDayExecutionTimeInShanghaiSeconds(
        Date.now(),
        args.executesAt
    );
    const result = reconcileFuturePendingTaskByExecutorAndArgs(
        BACKUP_DATABASE_TASK_EXECUTOR,
        args,
        nextExecutionTime
    );
    logger.info(
        `next_task_reconciled database=${args.databaseKey} executesAt=${args.executesAt} action=${result.action} taskId=${result.taskId} executionTime=${nextExecutionTime} executionTimeAsiaShanghai=${formatShanghaiDateTime(nextExecutionTime)} removedTaskIds=${JSON.stringify(result.removedTaskIds)}`
    );
}

async function executeBackupDatabaseTask(rawArgs: unknown): Promise<void> {
    const args = parseBackupDatabaseTaskArgs(rawArgs);
    let caughtError: unknown = null;

    try {
        if (!isBackupStillConfigured(args)) {
            logger.info(
                `skip_backup database=${args.databaseKey} executesAt=${args.executesAt} reason=disabled_or_removed`
            );
            return;
        }

        const databaseConfig = useConfig().data.databases[args.databaseKey];
        const destinationPath = path.resolve(databaseConfig.backup.path);
        ensureBackupDirectory(destinationPath);
        const result = await useDatabase(args.databaseKey).backup(
            destinationPath
        );
        logger.info(
            `backup_succeeded database=${args.databaseKey} source=${path.resolve(databaseConfig.path)} destination=${destinationPath} executesAt=${args.executesAt} totalPages=${result.totalPages} remainingPages=${result.remainingPages}`
        );
    } catch (error) {
        caughtError = error;
        const message =
            error instanceof Error
                ? `${error.name}: ${error.message}`
                : String(error);
        logger.error(
            `backup_failed database=${args.databaseKey} executesAt=${args.executesAt} error=${message}`
        );
    } finally {
        try {
            enqueueNextDatabaseBackupTask(args);
        } catch (error) {
            const message =
                error instanceof Error
                    ? `${error.name}: ${error.message}`
                    : String(error);
            logger.error(
                `enqueue_next_task_failed database=${args.databaseKey} executesAt=${args.executesAt} error=${message}`
            );
            if (!caughtError) {
                caughtError = error;
            }
        }
    }

    if (caughtError) {
        throw caughtError;
    }
}

export function synchronizeDatabaseBackupTasks(): string[] {
    const configuredArgs = new Map<string, BackupDatabaseTaskArgs>();
    for (const databaseKey of DATABASE_KEYS) {
        const backup = useConfig().data.databases[databaseKey].backup;
        if (!backup.enabled) {
            continue;
        }
        for (const executesAt of backup.executesAt) {
            const args = getTaskArgs(databaseKey, executesAt);
            configuredArgs.set(JSON.stringify(args), args);
        }
    }

    const removedTaskIds: number[] = [];
    for (const task of listPendingTasksByExecutor(
        BACKUP_DATABASE_TASK_EXECUTOR
    )) {
        let parsedArgs: BackupDatabaseTaskArgs;
        try {
            parsedArgs = parseBackupDatabaseTaskArgs(
                JSON.parse(task.arguments)
            );
        } catch {
            continue;
        }

        if (configuredArgs.has(JSON.stringify(parsedArgs))) {
            continue;
        }
        const removed = removePendingTasksByExecutorAndArgs(
            BACKUP_DATABASE_TASK_EXECUTOR,
            parsedArgs
        );
        removedTaskIds.push(...removed.removedTaskIds);
    }

    const taskSummaries: string[] = [];
    for (const args of configuredArgs.values()) {
        const executionTime = getNextExecutionTimeInShanghaiSeconds(
            Date.now(),
            args.executesAt
        );
        const result = reconcileFuturePendingTaskByExecutorAndArgs(
            BACKUP_DATABASE_TASK_EXECUTOR,
            args,
            executionTime
        );
        taskSummaries.push(
            `${args.databaseKey}:${args.executesAt}:${result.taskId}`
        );
        logger.info(
            `task_reconciled database=${args.databaseKey} executesAt=${args.executesAt} action=${result.action} taskId=${result.taskId} executionTime=${executionTime} executionTimeAsiaShanghai=${formatShanghaiDateTime(executionTime)} removedTaskIds=${JSON.stringify(result.removedTaskIds)} reusedExecutionTime=${result.reusedExecutionTime ?? 'null'}`
        );
    }

    if (removedTaskIds.length > 0) {
        logger.info(
            `obsolete_tasks_removed taskIds=${JSON.stringify(removedTaskIds)}`
        );
    }
    return taskSummaries;
}

export function registerBackupDatabaseTaskExecutor(): void {
    if (registered) {
        return;
    }

    registerTaskExecutor(BACKUP_DATABASE_TASK_EXECUTOR, async (args) => {
        await executeBackupDatabaseTask(args);
    });
    registered = true;
    logger.info(`registered executor=${BACKUP_DATABASE_TASK_EXECUTOR}`);
}
