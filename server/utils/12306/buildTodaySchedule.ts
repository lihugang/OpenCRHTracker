import useConfig from '~/server/config';
import getLogger from '~/server/libs/log4js';
import { syncCurrentDayTimetableIdsForTrainCodes } from '~/server/services/currentDayTimetableIdSync';
import { syncConfirmedTimetableHistoryForScheduleStateKind } from '~/server/services/timetableHistoryStore';
import {
    trainCodeKey,
    type TrainCodeParts
} from '~/server/utils/12306/trainCode';
import {
    formatExternalServiceDate,
    formatExternalTrainCodes
} from '~/server/utils/internal/boundaries';
import { toUnixSecondsFromShanghaiDayOffset } from '~/server/utils/date/shanghaiDateTime';
import {
    getScheduleDatabaseFilePath,
    syncPublishedScheduleSnapshotFromItems
} from '~/server/utils/12306/scheduleProbe/sqliteStore';
import runScheduleProbe from './scheduleProbe/runner';
import { getGroupKey } from './scheduleProbe/taskHelpers';
import {
    appendRouteRefreshQueueTrainCodes,
    loadOrInitBuildingScheduleState,
    promoteBuildingScheduleState,
    saveBuildingScheduleState
} from './scheduleProbe/stateStore';
import { mergeSupplementTrainItems } from './scheduleProbe/mergeSupplementTrainItems';
import { listSupplementTrainEntries } from '~/server/services/supplementTrainRegistryStore';
import type {
    BuildScheduleResult,
    BuildScheduleStationPlatformTaskCandidate,
    ScheduleState,
    ScheduleProbeRuntimeConfig
} from './scheduleProbe/types';

function buildResultFromState(
    state: ScheduleState,
    resumed: boolean,
    file: string,
    stationPlatformTaskCandidates: BuildScheduleStationPlatformTaskCandidate[] = []
): BuildScheduleResult {
    return {
        ok: state.status === 'done',
        resumed,
        date: formatExternalServiceDate(state.date),
        file,
        stationPlatformTaskCandidates,
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
        failedEnrichCodes: formatExternalTrainCodes(
            state.progress.failedEnrichCodes
        )
    };
}

function listEnrichedItemsFromBuildState(state: ScheduleState) {
    const startedAtSeconds = Math.floor(state.startedAtMs / 1000);
    if (!Number.isInteger(startedAtSeconds) || startedAtSeconds <= 0) {
        return [];
    }

    const enrichedGroupKeys = new Set<string>();
    const enrichedItems: ScheduleState['items'] = [];

    for (const item of state.items) {
        if (
            item.lastRouteRefreshAt === null ||
            item.lastRouteRefreshAt < startedAtSeconds ||
            item.stops.length === 0
        ) {
            continue;
        }

        const groupKey = getGroupKey(item);
        if (enrichedGroupKeys.has(groupKey)) {
            continue;
        }

        enrichedGroupKeys.add(groupKey);
        enrichedItems.push(item);
    }

    return enrichedItems;
}

function listStationPlatformTaskCandidatesFromBuildState(
    state: ScheduleState
): BuildScheduleStationPlatformTaskCandidate[] {
    return listEnrichedItemsFromBuildState(state).flatMap((item) => {
        if (item.startAt === null) {
            return [];
        }

        return [
            {
                trainCode: item.code,
                trainInternalCode: item.internalCode,
                startAt: toUnixSecondsFromShanghaiDayOffset(
                    state.date,
                    item.startAt
                ),
                stopCount: item.stops.length
            }
        ];
    });
}

function listConfirmedTrainCodesFromBuildState(state: ScheduleState) {
    return listEnrichedItemsFromBuildState(state).map((item) => item.code);
}

function syncBuildConfirmedTimetableHistory(
    logger: ReturnType<typeof getLogger>,
    promotedState: ScheduleState,
    confirmedTrainCodes: TrainCodeParts[]
) {
    const syncResult = syncConfirmedTimetableHistoryForScheduleStateKind(
        'published',
        promotedState.date,
        confirmedTrainCodes,
        promotedState.generatedAt
    );
    logger.info(
        `history_sync date=${formatExternalServiceDate(promotedState.date)} confirmedGroups=${syncResult.confirmedGroups} confirmedTrainCodes=${syncResult.confirmedTrainCodes} skippedGroups=${syncResult.skippedGroups} createdContents=${syncResult.createdContents} insertedCoverages=${syncResult.insertedCoverages} updatedCoverages=${syncResult.updatedCoverages} deletedCoverages=${syncResult.deletedCoverages} noopedCoverages=${syncResult.noopedCoverages}`
    );
    const appendedQueueEntries = appendRouteRefreshQueueTrainCodes(
        promotedState.date,
        syncResult.timetableChangedTrainCodes,
        promotedState.generatedAt
    );
    logger.info(
        `route_refresh_queue_sync date=${formatExternalServiceDate(promotedState.date)} candidates=${syncResult.timetableChangedTrainCodes.length} appended=${appendedQueueEntries.length}`
    );

    const timetableIdSyncResult = syncCurrentDayTimetableIdsForTrainCodes(
        promotedState.date,
        confirmedTrainCodes
    );
    logger.info(
        `timetable_id_sync date=${formatExternalServiceDate(promotedState.date)} scannedTrainCodes=${timetableIdSyncResult.scannedTrainCodes} changedTrainCodes=${timetableIdSyncResult.changedTrainCodes} updatedDailyRows=${timetableIdSyncResult.updatedDailyRows} deletedDailyRows=${timetableIdSyncResult.deletedDailyRows}`
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
    const scheduleDatabasePath = getScheduleDatabaseFilePath();
    const snapshotStartedAtMs = Date.now();
    const publishedState = syncPublishedScheduleSnapshotFromItems();
    logger.info(
        `published_snapshot_sync date=${publishedState ? formatExternalServiceDate(publishedState.date) : 'null'} items=${publishedState?.items.length ?? 0} durationMs=${Date.now() - snapshotStartedAtMs}`
    );

    const { state, resumed, reason, publishPending } =
        loadOrInitBuildingScheduleState(runtimeConfig);
    const runId = `${formatExternalServiceDate(state.date)}-${Date.now()}`;

    if (reason === 'reuse_published_terminal') {
        logger.info(
            `skip_reuse_published runId=${runId} status=${state.status} date=${formatExternalServiceDate(state.date)} file=${scheduleDatabasePath}`
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
                      trainCodeKey(item.code),
                      item
                  ])
              )
            : undefined;

    logger.info(
        `start runId=${runId} resumed=${resumed} reason=${reason} date=${formatExternalServiceDate(state.date)} file=${scheduleDatabasePath} retryAttempts=${runtimeConfig.retryAttempts} maxBatchSize=${runtimeConfig.maxBatchSize} checkpointFlushEvery=${runtimeConfig.checkpointFlushEvery} prefixRules=${JSON.stringify(runtimeConfig.prefixRules)}`
    );

    if (publishPending) {
        const confirmedTrainCodes =
            listConfirmedTrainCodesFromBuildState(state);
        const stationPlatformTaskCandidates =
            listStationPlatformTaskCandidatesFromBuildState(state);
        const promotedState = promoteBuildingScheduleState(state);
        syncBuildConfirmedTimetableHistory(
            logger,
            promotedState,
            confirmedTrainCodes
        );
        logger.info(
            `finish_pending_publish runId=${runId} status=${promotedState.status} date=${formatExternalServiceDate(promotedState.date)} durationMs=${promotedState.stats.durationMs} apiCalls=${promotedState.progress.counters.apiCalls} apiRetries=${promotedState.progress.counters.apiRetries} processedKeywords=${promotedState.progress.discoverProcessed.length} pendingKeywords=${promotedState.progress.discoverQueue.length} rawItems=${promotedState.stats.rawItems} uniqueItems=${promotedState.stats.uniqueItems} failedKeywords=${promotedState.progress.failedKeywords.length} failedEnrichCodes=${promotedState.progress.failedEnrichCodes.length}`
        );
        return buildResultFromState(
            promotedState,
            resumed,
            scheduleDatabasePath,
            stationPlatformTaskCandidates
        );
    }

    saveBuildingScheduleState(state);

    try {
        await runScheduleProbe(
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

    const supplementMergeResult = mergeSupplementTrainItems(
        state,
        listSupplementTrainEntries(),
        runtimeConfig.prefixRules
    );
    saveBuildingScheduleState(state);
    logger.info(
        `supplement_trains_merged runId=${runId} addedItems=${supplementMergeResult.addedItems} skippedCollisions=${supplementMergeResult.skippedCollisions} uniqueItems=${state.stats.uniqueItems}`
    );

    const confirmedTrainCodes = listConfirmedTrainCodesFromBuildState(state);
    const stationPlatformTaskCandidates =
        listStationPlatformTaskCandidatesFromBuildState(state);
    const promotedState = promoteBuildingScheduleState(state);
    syncBuildConfirmedTimetableHistory(
        logger,
        promotedState,
        confirmedTrainCodes
    );

    logger.info(
        `finish runId=${runId} status=${promotedState.status} date=${promotedState.date} durationMs=${promotedState.stats.durationMs} apiCalls=${promotedState.progress.counters.apiCalls} apiRetries=${promotedState.progress.counters.apiRetries} processedKeywords=${promotedState.progress.discoverProcessed.length} pendingKeywords=${promotedState.progress.discoverQueue.length} rawItems=${promotedState.stats.rawItems} uniqueItems=${promotedState.stats.uniqueItems} failedKeywords=${promotedState.progress.failedKeywords.length} failedEnrichCodes=${promotedState.progress.failedEnrichCodes.length}`
    );

    return buildResultFromState(
        promotedState,
        resumed,
        scheduleDatabasePath,
        stationPlatformTaskCandidates
    );
}
