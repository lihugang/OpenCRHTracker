import useConfig from '~/server/config';
import getLogger from '~/server/libs/log4js';
import {
    record12306TraceSummary,
    runWith12306TraceScope,
    with12306TraceFunction
} from '~/server/services/requestMetrics12306Trace';
import normalizeCode from '~/server/utils/12306/normalizeCode';
import { ensureAssetFile } from '~/server/utils/dataAssets/store';
import runScheduleProbe from './scheduleProbe/runner';
import {
    createInitialScheduleDocument,
    loadOrInitBuildingScheduleState,
    loadPublishedScheduleState,
    promoteBuildingScheduleState,
    saveBuildingScheduleState
} from './scheduleProbe/stateStore';
import type {
    BuildScheduleResult,
    ScheduleState,
    ScheduleProbeRuntimeConfig
} from './scheduleProbe/types';

function buildResultFromState(
    state: ScheduleState,
    resumed: boolean,
    file: string
): BuildScheduleResult {
    return {
        ok: state.status === 'done',
        resumed,
        date: state.date,
        file,
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

export default async function buildTodaySchedule(): Promise<BuildScheduleResult> {
    const logger = getLogger('schedule-probe');
    const config = useConfig();
    const runtimeConfig: ScheduleProbeRuntimeConfig = {
        retryAttempts: config.spider.scheduleProbe.retryAttempts,
        maxBatchSize: config.spider.scheduleProbe.maxBatchSize,
        checkpointFlushEvery: config.spider.scheduleProbe.checkpointFlushEvery,
        prefixRules: config.spider.scheduleProbe.prefixRules
    };
    const defaultDocument = createInitialScheduleDocument();
    const ensuredAsset = await ensureAssetFile('schedule', {
        defaultContent: `${JSON.stringify(defaultDocument, null, 4)}\n`
    });
    const scheduleFilePath = ensuredAsset.filePath;
    const publishedState = loadPublishedScheduleState(scheduleFilePath);

    const { state, resumed, reason, publishPending } =
        loadOrInitBuildingScheduleState(scheduleFilePath, runtimeConfig);
    const runId = `${state.date}-${Date.now()}`;
    return runWith12306TraceScope(
        {
            traceKey: `build-schedule:${runId}`,
            traceTitle: `构建当日运行图 ${state.date}`,
            traceSubtitle: 'build_today_schedule'
        },
        async () =>
            with12306TraceFunction<BuildScheduleResult>(
                {
                    title: '构建当日运行图',
                    functionName: 'buildTodaySchedule',
                    context: {
                        runId,
                        resumed,
                        reason,
                        date: state.date,
                        file: scheduleFilePath
                    },
                    getSuccessContext: (result) => ({
                        runId,
                        ok: result.ok,
                        date: result.date,
                        apiCalls: result.stats.apiCalls,
                        apiRetries: result.stats.apiRetries,
                        rawItems: result.stats.rawItems,
                        uniqueItems: result.stats.uniqueItems,
                        failedKeywords: result.failedKeywords.length,
                        failedEnrichCodes: result.failedEnrichCodes.length
                    }),
                    getSuccessLevel: (result) =>
                        result.ok ? 'INFO' : 'WARN',
                    getSuccessStatus: (result) =>
                        result.ok ? 'success' : 'warning'
                },
                async () => {
                    if (reason === 'reuse_published_terminal') {
                        logger.info(
                            `skip_reuse_published runId=${runId} status=${state.status} date=${state.date} file=${scheduleFilePath}`
                        );
                        const result = buildResultFromState(
                            state,
                            resumed,
                            scheduleFilePath
                        );
                        record12306TraceSummary({
                            title: '运行图构建跳过',
                            status: result.ok ? 'success' : 'warning',
                            level: result.ok ? 'INFO' : 'WARN',
                            message: '复用已完成的 published schedule',
                            context: {
                                runId,
                                reason,
                                date: result.date
                            }
                        });
                        return result;
                    }

                    const shouldReusePreviousRouteInfo =
                        reason === 'refresh_non_running' ||
                        reason === 'refresh_cross_day' ||
                        reason === 'refresh_scope_or_strategy_changed';
                    const preservedItemsByCode =
                        shouldReusePreviousRouteInfo && publishedState
                            ? new Map(
                                  publishedState.items.map((item) => [
                                      normalizeCode(item.code),
                                      item
                                  ])
                              )
                            : undefined;
                    logger.info(
                        `start runId=${runId} resumed=${resumed} reason=${reason} date=${state.date} file=${scheduleFilePath} retryAttempts=${runtimeConfig.retryAttempts} maxBatchSize=${runtimeConfig.maxBatchSize} checkpointFlushEvery=${runtimeConfig.checkpointFlushEvery} prefixRules=${JSON.stringify(runtimeConfig.prefixRules)}`
                    );

                    if (publishPending) {
                        const promotedState = promoteBuildingScheduleState(
                            scheduleFilePath,
                            state
                        );
                        logger.info(
                            `finish_pending_publish runId=${runId} status=${promotedState.status} date=${promotedState.date} durationMs=${promotedState.stats.durationMs} apiCalls=${promotedState.progress.counters.apiCalls} apiRetries=${promotedState.progress.counters.apiRetries} processedKeywords=${promotedState.progress.discoverProcessed.length} pendingKeywords=${promotedState.progress.discoverQueue.length} rawItems=${promotedState.stats.rawItems} uniqueItems=${promotedState.stats.uniqueItems} failedKeywords=${promotedState.progress.failedKeywords.length} failedEnrichCodes=${promotedState.progress.failedEnrichCodes.length}`
                        );
                        const result = buildResultFromState(
                            promotedState,
                            resumed,
                            scheduleFilePath
                        );
                        record12306TraceSummary({
                            title: '运行图构建完成待发布收尾',
                            status: result.ok ? 'success' : 'warning',
                            level: result.ok ? 'INFO' : 'WARN',
                            message: '完成 pending publish 阶段',
                            context: {
                                runId,
                                reason,
                                date: result.date
                            }
                        });
                        return result;
                    }

                    saveBuildingScheduleState(scheduleFilePath, state);

                    try {
                        await runScheduleProbe(
                            scheduleFilePath,
                            state,
                            runtimeConfig,
                            runId,
                            preservedItemsByCode
                        );
                    } catch (error) {
                        const message =
                            error instanceof Error
                                ? `${error.name}: ${error.message}`
                                : String(error);
                        logger.error(
                            `fatal runId=${runId} date=${state.date} file=${scheduleFilePath} error=${message}`
                        );
                        record12306TraceSummary({
                            title: '运行图构建失败',
                            status: 'error',
                            level: 'ERROR',
                            message,
                            context: {
                                runId,
                                date: state.date,
                                file: scheduleFilePath
                            }
                        });
                        throw error;
                    }

                    const promotedState = promoteBuildingScheduleState(
                        scheduleFilePath,
                        state
                    );

                    logger.info(
                        `finish runId=${runId} status=${promotedState.status} date=${promotedState.date} durationMs=${promotedState.stats.durationMs} apiCalls=${promotedState.progress.counters.apiCalls} apiRetries=${promotedState.progress.counters.apiRetries} processedKeywords=${promotedState.progress.discoverProcessed.length} pendingKeywords=${promotedState.progress.discoverQueue.length} rawItems=${promotedState.stats.rawItems} uniqueItems=${promotedState.stats.uniqueItems} failedKeywords=${promotedState.progress.failedKeywords.length} failedEnrichCodes=${promotedState.progress.failedEnrichCodes.length}`
                    );

                    const result = buildResultFromState(
                        promotedState,
                        resumed,
                        scheduleFilePath
                    );
                    record12306TraceSummary({
                        title: '运行图构建完成',
                        status: result.ok ? 'success' : 'warning',
                        level: result.ok ? 'INFO' : 'WARN',
                        message: '完成 buildTodaySchedule',
                        context: {
                            runId,
                            date: result.date,
                            apiCalls: result.stats.apiCalls,
                            apiRetries: result.stats.apiRetries,
                            rawItems: result.stats.rawItems,
                            uniqueItems: result.stats.uniqueItems,
                            failedKeywords: result.failedKeywords.length,
                            failedEnrichCodes: result.failedEnrichCodes.length
                        }
                    });

                    return result;
                }
            )
    );
}
