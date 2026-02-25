import useConfig from '~/server/config';
import getLogger from '~/server/libs/log4js';
import runScheduleProbe from './scheduleProbe/runner';
import {
    loadOrInitScheduleState,
    saveScheduleState
} from './scheduleProbe/stateStore';
import type {
    BuildScheduleResult,
    ScheduleProbeRuntimeConfig
} from './scheduleProbe/types';

export default async function buildTodaySchedule(): Promise<BuildScheduleResult> {
    const logger = getLogger('schedule-probe');
    const config = useConfig();
    const scheduleFilePath = config.data.assets.schedule.file;
    const runtimeConfig: ScheduleProbeRuntimeConfig = {
        retryAttempts: config.spider.scheduleProbe.retryAttempts,
        maxBatchSize: config.spider.scheduleProbe.maxBatchSize,
        checkpointFlushEvery: config.spider.scheduleProbe.checkpointFlushEvery,
        prefixRules: config.spider.scheduleProbe.prefixRules
    };

    const { state, resumed, reason } = loadOrInitScheduleState(
        scheduleFilePath,
        runtimeConfig
    );
    const runId = `${state.date}-${Date.now()}`;
    logger.info(
        `[schedule-probe] start runId=${runId} resumed=${resumed} reason=${reason} date=${state.date} file=${scheduleFilePath} retryAttempts=${runtimeConfig.retryAttempts} maxBatchSize=${runtimeConfig.maxBatchSize} checkpointFlushEvery=${runtimeConfig.checkpointFlushEvery} prefixRules=${JSON.stringify(runtimeConfig.prefixRules)}`
    );

    saveScheduleState(scheduleFilePath, state);

    try {
        await runScheduleProbe(scheduleFilePath, state, runtimeConfig, runId);
    } catch (error) {
        const message =
            error instanceof Error ? `${error.name}: ${error.message}` : String(error);
        logger.error(
            `[schedule-probe] fatal runId=${runId} date=${state.date} file=${scheduleFilePath} error=${message}`
        );
        throw error;
    }

    logger.info(
        `[schedule-probe] finish runId=${runId} status=${state.status} date=${state.date} durationMs=${state.stats.durationMs} apiCalls=${state.progress.counters.apiCalls} apiRetries=${state.progress.counters.apiRetries} processedKeywords=${state.progress.discoverProcessed.length} pendingKeywords=${state.progress.discoverQueue.length} rawItems=${state.stats.rawItems} uniqueItems=${state.stats.uniqueItems} failedKeywords=${state.progress.failedKeywords.length} failedEnrichCodes=${state.progress.failedEnrichCodes.length}`
    );

    return {
        ok: state.status === 'done',
        resumed,
        date: state.date,
        file: scheduleFilePath,
        stats: {
            apiCalls: state.progress.counters.apiCalls,
            apiRetries: state.progress.counters.apiRetries,
            processedKeywords: state.progress.discoverProcessed.length,
            pendingKeywords: state.progress.discoverQueue.length,
            rawItems: state.stats.rawItems,
            uniqueItems: state.stats.uniqueItems,
            durationMs: state.stats.durationMs
        },
        failedKeywords: state.progress.failedKeywords,
        failedEnrichCodes: state.progress.failedEnrichCodes
    };
}
