import useConfig from '~/server/config';
import getLogger from '~/server/libs/log4js';
import { syncCurrentDayTimetableIdsForTrainCodes } from '~/server/services/currentDayTimetableIdSync';
import { syncConfirmedTimetableHistoryForScheduleStateKind } from '~/server/services/timetableHistoryStore';
import normalizeCode from '~/server/utils/12306/normalizeCode';
import {
    getScheduleDatabaseFilePath,
    syncPublishedScheduleSnapshotFromItems
} from '~/server/utils/12306/scheduleProbe/sqliteStore';
import runScheduleProbe from './scheduleProbe/runner';
import { getGroupKey } from './scheduleProbe/taskHelpers';
import { LEGACY_SCHEDULE_JSON_PATH } from './scheduleProbe/constants';
import {
    appendRouteRefreshQueueTrainCodes,
    ensureScheduleDocumentMigrated,
    loadOrInitBuildingScheduleState,
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

function listConfirmedTrainCodesFromBuildState(state: ScheduleState) {
    const startedAtSeconds = Math.floor(state.startedAtMs / 1000);
    if (!Number.isInteger(startedAtSeconds) || startedAtSeconds <= 0) {
        return [];
    }

    const confirmedGroupKeys = new Set<string>();
    const confirmedTrainCodes: string[] = [];

    for (const item of state.items) {
        if (
            item.lastRouteRefreshAt === null ||
            item.lastRouteRefreshAt < startedAtSeconds ||
            item.stops.length === 0
        ) {
            continue;
        }

        const groupKey = getGroupKey(item);
        if (confirmedGroupKeys.has(groupKey)) {
            continue;
        }

        confirmedGroupKeys.add(groupKey);
        confirmedTrainCodes.push(normalizeCode(item.code));
    }

    return confirmedTrainCodes;
}

function syncBuildConfirmedTimetableHistory(
    logger: ReturnType<typeof getLogger>,
    scheduleFilePath: string,
    promotedState: ScheduleState,
    confirmedTrainCodes: string[]
) {
    const syncResult = syncConfirmedTimetableHistoryForScheduleStateKind(
        'published',
        promotedState.date,
        confirmedTrainCodes,
        promotedState.generatedAt
    );
    logger.info(
        `history_sync date=${promotedState.date} confirmedGroups=${syncResult.confirmedGroups} confirmedTrainCodes=${syncResult.confirmedTrainCodes} skippedGroups=${syncResult.skippedGroups} createdContents=${syncResult.createdContents} insertedCoverages=${syncResult.insertedCoverages} updatedCoverages=${syncResult.updatedCoverages} deletedCoverages=${syncResult.deletedCoverages} noopedCoverages=${syncResult.noopedCoverages}`
    );
    const appendedQueueEntries = appendRouteRefreshQueueTrainCodes(
        scheduleFilePath,
        promotedState.date,
        syncResult.routeRefreshTrainCodes,
        promotedState.generatedAt
    );
    logger.info(
        `route_refresh_queue_sync date=${promotedState.date} candidates=${syncResult.routeRefreshTrainCodes.length} appended=${appendedQueueEntries.length}`
    );

    const timetableIdSyncResult = syncCurrentDayTimetableIdsForTrainCodes(
        promotedState.date,
        confirmedTrainCodes
    );
    logger.info(
        `timetable_id_sync date=${promotedState.date} scannedTrainCodes=${timetableIdSyncResult.scannedTrainCodes} changedTrainCodes=${timetableIdSyncResult.changedTrainCodes} updatedDailyRows=${timetableIdSyncResult.updatedDailyRows} deletedDailyRows=${timetableIdSyncResult.deletedDailyRows} updatedProbeRows=${timetableIdSyncResult.updatedProbeRows} deletedProbeRows=${timetableIdSyncResult.deletedProbeRows}`
    );
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
    const scheduleFilePath = LEGACY_SCHEDULE_JSON_PATH;
    const scheduleDatabasePath = getScheduleDatabaseFilePath();
    ensureScheduleDocumentMigrated();
    const snapshotStartedAtMs = Date.now();
    const publishedState = syncPublishedScheduleSnapshotFromItems();
    logger.info(
        `published_snapshot_sync date=${publishedState?.date ?? 'null'} items=${publishedState?.items.length ?? 0} durationMs=${Date.now() - snapshotStartedAtMs}`
    );

    const { state, resumed, reason, publishPending } =
        loadOrInitBuildingScheduleState(scheduleFilePath, runtimeConfig);
    const runId = `${state.date}-${Date.now()}`;

    if (reason === 'reuse_published_terminal') {
        logger.info(
            `skip_reuse_published runId=${runId} status=${state.status} date=${state.date} file=${scheduleDatabasePath}`
        );
        return buildResultFromState(state, resumed, scheduleDatabasePath);
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
        `start runId=${runId} resumed=${resumed} reason=${reason} date=${state.date} file=${scheduleDatabasePath} retryAttempts=${runtimeConfig.retryAttempts} maxBatchSize=${runtimeConfig.maxBatchSize} checkpointFlushEvery=${runtimeConfig.checkpointFlushEvery} prefixRules=${JSON.stringify(runtimeConfig.prefixRules)}`
    );

    if (publishPending) {
        const confirmedTrainCodes =
            listConfirmedTrainCodesFromBuildState(state);
        const promotedState = promoteBuildingScheduleState(
            scheduleFilePath,
            state
        );
        syncBuildConfirmedTimetableHistory(
            logger,
            scheduleFilePath,
            promotedState,
            confirmedTrainCodes
        );
        logger.info(
            `finish_pending_publish runId=${runId} status=${promotedState.status} date=${promotedState.date} durationMs=${promotedState.stats.durationMs} apiCalls=${promotedState.progress.counters.apiCalls} apiRetries=${promotedState.progress.counters.apiRetries} processedKeywords=${promotedState.progress.discoverProcessed.length} pendingKeywords=${promotedState.progress.discoverQueue.length} rawItems=${promotedState.stats.rawItems} uniqueItems=${promotedState.stats.uniqueItems} failedKeywords=${promotedState.progress.failedKeywords.length} failedEnrichCodes=${promotedState.progress.failedEnrichCodes.length}`
        );
        return buildResultFromState(
            promotedState,
            resumed,
            scheduleDatabasePath
        );
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
            `fatal runId=${runId} date=${state.date} file=${scheduleDatabasePath} error=${message}`
        );
        throw error;
    }

    const confirmedTrainCodes = listConfirmedTrainCodesFromBuildState(state);
    const promotedState = promoteBuildingScheduleState(scheduleFilePath, state);
    syncBuildConfirmedTimetableHistory(
        logger,
        scheduleFilePath,
        promotedState,
        confirmedTrainCodes
    );

    logger.info(
        `finish runId=${runId} status=${promotedState.status} date=${promotedState.date} durationMs=${promotedState.stats.durationMs} apiCalls=${promotedState.progress.counters.apiCalls} apiRetries=${promotedState.progress.counters.apiRetries} processedKeywords=${promotedState.progress.discoverProcessed.length} pendingKeywords=${promotedState.progress.discoverQueue.length} rawItems=${promotedState.stats.rawItems} uniqueItems=${promotedState.stats.uniqueItems} failedKeywords=${promotedState.progress.failedKeywords.length} failedEnrichCodes=${promotedState.progress.failedEnrichCodes.length}`
    );

    return buildResultFromState(promotedState, resumed, scheduleDatabasePath);
}
